/**
 * MEDIA-04: link legacy character_portraits rows to existing media_assets.
 *
 * Dry-run is the default. --commit updates only media_asset_id; it never
 * uploads R2 objects or changes portrait order, primary state, crop or r2_key.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

type PortraitRow = {
  id: string
  r2_key: string | null
  media_asset_id: string | null
  character_node_id: string
  node: { campaign_id: string } | { campaign_id: string }[] | null
}
type AssetRow = { id: string; campaign_id: string; storage_key: string; variant_version: number }
type VariantRow = { asset_id: string; rendition: string; version: number; storage_key: string }

async function main() {
const { data: portraitData, error: portraitsError } = await admin
  .from('character_portraits')
  .select('id, r2_key, media_asset_id, character_node_id, node:nodes!inner(campaign_id)')
if (portraitsError) throw portraitsError
const { data: assetData, error: assetsError } = await admin
  .from('media_assets')
  .select('id, campaign_id, storage_key, variant_version')
if (assetsError) throw assetsError
const { data: variantData, error: variantsError } = await admin
  .from('media_asset_variants')
  .select('asset_id, rendition, version, storage_key')
  .eq('rendition', 'preview')
if (variantsError) throw variantsError

const assetsBySource = new Map<string, AssetRow[]>()
const assetsById = new Map<string, AssetRow>()
for (const asset of (assetData ?? []) as AssetRow[]) {
  assetsById.set(asset.id, asset)
  const key = `${asset.campaign_id}\0${asset.storage_key}`
  assetsBySource.set(key, [...(assetsBySource.get(key) ?? []), asset])
}
const previewByAsset = new Map((variantData ?? [])
  .filter((variant) => {
    const asset = assetsById.get((variant as VariantRow).asset_id)
    return asset?.variant_version === (variant as VariantRow).version
  })
  .map((variant) => [(variant as VariantRow).asset_id, (variant as VariantRow).storage_key]))

const seenUsage = new Set<string>()
const updateRows: Array<{ portraitId: string; assetId: string; previewKey: string }> = []
const report = { alreadyLinked: 0, exactMatch: 0, noMatch: 0, ambiguous: 0, duplicate: 0 }
const failures: Array<{ portraitId: string; reason: string }> = []

for (const portrait of (portraitData ?? []) as PortraitRow[]) {
  if (portrait.media_asset_id) {
    report.alreadyLinked++
    const previewKey = previewByAsset.get(portrait.media_asset_id)
    if (previewKey && portrait.r2_key !== previewKey) updateRows.push({ portraitId: portrait.id, assetId: portrait.media_asset_id, previewKey })
    continue
  }
  const node = Array.isArray(portrait.node) ? portrait.node[0] : portrait.node
  const matches = node && portrait.r2_key ? assetsBySource.get(`${node.campaign_id}\0${portrait.r2_key}`) ?? [] : []
  if (matches.length === 0) { report.noMatch++; failures.push({ portraitId: portrait.id, reason: 'NO_MATCH' }); continue }
  if (matches.length > 1) { report.ambiguous++; failures.push({ portraitId: portrait.id, reason: 'AMBIGUOUS_MATCH' }); continue }
  const assetId = matches[0].id
  const previewKey = previewByAsset.get(assetId)
  if (!previewKey) { report.noMatch++; failures.push({ portraitId: portrait.id, reason: 'PREVIEW_NOT_READY' }); continue }
  const usageKey = `${portrait.character_node_id}\0${assetId}`
  if (seenUsage.has(usageKey)) { report.duplicate++; failures.push({ portraitId: portrait.id, reason: 'DUPLICATE_USAGE' }); continue }
  seenUsage.add(usageKey)
  report.exactMatch++
  updateRows.push({ portraitId: portrait.id, assetId, previewKey })
}

console.info(JSON.stringify({ target: production ? 'production' : 'default', mode: commit ? 'commit' : 'dry-run', ...report, failures }, null, 2))
if (report.ambiguous || report.duplicate) process.exitCode = 2
if (commit && !process.exitCode) {
  for (const row of updateRows) {
    const { error } = await admin.from('character_portraits').update({ media_asset_id: row.assetId, r2_key: row.previewKey }).eq('id', row.portraitId)
    if (error) throw error
  }
  console.info(JSON.stringify({ event: 'media.portrait_backfill.completed', updated: updateRows.length }))
}
}

void main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
