import crypto from 'node:crypto'
import process from 'node:process'
import { AwsClient } from 'aws4fetch'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const renditions = [
  ['thumb', 320, 76],
  ['preview', 960, 80],
  ['scene', 1920, 84],
]

function workerConfig() {
  const endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.R2_BUCKET ?? ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? ''
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !url || !serviceKey) {
    throw new Error('MEDIA_WORKER_CONFIGURATION_MISSING')
  }
  return { endpoint, bucket, accessKeyId, secretAccessKey, url, serviceKey }
}

export async function runMediaWorker() {
  const cfg = workerConfig()
  const pollMs = Number(process.env.MEDIA_WORKER_POLL_MS ?? 1500)
  const workerId = process.env.MEDIA_WORKER_ID ?? `media-worker-${crypto.randomUUID()}`
  const r2 = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, service: 's3', region: 'auto' })
  const db = createClient(cfg.url, cfg.serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const r2Fetch = (key, options = {}) => r2.fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, options)

  async function processOne() {
    const { data, error } = await db.rpc('claim_media_variant_job', { p_worker_id: workerId })
    if (error) throw new Error(`CLAIM_FAILED:${error.message}`)
    const job = data?.[0]
    if (!job) return false
    try {
      const original = await r2Fetch(job.storage_key)
      if (!original.ok) throw new Error(`SOURCE_GET_${original.status}`)
      const source = Buffer.from(await original.arrayBuffer())
      const metadata = await sharp(source).rotate().metadata()
      if (!metadata.width || !metadata.height) throw new Error('SOURCE_DIMENSIONS_MISSING')
      const variants = []
      for (const [rendition, maxSize, quality] of renditions) {
        const output = await sharp(source).rotate().resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true }).webp({ quality }).toBuffer({ resolveWithObject: true })
        const key = `media/${job.campaign_id}/${job.asset_id}/v${job.version}/${rendition}.webp`
        // R2's S3 endpoint rejects chunked uploads (HTTP 411). aws4fetch's
        // Node request does not infer this header for its signed Buffer body.
        const written = await r2Fetch(key, { method: 'PUT', headers: { 'Content-Type': 'image/webp', 'Content-Length': String(output.data.length), 'Cache-Control': 'public, max-age=31536000, immutable' }, body: output.data })
        if (!written.ok) throw new Error(`VARIANT_PUT_${rendition}_${written.status}`)
        variants.push({ asset_id: job.asset_id, rendition, version: job.version, storage_key: key, mime_type: 'image/webp', width: output.info.width, height: output.info.height, size_bytes: output.data.length })
      }
      const { error: variantsError } = await db.from('media_asset_variants').upsert(variants, { onConflict: 'asset_id,rendition,version' })
      if (variantsError) throw new Error(`VARIANT_METADATA_FAILED:${variantsError.message}`)
      const { data: complete, error: completeError } = await db.rpc('complete_media_variant_job', { p_job_id: job.job_id, p_worker_id: workerId, p_width: metadata.width, p_height: metadata.height })
      if (completeError || !complete) throw new Error(`COMPLETE_FAILED:${completeError?.message ?? 'LEASE_LOST'}`)
      console.info(JSON.stringify({ event: 'media.variant.ready', assetId: job.asset_id, jobId: job.job_id }))
    } catch (error) {
      const code = error instanceof Error ? error.message.split(':')[0] : 'UNKNOWN_WORKER_ERROR'
      const { error: failError } = await db.rpc('fail_media_variant_job', { p_job_id: job.job_id, p_worker_id: workerId, p_error_code: code })
      console.error(JSON.stringify({ event: 'media.variant.failed', jobId: job.job_id, code, failError: failError?.message ?? null }))
    }
    return true
  }

  console.info(JSON.stringify({ event: 'media.worker.started', workerId }))
  for (;;) {
    try {
      if (!await processOne()) await new Promise((resolve) => setTimeout(resolve, pollMs))
    } catch (error) {
      console.error(JSON.stringify({ event: 'media.worker.loop_failed', code: error instanceof Error ? error.message : 'UNKNOWN' }))
      await new Promise((resolve) => setTimeout(resolve, Math.max(pollMs, 5000)))
    }
  }
}

export function startMediaWorkerInProcess() {
  if (globalThis.__mediaWorkerStarted) return
  globalThis.__mediaWorkerStarted = true
  void runMediaWorker().catch((error) => {
    console.error(JSON.stringify({ event: 'media.worker.start_failed', code: error instanceof Error ? error.message : 'UNKNOWN' }))
  })
}
