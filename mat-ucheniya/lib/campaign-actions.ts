'use server'

/**
 * Campaign initialization actions.
 *
 * `initializeCampaignFromTemplate` is the post-create hook that fills a
 * brand-new campaign with universal SRD data (conditions, exhaustion levels,
 * effect type stub). Without it, the encounter tracker is broken for any
 * campaign that wasn't `mat-ucheniya` — see DEBT-003.
 *
 * Currently the project has no UI to create a campaign (only the legacy
 * `mat-ucheniya` exists, plus owners are seeded via CLI). Once a Create
 * Campaign form lands, it MUST call this action right after the INSERT.
 */

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth'
import { seedCampaignSrd, type SeedResult } from '@/lib/seeds/dnd5e-srd'
import { invalidateSidebar } from '@/lib/sidebar-cache'

export type InitializeCampaignResult =
  | { ok: true; seed: SeedResult }
  | { ok: false; error: string }

/**
 * Idempotently apply the SRD template to a campaign. Authorised callers:
 * the campaign's owner or DM. Players are blocked even if RLS would allow
 * them to read the campaign — seeding is a DM-level operation.
 */
export async function initializeCampaignFromTemplate(
  campaignId: string,
): Promise<InitializeCampaignResult> {
  if (!campaignId) {
    return { ok: false, error: 'campaignId is required' }
  }

  const user = await getCurrentUser()
  if (!user) {
    return { ok: false, error: 'Не авторизован' }
  }

  const supabase = await createClient()

  // Verify the caller has DM-level rights on this campaign. We don't trust
  // RLS alone for write actions invoked from server code — explicit check
  // also gives us a clean Russian error message for the toast.
  const { data: membership, error: memberErr } = await supabase
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberErr) {
    return { ok: false, error: `Не удалось проверить права: ${memberErr.message}` }
  }
  if (!membership) {
    return { ok: false, error: 'Нет доступа к этой кампании' }
  }

  const role = (membership as { role: string }).role
  if (role !== 'owner' && role !== 'dm') {
    return { ok: false, error: 'Только владелец или ДМ может инициализировать SRD' }
  }

  try {
    const seed = await seedCampaignSrd(supabase, campaignId)
    // Seeding inserts node_types + nodes — both live in the sidebar cache.
    // Drop the cache so the freshly seeded campaign shows full content
    // immediately instead of waiting for the 60s TTL.
    invalidateSidebar(campaignId)
    return { ok: true, seed }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка сидинга'
    return { ok: false, error: message }
  }
}
