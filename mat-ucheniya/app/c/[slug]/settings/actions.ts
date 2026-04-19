'use server'

import { createClient } from '@/lib/supabase/server'
import { isHpMethod } from '@/lib/statblock'

/**
 * Merge hp_method into campaigns.settings jsonb without overwriting other keys.
 * No-op if the incoming value isn't a valid HpMethod.
 */
export async function updateCampaignHpMethod(slug: string, rawMethod: string) {
  if (!isHpMethod(rawMethod)) return

  const supabase = await createClient()

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, settings')
    .eq('slug', slug)
    .single()
  if (!campaign) return

  const current =
    campaign.settings && typeof campaign.settings === 'object' && !Array.isArray(campaign.settings)
      ? (campaign.settings as Record<string, unknown>)
      : {}

  const next = { ...current, hp_method: rawMethod }

  await supabase.from('campaigns').update({ settings: next }).eq('id', campaign.id)
}
