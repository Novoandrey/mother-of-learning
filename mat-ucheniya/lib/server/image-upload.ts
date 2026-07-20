import 'server-only'

import { AwsClient } from 'aws4fetch'
import {
  hasMatchingImageSignature,
  imageExtensionFor,
  isSupportedImageType,
} from '@/lib/image-signatures'
import { logActivityError, logActivityWarning } from '@/lib/server/activity-log'

type R2Config = {
  endpoint: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

function getR2Config(): R2Config | null {
  const endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.R2_BUCKET
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null
  return { endpoint, bucket, accessKeyId, secretAccessKey }
}

function createR2Client(config: R2Config) {
  return new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: 's3',
    region: 'auto',
  })
}

export async function validateImageFile(
  file: unknown,
  maxBytes: number,
): Promise<File | null> {
  if (
    !(file instanceof File) ||
    !isSupportedImageType(file.type) ||
    file.size <= 0 ||
    file.size > maxBytes
  ) {
    return null
  }

  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  return hasMatchingImageSignature(file.type, header) ? file : null
}

export async function uploadCampaignImage(
  keyPrefix: string,
  file: File,
): Promise<{ key: string } | { error: string; status: number }> {
  const config = getR2Config()
  if (!config) {
    logActivityWarning('upload.configuration_missing', { keyPrefix })
    return { error: 'Загрузка изображений пока не настроена на сервере.', status: 503 }
  }

  const extension = imageExtensionFor(file.type)
  if (!extension) return { error: 'Неподдерживаемый формат изображения.', status: 400 }
  const key = `${keyPrefix}/${crypto.randomUUID()}.${extension}`
  const r2 = createR2Client(config)
  try {
    const result = await r2.fetch(`${config.endpoint}/${config.bucket}/${key}`, {
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

/**
 * Compensating cleanup for a file whose metadata could not be persisted.
 * Deletion is intentionally best-effort: the original application error stays
 * authoritative, while a cleanup failure is recorded for later maintenance.
 */
export async function deleteCampaignImageObject(key: string): Promise<boolean> {
  const config = getR2Config()
  if (!config) {
    logActivityWarning('upload.cleanup_configuration_missing')
    return false
  }

  try {
    const result = await createR2Client(config).fetch(
      `${config.endpoint}/${config.bucket}/${key}`,
      { method: 'DELETE' },
    )
    if (!result.ok) {
      logActivityWarning('upload.cleanup_rejected', { status: result.status })
      return false
    }
    return true
  } catch (error) {
    logActivityError('upload.cleanup_request_failed', error)
    return false
  }
}

/** Deletes server-selected original/variant keys. Callers receive only a count
 * of failed objects, never a key that could be exposed to a browser. */
export async function deleteCampaignImageObjects(keys: string[]): Promise<{ failedCount: number }> {
  const uniqueKeys = [...new Set(keys.filter(Boolean))]
  let failedCount = 0
  for (const key of uniqueKeys) {
    if (!await deleteCampaignImageObject(key)) failedCount++
  }
  return { failedCount }
}
