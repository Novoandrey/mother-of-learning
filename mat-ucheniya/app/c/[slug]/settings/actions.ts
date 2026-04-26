'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'
import {
  getCampaignBySlug,
  parseItemDefaultPrices,
  type ItemDefaultPrices,
} from '@/lib/campaign'
import { getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { isHpMethod } from '@/lib/statblock'

/**
 * Merge hp_method into campaigns.settings jsonb without overwriting other keys.
 *
 * Defence-in-depth: requires the caller to be owner/dm of this campaign.
 * UI already hides the Save button from players (spec-006 increment 3), but
 * if a player crafts a POST manually we silently no-op rather than bubbling
 * an error. Hard RLS blocking comes in increment 4.
 *
 * No-op if the incoming value isn't a valid HpMethod.
 */
export async function updateCampaignHpMethod(slug: string, rawMethod: string) {
  if (!isHpMethod(rawMethod)) return

  // Silent auth gate — no redirects from inside the action's own code path.
  const result = await getCurrentUserAndProfile()
  if (!result || !result.profile || result.profile.must_change_password) return

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return

  const membership = await getMembership(campaign.id)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    return
  }

  const supabase = await createClient()

  const next = { ...campaign.settings, hp_method: rawMethod }

  await supabase.from('campaigns').update({ settings: next }).eq('id', campaign.id)
}

/**
 * Spec-015 follow-up (chat 70). Merge `item_default_prices` into
 * `campaigns.settings`. The incoming object is parsed via
 * `parseItemDefaultPrices` so any garbage shape is normalised, but a
 * malformed payload still updates the rest of the settings cleanly
 * (defaults fill in for unknown rarities).
 *
 * DM/owner-only. Silent no-op for players (UI is gated upstream).
 */
export async function updateItemDefaultPrices(
  slug: string,
  rawPrices: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await getCurrentUserAndProfile()
  if (!result || !result.profile || result.profile.must_change_password) {
    return { ok: false, error: 'Не авторизован' }
  }

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { ok: false, error: 'Кампания не найдена' }

  const membership = await getMembership(campaign.id)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    return { ok: false, error: 'Нужна роль ДМ' }
  }

  const parsed: ItemDefaultPrices = parseItemDefaultPrices(rawPrices)

  const supabase = await createClient()
  const next = { ...campaign.settings, item_default_prices: parsed }

  const { error } = await supabase
    .from('campaigns')
    .update({ settings: next })
    .eq('id', campaign.id)

  if (error) return { ok: false, error: error.message }

  // Item form lives inside /c/[slug]/items — refresh both the
  // settings page (so saved values reflect immediately) and the
  // catalog tree (covers /items/new and /items/[id]/edit too).
  revalidatePath(`/c/${slug}/items`, 'layout')

  return { ok: true }
}
