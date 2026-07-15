import { NextResponse } from 'next/server'
import { canEditNode, getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity, logActivityWarning } from '@/lib/server/activity-log'
import { uploadCampaignImage, validateImageFile } from '@/lib/server/image-upload'

const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: Request) {
  const form = await request.formData()
  const campaignId = String(form.get('campaignId') ?? '')
  const nodeId = String(form.get('nodeId') ?? '')
  const file = form.get('file')
  const [membership, user] = await Promise.all([getMembership(campaignId), getCurrentUser()])
  if (!membership || !user || !(await canEditNode(nodeId, campaignId, user.id, membership.role))) {
    logActivityWarning('portrait.upload.denied', { campaignId, nodeId })
    return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })
  }
  const { data: node } = await createAdminClient().from('nodes').select('node_types!inner(slug)').eq('id', nodeId).eq('campaign_id', campaignId).maybeSingle()
  const type = (node as { node_types?: { slug?: string } | { slug?: string }[] } | null)?.node_types
  const slug = Array.isArray(type) ? type[0]?.slug : type?.slug
  if (!slug || !['character', 'npc', 'creature'].includes(slug)) {
    logActivityWarning('portrait.upload.invalid_node_type', { campaignId, nodeId })
    return NextResponse.json({ error: 'Портрет можно загрузить только персонажу или существу.' }, { status: 400 })
  }
  if (!validateImageFile(file, MAX_BYTES)) {
    logActivityWarning('portrait.upload.invalid_file', { campaignId, nodeId })
    return NextResponse.json({ error: 'Нужен PNG, JPEG или WebP до 8 МБ.' }, { status: 400 })
  }
  const uploaded = await uploadCampaignImage(`portraits/${campaignId}/${nodeId}`, file)
  if ('error' in uploaded) return NextResponse.json({ error: uploaded.error }, { status: uploaded.status })
  logActivity('portrait.upload.completed', { campaignId, nodeId, bytes: file.size })
  return NextResponse.json(uploaded)
}
