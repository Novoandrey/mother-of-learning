import { NextResponse } from 'next/server'
import { getMembership } from '@/lib/auth'
import { logActivity, logActivityWarning } from '@/lib/server/activity-log'
import { uploadCampaignImage, validateImageFile } from '@/lib/server/image-upload'

const MAX_BYTES = 12 * 1024 * 1024

export async function POST(request: Request) {
  const form = await request.formData()
  const campaignId = String(form.get('campaignId') ?? '')
  const file = form.get('file')
  const membership = await getMembership(campaignId)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    logActivityWarning('map.upload.denied', { campaignId })
    return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })
  }
  if (!validateImageFile(file, MAX_BYTES)) {
    logActivityWarning('map.upload.invalid_file', { campaignId })
    return NextResponse.json({ error: 'Нужен PNG, JPEG или WebP до 12 МБ.' }, { status: 400 })
  }
  const uploaded = await uploadCampaignImage(`maps/${campaignId}`, file)
  if ('error' in uploaded) return NextResponse.json({ error: uploaded.error }, { status: uploaded.status })
  logActivity('map.upload.completed', { campaignId, bytes: file.size })
  return NextResponse.json(uploaded)
}
