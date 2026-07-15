import { NextResponse } from 'next/server'
import { AwsClient } from 'aws4fetch'
import { getMembership } from '@/lib/auth'

const TYPES = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp']])
const MAX_BYTES = 12 * 1024 * 1024

export async function POST(request: Request) {
  const form = await request.formData()
  const campaignId = String(form.get('campaignId') ?? '')
  const file = form.get('file')
  const membership = await getMembership(campaignId)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) return NextResponse.json({ error: 'Нет прав.' }, { status: 403 })
  if (!(file instanceof File) || !TYPES.has(file.type) || file.size > MAX_BYTES) return NextResponse.json({ error: 'Нужен PNG, JPEG или WebP до 12 МБ.' }, { status: 400 })
  const endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.R2_BUCKET
  const id = process.env.R2_ACCESS_KEY_ID
  const secret = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !id || !secret) return NextResponse.json({ error: 'Загрузка карт пока не настроена на сервере.' }, { status: 503 })
  const key = `maps/${campaignId}/${crypto.randomUUID()}.${TYPES.get(file.type)}`
  const r2 = new AwsClient({ accessKeyId: id, secretAccessKey: secret, service: 's3', region: 'auto' })
  const result = await r2.fetch(`${endpoint}/${bucket}/${key}`, { method: 'PUT', headers: { 'Content-Type': file.type }, body: await file.arrayBuffer() })
  if (!result.ok) return NextResponse.json({ error: 'Хранилище не приняло изображение.' }, { status: 502 })
  return NextResponse.json({ key })
}
