import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MEDIA_PAGE_SIZE,
  MEDIA_ASSET_COLUMNS,
  toMediaPageItem,
  toMediaAssetView,
  type MediaAssetRow,
  type MediaAssetView,
  type MediaPage,
  type MediaNodeLinkRow,
  type MediaVariantRow,
} from '@/lib/media'
import { decodeMediaCursor, encodeMediaCursor } from '@/lib/server/media-pagination'

export async function getCampaignMediaAssets(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<MediaAssetView[]> {
  const { data, error } = await supabase
    .from('media_assets')
    .select(MEDIA_ASSET_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error
  return ((data ?? []) as MediaAssetRow[]).map(toMediaAssetView)
}

type MediaPageRow = MediaAssetRow & {
  media_asset_variants?: MediaVariantRow[] | null
  media_asset_node_links?: MediaNodeLinkRow[] | null
}

export async function getCampaignMediaPage(
  supabase: SupabaseClient,
  campaignId: string,
  cursor?: string | null,
): Promise<MediaPage> {
  const decoded = cursor ? decodeMediaCursor(cursor) : null
  if (cursor && !decoded) throw new Error('INVALID_MEDIA_CURSOR')

  let query = supabase
    .from('media_assets')
    .select(`${MEDIA_ASSET_COLUMNS}, media_asset_variants(rendition, version, storage_key, mime_type, width, height, size_bytes), media_asset_node_links(node:nodes(id, title, type:node_types(slug)))`, { count: 'exact' })
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MEDIA_PAGE_SIZE + 1)

  if (decoded) {
    query = query.or(
      `created_at.lt.${decoded.createdAt},and(created_at.eq.${decoded.createdAt},id.lt.${decoded.id})`,
    )
  }

  const { data, error, count } = await query
  if (error) throw error
  const rows = (data ?? []) as MediaPageRow[]
  const hasMore = rows.length > MEDIA_PAGE_SIZE
  const pageRows = hasMore ? rows.slice(0, MEDIA_PAGE_SIZE) : rows
  const last = pageRows.at(-1)
  return {
    items: pageRows.map((row) => toMediaPageItem(
      row,
      row.media_asset_variants,
      row.media_asset_node_links,
    )),
    total: count ?? pageRows.length,
    nextCursor: hasMore && last ? encodeMediaCursor(last.created_at, last.id) : null,
  }
}
