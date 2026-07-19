import { NextResponse } from 'next/server'
import { getCurrentUser, getMembership } from '@/lib/auth'
import {
  isMediaManager,
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_ASSET_COLUMNS,
  normalizeMediaFilename,
  type MediaAssetRow,
} from '@/lib/media'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  deleteCampaignImageObject,
  uploadCampaignImage,
  validateImageFile,
} from '@/lib/server/image-upload'
import {
  logActivity,
  logActivityError,
  logActivityWarning,
} from '@/lib/server/activity-log'

export async function POST(request: Request) {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Не удалось прочитать файл.' }, { status: 400 })
  }

  const campaignId = String(form.get('campaignId') ?? '')
  const file = form.get('file')
  const [membership, user] = await Promise.all([
    getMembership(campaignId),
    getCurrentUser(),
  ])

  if (!membership || !user || !isMediaManager(membership.role)) {
    logActivityWarning('media.upload.denied', { campaignId })
    return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })
  }

  const image = await validateImageFile(file, MAX_MEDIA_UPLOAD_BYTES)
  if (!image) {
    logActivityWarning('media.upload.invalid_file', {
      campaignId,
      userId: user.id,
    })
    return NextResponse.json(
      { error: 'Нужен PNG, JPEG или WebP до 12 МБ.' },
      { status: 400 },
    )
  }

  const uploaded = await uploadCampaignImage(`media/${campaignId}`, image)
  if ('error' in uploaded) {
    return NextResponse.json(
      { error: uploaded.error },
      { status: uploaded.status },
    )
  }

  let asset: MediaAssetRow | null = null
  let persistenceError: unknown = null

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('media_assets')
      .insert({
        campaign_id: campaignId,
        storage_key: uploaded.key,
        original_filename: normalizeMediaFilename(image.name, image.type),
        mime_type: image.type,
        size_bytes: image.size,
        uploaded_by: user.id,
      })
      .select(MEDIA_ASSET_COLUMNS)
      .single()

    persistenceError = error
    asset = data as MediaAssetRow | null
  } catch (error) {
    persistenceError = error
  }

  if (persistenceError || !asset) {
    await deleteCampaignImageObject(uploaded.key)
    logActivityError(
      'media.upload.persistence_failed',
      persistenceError ?? new Error('Media asset insert returned no row.'),
      { campaignId, userId: user.id },
    )
    return NextResponse.json(
      { error: 'Файл принят, но не удалось добавить его в медиатеку.' },
      { status: 502 },
    )
  }

  logActivity('media.upload.completed', {
    campaignId,
    userId: user.id,
    assetId: asset.id,
    bytes: image.size,
  })

  return NextResponse.json(
    {
      asset: {
        id: asset.id,
        campaignId: asset.campaign_id,
        originalFilename: asset.original_filename,
        mimeType: asset.mime_type,
        sizeBytes: Number(asset.size_bytes),
        createdAt: asset.created_at,
      },
    },
    { status: 201 },
  )
}
