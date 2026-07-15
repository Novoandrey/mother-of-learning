export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { mapImageUrl } from '@/lib/maps'
import { portraitUrl } from '@/lib/portraits'
import { MapWorkbench, type CharacterOption, type MapView, type MapTokenView } from '@/components/map-workbench'

export default async function MapsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()
  const supabase = await createClient()
  const membership = await getMembership(campaign.id)
  if (!membership) notFound()
  const [{ data: mapRows }, { data: characterRows }] = await Promise.all([
    supabase.from('campaign_maps').select('id, title, image_key').eq('campaign_id', campaign.id).order('updated_at', { ascending: false }),
    supabase
      .from('nodes')
      .select('id, title, node_types!inner(slug), node_pc_owners!inner(user_id), character_portraits(id, r2_key, is_primary, crop_x, crop_y, crop_zoom)')
      .eq('campaign_id', campaign.id)
      .eq('node_types.slug', 'character'),
  ])
  type PortraitRow = { id: string; r2_key: string; is_primary: boolean; crop_x: number; crop_y: number; crop_zoom: number }
  type CharacterRow = { id: string; title: string; character_portraits: PortraitRow[] | null }
  const characters: CharacterOption[] = ((characterRows ?? []) as CharacterRow[]).map((character) => {
    const portrait = character.character_portraits?.find((p) => p.is_primary) ?? character.character_portraits?.[0]
    return { id: character.id, title: character.title, portrait: portrait ? { id: portrait.id, url: portraitUrl(portrait.r2_key), cropX: Number(portrait.crop_x), cropY: Number(portrait.crop_y), cropZoom: Number(portrait.crop_zoom) } : null }
  })
  const mapIds = (mapRows ?? []).map((map) => map.id)
  const { data: tokenRows } = mapIds.length ? await supabase.from('map_tokens').select('id, map_id, character_node_id, x, y').in('map_id', mapIds) : { data: [] }
  const characterById = new Map(characters.map((character) => [character.id, character]))
  const tokensByMap = new Map<string, MapTokenView[]>()
  for (const row of tokenRows ?? []) {
    const character = characterById.get(row.character_node_id)
    if (!character) continue
    const items = tokensByMap.get(row.map_id) ?? []
    items.push({ id: row.id, characterNodeId: row.character_node_id, title: character.title, x: Number(row.x), y: Number(row.y), portrait: character.portrait })
    tokensByMap.set(row.map_id, items)
  }
  const maps: MapView[] = (mapRows ?? []).map((map) => ({ id: map.id, title: map.title, imageUrl: mapImageUrl(map.image_key), tokens: tokensByMap.get(map.id) ?? [] }))
  return <MapWorkbench campaignId={campaign.id} campaignSlug={slug} canManage={membership.role === 'owner' || membership.role === 'dm'} maps={maps} characters={characters} />
}
