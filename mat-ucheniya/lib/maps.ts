export type MapTokenView = {
  id: string
  characterNodeId: string
  title: string
  x: number
  y: number
  portrait: { id: string; mediaAssetId: string | null; url: string | null; cropX: number; cropY: number; cropZoom: number } | null
}

export type MapView = {
  id: string
  title: string
  imageUrl: string | null
  tokens: MapTokenView[]
}

export type CharacterOption = {
  id: string
  title: string
  portrait: MapTokenView['portrait']
}

/**
 * Public URL for an uploaded asset. Maps and portraits live in the same R2
 * bucket, so they deliberately share one public base URL. Keep the portrait
 * variable as a backwards-compatible fallback for existing deployments.
 */
export function mapImageUrl(key: string): string | null {
  const base = process.env.NEXT_PUBLIC_R2_ASSET_BASE ?? process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE
  return base ? `${base.replace(/\/$/, '')}/${key}` : null
}

export function clampMapPosition(value: number): number {
  const safeValue = Number.isFinite(value) ? value : 0
  return Math.round(Math.max(0, Math.min(1, safeValue)) * 100000) / 100000
}
