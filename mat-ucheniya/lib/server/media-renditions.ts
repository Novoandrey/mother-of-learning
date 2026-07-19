import 'server-only'

import { getMembership } from '@/lib/auth'
import { mediaAssetUrl, type MediaRendition, type MediaVariantState } from '@/lib/media'
import { createClient } from '@/lib/supabase/server'

export type MediaRenditionResult =
  | { status: 'ready'; url: string; width: number; height: number }
  | { status: Exclude<MediaVariantState, 'ready'> }
  | { status: 'not_found' }

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
