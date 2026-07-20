export type PortraitCutoutTag = 'pc' | 'npc'
export type PortraitCutoutFilter = PortraitCutoutTag | 'all'

export type PortraitCutoutCandidate = {
  assetId: string
  version: number
  portraitTags: PortraitCutoutTag[]
}

/** Pure planner shared by the batch script and tests. One shared asset is
 * processed once even when several portrait rows use it. */
export function planPortraitCutouts(
  portraits: Array<{
    mediaAssetId: string | null
    portraitTag: PortraitCutoutTag
  }>,
  assets: Map<string, { version: number; ready: boolean; hasCutout: boolean }>,
  filter: PortraitCutoutFilter,
): { candidates: PortraitCutoutCandidate[]; skipped: Record<string, number> } {
  const skipped: Record<string, number> = {
    missing_asset: 0,
    not_ready: 0,
    has_cutout: 0,
    filtered_tag: 0,
  }
  const byAsset = new Map<string, Set<PortraitCutoutTag>>()
  for (const portrait of portraits) {
    if (filter !== 'all' && portrait.portraitTag !== filter) {
      skipped.filtered_tag++
      continue
    }
    if (!portrait.mediaAssetId) {
      skipped.missing_asset++
      continue
    }
    const tags = byAsset.get(portrait.mediaAssetId) ?? new Set<PortraitCutoutTag>()
    tags.add(portrait.portraitTag)
    byAsset.set(portrait.mediaAssetId, tags)
  }

  const candidates: PortraitCutoutCandidate[] = []
  for (const [assetId, tags] of byAsset) {
    const asset = assets.get(assetId)
    if (!asset) { skipped.missing_asset++; continue }
    if (!asset.ready) { skipped.not_ready++; continue }
    if (asset.hasCutout) { skipped.has_cutout++; continue }
    candidates.push({ assetId, version: asset.version, portraitTags: [...tags].sort() })
  }
  return { candidates: candidates.sort((a, b) => a.assetId.localeCompare(b.assetId)), skipped }
}

export function cutoutStorageKey(assetId: string, version: number): string {
  return `media/cutout/${assetId}-v${version}.png`
}

export function selectCurrentCutoutKey(
  variants: Array<{ rendition: string; version: number; storage_key: string }> | null | undefined,
  version: number | null | undefined,
): string | null {
  if (!version) return null
  return variants?.find((variant) => variant.rendition === 'cutout' && variant.version === version)?.storage_key ?? null
}
