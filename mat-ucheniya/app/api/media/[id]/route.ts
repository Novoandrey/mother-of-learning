import { NextResponse } from 'next/server'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { deleteCampaignImageObjects } from '@/lib/server/image-upload'
import { getMediaAssetUsages } from '@/lib/server/media-usage'
import { logActivity, logActivityError, logActivityWarning } from '@/lib/server/activity-log'

type AssetForDeletion = {
  id: string
  storage_key: string
  media_asset_variants: Array<{ storage_key: string }> | null
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const campaignId = new URL(request.url).searchParams.get('campaignId') ?? ''
  const [membership, user] = await Promise.all([getMembership(campaignId), getCurrentUser()])
  if (!membership || !user) return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })

  const admin = createAdminClient()
  const { data: asset } = await admin
    .from('media_assets')
    .select('id, storage_key, media_asset_variants(storage_key)')
    .eq('id', id)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Ассет не найден.' }, { status: 404 })

  let usages
  try {
    usages = await getMediaAssetUsages(admin, id)
  } catch {
    return NextResponse.json({ error: 'Не удалось проверить использования ассета.' }, { status: 500 })
  }
  if (usages.length) return NextResponse.json({ error: 'Ассет используется.', usages }, { status: 409 })

  const { error } = await admin
    .from('media_assets')
    .delete()
    .eq('id', id)
    .eq('campaign_id', campaignId)
  if (error) {
    if (error.code === '23503') {
      const currentUsages = await getMediaAssetUsages(admin, id).catch(() => [])
      return NextResponse.json({ error: 'Ассет уже используется.', usages: currentUsages }, { status: 409 })
    }
    logActivityWarning('media.delete.persistence_failed', { campaignId, userId: user.id, assetId: id })
    return NextResponse.json({ error: 'Не удалось удалить ассет.' }, { status: 500 })
  }

  const keys = [
    (asset as AssetForDeletion).storage_key,
    ...((asset as AssetForDeletion).media_asset_variants ?? []).map((variant) => variant.storage_key),
  ]
  const cleanup = await deleteCampaignImageObjects(keys)
  if (cleanup.failedCount) {
    logActivityError('media.delete.storage_cleanup_failed', new Error('R2 cleanup incomplete'), {
      campaignId, userId: user.id, assetId: id, failedObjectCount: cleanup.failedCount,
    })
  } else {
    logActivity('media.deleted', { campaignId, userId: user.id, assetId: id })
  }
  return NextResponse.json({ ok: true })
}
