/**
 * Generate transparent PNG cutouts for portrait-linked media assets.
 *
 * Safe default: without --commit this only queries metadata and prints a plan.
 * It never reads R2, starts Python, writes objects, or changes database rows.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { AwsClient } from 'aws4fetch'
import { createClient } from '@supabase/supabase-js'
import { cutoutStorageKey, planPortraitCutouts, type PortraitCutoutFilter, type PortraitCutoutTag } from '@/lib/portrait-cutouts'

function loadEnv(filename: string, overwrite = false) {
  const path = resolve(process.cwd(), filename)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)=(.*)$/)
    if (!match || (!overwrite && process.env[match[1]])) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

const production = process.argv.includes('--prod')
if (production) loadEnv('.env.prod', true)
else {
  loadEnv('.env.local')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) loadEnv('.env.prod')
}

const commit = process.argv.includes('--commit')
const tagIndex = process.argv.indexOf('--tag')
const tagFlag = process.argv.find((arg) => arg.startsWith('--tag='))?.slice('--tag='.length)
  ?? (tagIndex >= 0 ? process.argv[tagIndex + 1] : undefined)
const tag: PortraitCutoutFilter = tagFlag === 'pc' || tagFlag === 'npc' || tagFlag === 'all' ? tagFlag : 'all'
if (tagFlag && tagFlag !== tag) throw new Error('Use --tag pc, --tag npc, or --tag all.')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

type PortraitRow = { media_asset_id: string | null; portrait_tag: PortraitCutoutTag }
type AssetRow = { id: string; storage_key: string; mime_type: string; variant_version: number; variant_state: string }
type VariantRow = { asset_id: string; rendition: string; version: number }
type ManifestItem = { source: string; output: string; validation: { valid: boolean; width: number; height: number; rgb_matches_source: boolean; alpha_has_transparent_and_opaque: boolean } }

function r2Config() {
  const endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.R2_BUCKET ?? ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? ''
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('R2_CONFIGURATION_MISSING')
  return { endpoint, bucket, client: new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' }) }
}

function sourceExtension(mimeType: string): string {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  return '.jpg'
}

async function runPython(input: string, output: string): Promise<void> {
  const python = process.env.CUTOUT_PYTHON
    ?? join(process.cwd(), '..', 'AI-Art', 'background-removal', '.venv', 'Scripts', 'python.exe')
  const executable = existsSync(python) ? python : 'python'
  const script = join(process.cwd(), '..', 'AI-Art', 'background-removal', 'remove_backgrounds.py')
  await new Promise<void>((resolveRun, reject) => {
    const child = spawn(executable, [script, '--input', input, '--output', output, '--workers', '1', '--alpha-matting', 'on'], { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`CUTOUT_PYTHON_EXIT_${code ?? 'unknown'}`)))
  })
}

async function main() {
  const [{ data: portraitData, error: portraitsError }, { data: assetData, error: assetsError }, { data: variantData, error: variantsError }] = await Promise.all([
    admin.from('character_portraits').select('media_asset_id, portrait_tag'),
    admin.from('media_assets').select('id, storage_key, mime_type, variant_version, variant_state'),
    admin.from('media_asset_variants').select('asset_id, rendition, version').eq('rendition', 'cutout'),
  ])
  if (portraitsError) throw portraitsError
  if (assetsError) throw assetsError
  if (variantsError) throw variantsError

  const existing = new Set((variantData ?? []).map((variant) => `${(variant as VariantRow).asset_id}\0${(variant as VariantRow).version}`))
  const assets = new Map((assetData ?? []).map((asset) => {
    const row = asset as AssetRow
    return [row.id, { version: row.variant_version, ready: row.variant_state === 'ready', hasCutout: existing.has(`${row.id}\0${row.variant_version}`) }]
  }))
  const plan = planPortraitCutouts((portraitData ?? []).map((portrait) => {
    const row = portrait as PortraitRow
    return { mediaAssetId: row.media_asset_id, portraitTag: row.portrait_tag }
  }), assets, tag)
  console.info(JSON.stringify({
    target: production ? 'production' : 'default',
    mode: commit ? 'commit' : 'dry-run',
    tag,
    candidateCount: plan.candidates.length,
    skipped: plan.skipped,
    candidates: plan.candidates.map((candidate) => ({ ...candidate, storageKey: cutoutStorageKey(candidate.assetId, candidate.version) })),
  }, null, 2))
  if (!commit || !plan.candidates.length) return

  const assetById = new Map((assetData ?? []).map((asset) => [(asset as AssetRow).id, asset as AssetRow]))
  const work = mkdtempSync(join(tmpdir(), 'mol-portrait-cutouts-'))
  const input = join(work, 'input')
  const output = join(work, 'output')
  mkdirSync(input)
  console.info(JSON.stringify({ event: 'cutout.workspace', path: work }))
  try {
    const r2 = r2Config()
    for (const candidate of plan.candidates) {
      const asset = assetById.get(candidate.assetId)
      if (!asset) throw new Error(`ASSET_NOT_FOUND_${candidate.assetId}`)
      const response = await r2.client.fetch(`${r2.endpoint}/${r2.bucket}/${asset.storage_key}`)
      if (!response.ok) throw new Error(`R2_DOWNLOAD_${response.status}_${candidate.assetId}`)
      writeFileSync(join(input, `${candidate.assetId}${sourceExtension(asset.mime_type)}`), Buffer.from(await response.arrayBuffer()))
    }
    await runPython(input, output)
    const manifest = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')) as { items: ManifestItem[] }
    const validByAsset = new Map(manifest.items.map((item) => [basename(item.source, extname(item.source)), item]))
    for (const candidate of plan.candidates) {
      const item = validByAsset.get(candidate.assetId)
      if (!item?.validation.valid || !item.validation.rgb_matches_source || !item.validation.alpha_has_transparent_and_opaque) {
        throw new Error(`CUTOUT_VALIDATION_FAILED_${candidate.assetId}`)
      }
      const png = readFileSync(item.output)
      const key = cutoutStorageKey(candidate.assetId, candidate.version)
      const upload = await r2.client.fetch(`${r2.endpoint}/${r2.bucket}/${key}`, {
        method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png,
      })
      if (!upload.ok) throw new Error(`R2_UPLOAD_${upload.status}_${candidate.assetId}`)
      const { error } = await admin.from('media_asset_variants').upsert({
        asset_id: candidate.assetId, rendition: 'cutout', version: candidate.version,
        storage_key: key, mime_type: 'image/png', width: item.validation.width,
        height: item.validation.height, size_bytes: png.byteLength,
      }, { onConflict: 'asset_id,rendition,version', ignoreDuplicates: true })
      if (error) throw error
      console.info(JSON.stringify({ event: 'cutout.completed', assetId: candidate.assetId, key }))
    }
  } catch (error) {
    console.error(JSON.stringify({ event: 'cutout.failed', workspace: work, error: error instanceof Error ? error.message : String(error) }))
    throw error
  }
  rmSync(work, { recursive: true, force: true })
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
