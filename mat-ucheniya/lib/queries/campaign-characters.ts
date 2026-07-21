import type { SupabaseClient } from '@supabase/supabase-js'

export type CampaignCharacter = {
  id: string
  title: string
  primaryPortraitKey: string | null
  primaryPortraitCrop: { crop_x: number; crop_y: number; crop_zoom: number } | null
  /** True when the current user owns this PC via `node_pc_owners`. */
  isOwn: boolean
}

/**
 * Every PC in the campaign (spec-044, PL-4 / FR-001 + C-02): not just the
 * caller's. Each row carries `isOwn` so the list renders «Мои» on top and
 * «Остальные» below. Ownership is presentation metadata only: campaign
 * members may still perform the allowed economy actions for every PC.
 *
 * Runs client-side through the Telegram-minted session (RLS-scoped). Read is
 * gated by the node SELECT policy (member-wide, mirrors `is_member`); writes
 * are unaffected. `node_pc_owners` is embedded *without* `!inner` so non-owned
 * PCs are still returned — ownership is computed in JS, not used as a filter.
 * Own-first ordering is done here because PostgREST can't `ORDER BY` a
 * computed flag.
 */
export async function getCampaignCharacters(
  supabase: SupabaseClient,
  campaignId: string,
  userId: string,
): Promise<CampaignCharacter[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select(
      'id, title, node_types!inner(slug), node_pc_owners(user_id), character_portraits(r2_key, media_asset_id, is_primary, crop_x, crop_y, crop_zoom)',
    )
    .eq('node_types.slug', 'character')
    .eq('campaign_id', campaignId)
    .order('title')

  if (error) throw error

  const mapped: CampaignCharacter[] = (data ?? []).map((row) => {
    const r = row as {
      id: string
      title: string
      node_pc_owners?: Array<{ user_id: string }>
      character_portraits?: Array<{
        r2_key: string | null
        media_asset_id: string | null
        is_primary: boolean
        crop_x: number
        crop_y: number
        crop_zoom: number
      }>
    }
    const portraits = r.character_portraits ?? []
    const primary = portraits.find((p) => p.is_primary) ?? portraits[0] ?? null
    const isOwn = (r.node_pc_owners ?? []).some((owner) => owner.user_id === userId)
    return {
      id: r.id,
      title: r.title,
      primaryPortraitKey: primary?.r2_key ?? null,
      primaryPortraitCrop: primary
        ? { crop_x: Number(primary.crop_x), crop_y: Number(primary.crop_y), crop_zoom: Number(primary.crop_zoom) }
        : null,
      isOwn,
    }
  })

  // Own PCs first, then alphabetical within each group (the query already
  // sorted by title, so a stable partition preserves that order).
  return [
    ...mapped.filter((character) => character.isOwn),
    ...mapped.filter((character) => !character.isOwn),
  ]
}
