import { imageExtensionFor } from '@/lib/image-signatures'

export const MAX_MEDIA_UPLOAD_BYTES = 12 * 1024 * 1024
export const MEDIA_PAGE_SIZE = 48

export type MediaVariantState = 'queued' | 'processing' | 'ready' | 'failed'
export type MediaRendition = 'thumb' | 'preview' | 'scene' | 'cutout'

export const MEDIA_ASSET_COLUMNS =
  'id, campaign_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by, created_at, source_width, source_height, variant_state, variant_version, variant_error_code, variants_updated_at'

export type MediaAssetRow = {
  id: string
  campaign_id: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
  source_width?: number | null
  source_height?: number | null
  variant_state?: MediaVariantState
  variant_version?: number
  variant_error_code?: string | null
  variants_updated_at?: string | null
}

export type MediaVariantRow = {
  rendition: MediaRendition
  version: number
  storage_key: string
  mime_type: string
  width: number
  height: number
  size_bytes: number
}

export type MediaNodeLinkRow = {
  node: {
    id: string
    title: string
    type: { slug: string } | null
  } | {
    id: string
    title: string
    type: { slug: string } | null
  }[] | null
}

export type MediaLinkedNode = {
  id: string
  title: string
  typeSlug: string | null
}

export type MediaAssetView = {
  id: string
  campaignId: string
  originalFilename: string
  mimeType: string
  sizeBytes: number
  uploadedBy: string | null
  createdAt: string
  url: string | null
}

export type MediaPageItem = Omit<MediaAssetView, 'url'> & {
  variantState: MediaVariantState
  variantErrorCode: string | null
  thumbnail: { url: string; width: number; height: number } | null
  linkedNodes: MediaLinkedNode[]
}

export type MediaPage = {
  items: MediaPageItem[]
  /** Total assets visible to the current campaign member, across all pages. */
  total: number
  nextCursor: string | null
}

/** A real domain reference that prevents deletion of its asset. This is a
 * read-only explanation for the library UI; it is not a second usage table. */
export type MediaAssetUsage = {
  kind: 'portrait'
  nodeId: string
  nodeTitle: string
  count: number
}

export function mediaAssetUrl(key: string | null): string | null {
  const base =
    process.env.NEXT_PUBLIC_R2_ASSET_BASE ??
    process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE
  if (!key || !base) return null
  return `${base.replace(/\/$/, '')}/${key}`
}

export function normalizeMediaFilename(filename: string, mimeType: string): string {
  const trimmed = filename.trim()
  const extension = imageExtensionFor(mimeType) ?? 'bin'
  const fallback = `image.${extension}`
  return [...(trimmed || fallback)].slice(0, 255).join('')
}

export function toMediaAssetView(row: MediaAssetRow): MediaAssetView {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
    url: mediaAssetUrl(row.storage_key),
  }
}

export function toMediaPageItem(
  row: MediaAssetRow,
  variants: MediaVariantRow[] | null | undefined,
  nodeLinks: MediaNodeLinkRow[] | null | undefined = [],
): MediaPageItem {
  const { url: _originalUrl, ...asset } = toMediaAssetView(row)
  const version = row.variant_version ?? 1
  const thumb = (variants ?? []).find(
    (variant) => variant.rendition === 'thumb' && variant.version === version,
  )
  const thumbnailUrl = thumb ? mediaAssetUrl(thumb.storage_key) : null
  return {
    ...asset,
    variantState: row.variant_state ?? 'queued',
    variantErrorCode: row.variant_error_code ?? null,
    thumbnail: thumb && thumbnailUrl
      ? { url: thumbnailUrl, width: thumb.width, height: thumb.height }
      : null,
    linkedNodes: (nodeLinks ?? [])
      .flatMap((link) => Array.isArray(link.node) ? link.node : link.node ? [link.node] : [])
      .map((node) => ({
        id: node.id,
        title: node.title,
        typeSlug: node.type?.slug ?? null,
      }))
      .sort((left, right) => left.title.localeCompare(right.title, 'ru')),
  }
}
