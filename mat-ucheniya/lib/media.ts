import type { Role } from '@/lib/auth'
import { imageExtensionFor } from '@/lib/image-signatures'

export const MAX_MEDIA_UPLOAD_BYTES = 12 * 1024 * 1024

export const MEDIA_ASSET_COLUMNS =
  'id, campaign_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by, created_at'

export type MediaAssetRow = {
  id: string
  campaign_id: string
  storage_key: string
  original_filename: string
  mime_type: string
  size_bytes: number
  uploaded_by: string | null
  created_at: string
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

export function isMediaManager(role: Role | string): boolean {
  return role === 'owner' || role === 'dm'
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
