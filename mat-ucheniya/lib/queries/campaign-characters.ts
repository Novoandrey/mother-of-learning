import type { SupabaseClient } from '@supabase/supabase-js'

export type CampaignCharacter = {
  id: string
  title: string
  primaryPortraitKey: string | null
  /** Every campaign PC is actionable under the shared-character rule. */
  isOwn: boolean
}

/**
 * Every PC in the campaign (spec-044, PL-4 / FR-001 + C-02): not just the
 * caller's. Each row carries `isOwn` so the list renders «Мои» on top and
 * «Остальные» below, and so the per-PC surfaces can hide write controls on
 * PCs the caller doesn't own (E4 — view any, edit own).
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
): Promise<CampaignCharacter[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select(
      'id, title, node_types!inner(slug), node_pc_owners(user_id), character_portraits(r2_key, is_primary)',
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
      character_portraits?: Array<{ r2_key: string; is_primary: boolean }>
    }
    const portraits = r.character_portraits ?? []
    const primary = portraits.find((p) => p.is_primary) ?? portraits[0] ?? null
    const isOwn = true
    return {
      id: r.id,
      title: r.title,
      primaryPortraitKey: primary ? primary.r2_key : null,
      isOwn,
    }
  })

  return mapped
}
