import { NextResponse } from 'next/server'
import { resolveMediaRenditions } from '@/lib/server/media-renditions'
import type { MediaRendition } from '@/lib/media'

const RENDITIONS = new Set<MediaRendition>(['thumb', 'preview', 'scene', 'cutout'])

/** Browser-safe rendition projection. It is dynamic because membership comes
 * from the request's authenticated session. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const campaignId = params.get('campaignId') ?? ''
  const rendition = params.get('rendition') as MediaRendition | null
  const assetIds = (params.get('assetIds') ?? '').split(',').filter(Boolean)
  if (!campaignId || !rendition || !RENDITIONS.has(rendition) || !assetIds.length || assetIds.length > 100) {
    return NextResponse.json({ error: 'Некорректный запрос вариантов медиа.' }, { status: 400 })
  }
  return NextResponse.json({ items: await resolveMediaRenditions({ campaignId, assetIds, rendition }) })
}
