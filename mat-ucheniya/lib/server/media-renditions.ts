import 'server-only'

import { getMembership } from '@/lib/auth'
import { mediaAssetUrl, type MediaRendition, type MediaVariantState } from '@/lib/media'
import { createClient } from '@/lib/supabase/server'

export type MediaRenditionResult =
  | { status: 'ready'; url: string; width: number; height: number }
  | { status: Exclude<MediaVariantState, 'ready'> }
  | { status: 'not_found' }

export type MediaRenditionBatchItem = MediaRenditionResult & { assetId: string }

/** Member-gated batch projection for browser clients. The returned URL may
 * point at a public derived object, but the source/original key never leaves
 * this server module. */
export async function resolveMediaRenditions({
  campaignId,
  assetIds,
  rendition,
}: {
  campaignId: string
  assetIds: string[]
  rendition: MediaRendition
}): Promise<MediaRenditionBatchItem[]> {
  const uniqueIds = [...new Set(assetIds)].filter(Boolean)
  if (!uniqueIds.length) return []
  const membership = await getMembership(campaignId)
  if (!membership) return uniqueIds.map((assetId) => ({ assetId, status: 'not_found' }))

  const supabase = await createClient()
  const { data } = await supabase
    .from('media_assets')
    .select('id, variant_state, variant_version, media_asset_variants(rendition, version, storage_key, width, height)')
    .eq('campaign_id', campaignId)
    .in('id', uniqueIds)
  const byId = new Map((data ?? []).map((asset) => [asset.id as string, asset]))

  return uniqueIds.map((assetId) => {
    const asset = byId.get(assetId)
    if (!asset) return { assetId, status: 'not_found' }
    const state = asset.variant_state as MediaVariantState
    if (state !== 'ready') return { assetId, status: state === 'queued' || state === 'processing' || state === 'failed' ? state : 'not_found' }
    const variants = (asset.media_asset_variants ?? []) as Array<{
      rendition: MediaRendition
      version: number
      storage_key: string
      width: number
      height: number
    }>
    const variant = variants.find((candidate) => candidate.rendition === rendition && candidate.version === asset.variant_version)
    const url = variant ? mediaAssetUrl(variant.storage_key) : null
    return variant && url
      ? { assetId, status: 'ready' as const, url, width: variant.width, height: variant.height }
      : { assetId, status: 'processing' as const }
  })
}

/**
 * Consumer-safe asset delivery. A scene/portrait/map asks for one rendition;
 * it never receives the original storage key or a media-library listing.
 */
export async function resolveMediaRendition({
  campaignId,
  assetId,
  rendition,
}: {
  campaignId: string
  assetId: string
  rendition: MediaRendition
}): Promise<MediaRenditionResult> {
  const membership = await getMembership(campaignId)
  if (!membership) return { status: 'not_found' }
  const supabase = await createClient()
  const { data: asset } = await supabase
    .from('media_assets')
    .select('id, variant_state, variant_version, media_asset_variants(rendition, version, storage_key, width, height)')
    .eq('id', assetId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!asset) return { status: 'not_found' }

  const state = asset.variant_state as MediaVariantState
  if (state === 'queued' || state === 'processing' || state === 'failed') {
    return { status: state }
  }
  if (state !== 'ready') return { status: 'not_found' }
  const variants = (asset.media_asset_variants ?? []) as Array<{
    rendition: MediaRendition
    version: number
    storage_key: string
    width: number
    height: number
  }>
  const variant = variants.find(
    (candidate) => candidate.rendition === rendition && candidate.version === asset.variant_version,
  )
  const url = variant ? mediaAssetUrl(variant.storage_key) : null
  return variant && url ? { status: 'ready', url, width: variant.width, height: variant.height } : { status: 'processing' }
}
