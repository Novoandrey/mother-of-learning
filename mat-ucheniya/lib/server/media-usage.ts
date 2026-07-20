import type { SupabaseClient } from '@supabase/supabase-js'
import type { MediaAssetUsage } from '@/lib/media'

type PortraitUsageRow = {
  character_node_id: string
  node: { id: string; title: string } | { id: string; title: string }[] | null
}

/**
 * Lists real domain references that make an asset non-deletable.
 *
 * Each new consumer adds a resolver here and a `media_asset_id ... on delete
 * restrict` FK in its own table. We deliberately do not duplicate usages in a
 * generic table: the referencing domain table remains the source of truth.
 */
export async function getMediaAssetUsages(
  supabase: SupabaseClient,
  assetId: string,
): Promise<MediaAssetUsage[]> {
  const { data, error } = await supabase
    .from('character_portraits')
    .select('character_node_id, node:nodes!inner(id, title)')
    .eq('media_asset_id', assetId)

  if (error) throw error

  const counts = new Map<string, MediaAssetUsage>()
  for (const row of (data ?? []) as PortraitUsageRow[]) {
    const node = Array.isArray(row.node) ? row.node[0] : row.node
    if (!node) continue
    const known = counts.get(node.id)
    if (known) known.count++
    else counts.set(node.id, { kind: 'portrait', nodeId: node.id, nodeTitle: node.title, count: 1 })
  }
  return [...counts.values()].sort((left, right) => left.nodeTitle.localeCompare(right.nodeTitle, 'ru'))
}
