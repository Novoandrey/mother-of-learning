import type { SupabaseClient } from '@supabase/supabase-js'

export type MyCharacter = {
  id: string
  title: string
  primaryPortraitKey: string | null
  primaryPortraitCrop: { crop_x: number; crop_y: number; crop_zoom: number } | null
}

/**
 * The caller's PCs (spec-046, FR-009): character nodes they own via
 * `node_pc_owners` (many-to-many — handles shared PCs like Zak), with the
 * primary portrait's R2 key if one exists.
 *
 * Runs client-side through the Telegram-minted session (RLS-scoped). `userId`
 * is the linked account id returned by POST /api/tg/auth. `!inner` on both
 * embeds constrains the outer rows (PostgREST embed-filter trap).
 */
export async function getMyCharacters(
  supabase: SupabaseClient,
  userId: string,
): Promise<MyCharacter[]> {
  const { data, error } = await supabase
    .from('nodes')
    .select(
      'id, title, node_types!inner(slug), node_pc_owners!inner(user_id), character_portraits(r2_key, media_asset_id, is_primary, crop_x, crop_y, crop_zoom)',
    )
    .eq('node_types.slug', 'character')
    .eq('node_pc_owners.user_id', userId)
    .order('title')

  if (error) throw error

  return (data ?? []).map((row) => {
    const r = row as {
      id: string
      title: string
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
    return {
      id: r.id,
      title: r.title,
      primaryPortraitKey: primary?.r2_key ?? null,
      primaryPortraitCrop: primary
        ? { crop_x: Number(primary.crop_x), crop_y: Number(primary.crop_y), crop_zoom: Number(primary.crop_zoom) }
        : null,
    }
  })
}
