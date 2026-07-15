import type { SupabaseClient } from '@supabase/supabase-js'
import { mapImageUrl, type CharacterOption, type MapTokenView, type MapView } from '@/lib/maps'
import { portraitUrl } from '@/lib/portraits'

type PortraitRow = {
  id: string
  r2_key: string
  is_primary: boolean
  crop_x: number
  crop_y: number
  crop_zoom: number
}

type CharacterRow = {
  id: string
  title: string
  character_portraits: PortraitRow[] | null
}

/**
 * Read model shared by the desktop route and Telegram Mini App. Keeping this
 * transformation in one place prevents the two surfaces from disagreeing on
 * which portrait or token belongs on a map.
 */
export async function getCampaignMapData(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ maps: MapView[]; characters: CharacterOption[] }> {
  const [{ data: mapRows, error: mapsError }, { data: characterRows, error: charactersError }] = await Promise.all([
    supabase
      .from('campaign_maps')
      .select('id, title, image_key')
      .eq('campaign_id', campaignId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('nodes')
      .select('id, title, node_types!inner(slug), node_pc_owners!inner(user_id), character_portraits(id, r2_key, is_primary, crop_x, crop_y, crop_zoom)')
      .eq('campaign_id', campaignId)
      .eq('node_types.slug', 'character'),
  ])
  if (mapsError) throw mapsError
  if (charactersError) throw charactersError

  const characters: CharacterOption[] = ((characterRows ?? []) as CharacterRow[]).map((character) => {
    const portrait = character.character_portraits?.find((p) => p.is_primary) ?? character.character_portraits?.[0]
    return {
      id: character.id,
      title: character.title,
      portrait: portrait
        ? {
            id: portrait.id,
            url: portraitUrl(portrait.r2_key),
            cropX: Number(portrait.crop_x),
            cropY: Number(portrait.crop_y),
            cropZoom: Number(portrait.crop_zoom),
          }
        : null,
    }
  })

  const mapIds = (mapRows ?? []).map((map) => map.id)
  const { data: tokenRows, error: tokensError } = mapIds.length
    ? await supabase.from('map_tokens').select('id, map_id, character_node_id, x, y').in('map_id', mapIds)
    : { data: [], error: null }
  if (tokensError) throw tokensError

  const characterById = new Map(characters.map((character) => [character.id, character]))
  const tokensByMap = new Map<string, MapTokenView[]>()
  for (const row of tokenRows ?? []) {
    const character = characterById.get(row.character_node_id)
    if (!character) continue
    const tokens = tokensByMap.get(row.map_id) ?? []
    tokens.push({
      id: row.id,
      characterNodeId: row.character_node_id,
      title: character.title,
      x: Number(row.x),
      y: Number(row.y),
      portrait: character.portrait,
    })
    tokensByMap.set(row.map_id, tokens)
  }

  return {
    maps: (mapRows ?? []).map((map) => ({
      id: map.id,
      title: map.title,
      imageUrl: mapImageUrl(map.image_key),
      tokens: tokensByMap.get(map.id) ?? [],
    })),
    characters,
  }
}
