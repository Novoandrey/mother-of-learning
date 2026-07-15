import 'server-only'

import { AwsClient } from 'aws4fetch'
import { logActivityError, logActivityWarning } from '@/lib/server/activity-log'

const IMAGE_EXTENSIONS = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
])

export function validateImageFile(file: unknown, maxBytes: number): file is File {
  return file instanceof File && IMAGE_EXTENSIONS.has(file.type) && file.size > 0 && file.size <= maxBytes
}

export async function uploadCampaignImage(
  keyPrefix: string,
  file: File,
): Promise<{ key: string } | { error: string; status: number }> {
  const endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    logActivityWarning('upload.configuration_missing', { keyPrefix })
    return { error: 'Загрузка изображений пока не настроена на сервере.', status: 503 }
  }

  const extension = IMAGE_EXTENSIONS.get(file.type)
  if (!extension) return { error: 'Неподдерживаемый формат изображения.', status: 400 }
  const key = `${keyPrefix}/${crypto.randomUUID()}.${extension}`
  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  try {
    const result = await r2.fetch(`${endpoint}/${bucket}/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: await file.arrayBuffer(),
    })
    if (!result.ok) {
      logActivityWarning('upload.storage_rejected', { keyPrefix, status: result.status })
      return { error: 'Хранилище не приняло изображение.', status: 502 }
    }
  } catch (error) {
    logActivityError('upload.storage_request_failed', error, { keyPrefix })
    return { error: 'Не удалось связаться с хранилищем.', status: 502 }
  }
  return { key }
}
