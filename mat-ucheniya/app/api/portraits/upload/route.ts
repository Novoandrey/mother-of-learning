import { NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'
import { canEditNode, getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

const TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']])
const MAX_BYTES = 8 * 1024 * 1024

export async function POST(request: Request) {
  const form = await request.formData()
  const campaignId = String(form.get('campaignId') ?? '')
  const nodeId = String(form.get('nodeId') ?? '')
  const file = form.get('file')
  const [membership, user] = await Promise.all([getMembership(campaignId), getCurrentUser()])
  if (!membership || !user || !(await canEditNode(nodeId, campaignId, user.id, membership.role))) return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })
  const { data: node } = await createAdminClient().from('nodes').select('node_types!inner(slug)').eq('id', nodeId).eq('campaign_id', campaignId).maybeSingle()
  const type = (node as { node_types?: { slug?: string } | { slug?: string }[] } | null)?.node_types
  const slug = Array.isArray(type) ? type[0]?.slug : type?.slug
  if (!slug || !['character', 'npc', 'creature'].includes(slug)) return NextResponse.json({ error: 'Портрет можно загрузить только персонажу или существу.' }, { status: 400 })
  if (!(file instanceof File) || !TYPES.has(file.type) || file.size > MAX_BYTES) return NextResponse.json({ error: 'Нужен PNG, JPEG или WebP до 8 МБ.' }, { status: 400 })
  const endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.R2_BUCKET
  const id = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !id || !secret) return NextResponse.json({ error: 'Загрузка портретов пока не настроена на сервере.' }, { status: 503 })
  const key = `portraits/${campaignId}/${nodeId}/${crypto.randomUUID()}.${TYPES.get(file.type)}`
  const r2 = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: 's3', region: 'auto' })
  const result = await r2.fetch(`${endpoint}/${bucket}/${key}`, { method: 'PUT', headers: { 'Content-Type': file.type }, body: await file.arrayBuffer() })
  if (!result.ok) return NextResponse.json({ error: 'Хранилище не приняло файл.' }, { status: 502 })
  return NextResponse.json({ key })
}
