'use server'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
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
