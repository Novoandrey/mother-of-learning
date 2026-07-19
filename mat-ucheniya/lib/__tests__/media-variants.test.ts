import { beforeEach, describe, expect, it } from 'vitest'
import { toMediaPageItem } from '@/lib/media'
import { decodeMediaCursor, encodeMediaCursor } from '@/lib/server/media-pagination'

const asset = {
  id: '30000000-0000-4000-8000-000000000003',
  campaign_id: '10000000-0000-4000-8000-000000000001',
  storage_key: 'media/source.jpg',
  original_filename: 'source.jpg',
  mime_type: 'image/jpeg',
  size_bytes: 1024,
  uploaded_by: null,
  created_at: '2026-07-20T10:00:00.000Z',
  variant_state: 'ready' as const,
  variant_version: 1,
  variant_error_code: null,
}

describe('MEDIA-02 helpers', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_R2_ASSET_BASE = 'https://assets.example.test'
  })

  it('round-trips an opaque cursor and rejects malformed input', () => {
    const cursor = encodeMediaCursor(asset.created_at, asset.id)
    expect(decodeMediaCursor(cursor)).toEqual({ createdAt: asset.created_at, id: asset.id })
    expect(decodeMediaCursor('not-a-cursor')).toBeNull()
  })

  it('uses only the current thumbnail rendition, never the original', () => {
    const item = toMediaPageItem(asset, [
      { rendition: 'thumb', version: 1, storage_key: 'media/thumb.webp', mime_type: 'image/webp', width: 320, height: 180, size_bytes: 20 },
      { rendition: 'scene', version: 1, storage_key: 'media/scene.webp', mime_type: 'image/webp', width: 1920, height: 1080, size_bytes: 200 },
    ])
    expect(item.thumbnail?.url).toContain('media/thumb.webp')
    expect(item.thumbnail?.url).not.toContain('source.jpg')
  })

  it('keeps a processing asset without an original fallback thumbnail', () => {
    const item = toMediaPageItem({ ...asset, variant_state: 'processing' }, null)
    expect(item.thumbnail).toBeNull()
    expect(item.variantState).toBe('processing')
  })
})
