/**
 * lib/portraits.ts — shared portrait helpers (spec-030).
 *
 * URL building was born in app/tg/_components/format.ts (spec-046); spec-030
 * lifts it here so desktop node pages and the Mini App build R2 URLs the same
 * way. `format.ts` re-exports `portraitUrl` for its existing imports.
 */

export type Portrait = {
  id: string
  r2_key: string | null
  media_asset_id?: string | null
  is_primary: boolean
  sort_order: number
  caption: string | null
  crop_x: number
  crop_y: number
  crop_zoom: number
}

/**
 * R2 portrait URL from a key, or null when no key / base configured.
 * With `opts.width`, returns a Cloudflare Image-Resizing URL (smaller WebP
 * thumbnail). If the zone doesn't have Transformations enabled, callers should
 * fall back to the un-resized URL via the <img> onError.
 */
export function portraitUrl(
  key: string | null,
  opts?: { width?: number },
): string | null {
  const base = process.env.NEXT_PUBLIC_R2_ASSET_BASE ?? process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE
  if (!key || !base) return null
  const root = base.replace(/\/$/, '')
  if (opts?.width) {
    return `${root}/cdn-cgi/image/width=${opts.width},quality=80,format=auto/${key}`
  }
  return `${root}/${key}`
}

/** Column list for a portraits SELECT — keep call sites in sync. */
export const PORTRAIT_COLUMNS = 'id, r2_key, media_asset_id, is_primary, sort_order, caption, crop_x, crop_y, crop_zoom'

/** Primary first, then sort_order — carousel display order. Portraits are
 *  decorative, so callers pass `data ?? []` and never fail on a null fetch. */
export function orderPortraits<T extends { is_primary: boolean; sort_order: number }>(
  portraits: T[],
): T[] {
  return [...portraits].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return a.sort_order - b.sort_order
  })
}
