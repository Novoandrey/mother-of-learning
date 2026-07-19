/**
 * Import the pre-media-library art without duplicating portrait originals.
 *
 * Default mode is a dry run. `--commit` creates media_assets and node links;
 * portraits reuse their existing character_portraits.r2_key. The optional
 * Nikita world JSON contributes only its map.backgroundUrl.
 */

import { AwsClient } from 'aws4fetch'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { basename, extname, join } from 'node:path'
import { readFileSync, readdirSync } from 'node:fs'
import { hasMatchingImageSignature, isSupportedImageType } from '../lib/image-signatures'

const IMAGE_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/webp'> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

const ALIASES: Record<string, string> = {
  'Анека и Арми Ашера': 'Анека и Арми Аширай',
  'Боб Саймон': 'Саймон "Боб"',
  'Имайа Курошка': 'Имайя Курошка',
  Мерега: 'Мерега, дочь Агонии',
  Неолу: 'Неолу (Неолума-Ману Ильятир)',
  Новизна: 'Исполненная энтузиазма искательница новизны (Новизна)',
  'Савва Шрэк': 'Савва "Савочка" Шрэк',
  'Красный Плащ': 'Red Robe',
  'Аэриси Калинос': 'Аериси Калинос',
  Серега: 'Серёга',
  'Оран Скарна _Ворчун_': 'Оран Скарна "Ворчун"',
  'Урик Крешна _Мямля_': 'Урик Крешна "Мямля"',
}

const TYPE_PINS: Record<string, string> = { Нилбог: 'npc' }

type NodeRow = { id: string; title: string; type_id: string }
type PortraitRow = {
  character_node_id: string
  r2_key: string
  sort_order: number
  caption: string | null
}

type ImportPlan = {
  filename: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  sizeBytes: number
  storageKey: string
  importSource: string
  nodeId: string | null
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

function isCommit(): boolean {
  return process.argv.includes('--commit')
}

function captionFor(stem: string): string | null {
  if (!stem.includes(',')) return null
  return stem.slice(stem.indexOf(',') + 1).trim() || null
}

function titleCandidates(stem: string): string[] {
  return [ALIASES[stem], stem, stem.replace(/_/g, '"')].filter(
    (value): value is string => Boolean(value),
  )
}

function resolveNode(
  byTitle: Map<string, NodeRow[]>,
  typeById: Map<string, string>,
  stem: string,
): { node: NodeRow; isCarousel: boolean } {
  const candidates = [...titleCandidates(stem)]

  for (const title of candidates) {
    let matches = byTitle.get(title) ?? []
    const pin = TYPE_PINS[stem] ?? TYPE_PINS[title]
    if (pin) matches = matches.filter((node) => typeById.get(node.type_id) === pin)
    if (matches.length === 1) return { node: matches[0], isCarousel: false }
    if (matches.length > 1) throw new Error(`AMBIGUOUS_NODE:${stem}`)
  }

  if (stem.includes(',')) {
    const title = stem.slice(0, stem.indexOf(',')).trim()
    let matches = byTitle.get(title) ?? []
    const pin = TYPE_PINS[title]
    if (pin) matches = matches.filter((node) => typeById.get(node.type_id) === pin)
    if (matches.length === 1) return { node: matches[0], isCarousel: true }
    if (matches.length > 1) throw new Error(`AMBIGUOUS_NODE:${stem}`)
  }

  throw new Error(`NODE_NOT_FOUND:${stem}`)
}

function portraitFor(
  portraitsByNode: Map<string, PortraitRow[]>,
  nodeId: string,
  caption: string | null,
): PortraitRow {
  const matches = (portraitsByNode.get(nodeId) ?? []).filter(
    (portrait) => (portrait.caption ?? null) === caption,
  )
  if (matches.length !== 1) throw new Error(`PORTRAIT_NOT_FOUND:${nodeId}:${caption ?? 'primary'}`)
  return matches[0]
}

function readLocalPlan(dir: string, nodes: NodeRow[], typeById: Map<string, string>, portraits: PortraitRow[]): ImportPlan[] {
  const byTitle = new Map<string, NodeRow[]>()
  for (const node of nodes) byTitle.set(node.title, [...(byTitle.get(node.title) ?? []), node])
  const portraitsByNode = new Map<string, PortraitRow[]>()
  for (const portrait of portraits) {
    portraitsByNode.set(portrait.character_node_id, [...(portraitsByNode.get(portrait.character_node_id) ?? []), portrait])
  }

  return readdirSync(dir)
    .filter((filename) => IMAGE_TYPES[extname(filename).toLowerCase()])
    .sort((left, right) => left.localeCompare(right, 'ru'))
    .map((filename) => {
      const extension = extname(filename).toLowerCase()
      const mimeType = IMAGE_TYPES[extension]
      const bytes = readFileSync(join(dir, filename))
      if (!mimeType || !isSupportedImageType(mimeType) || !hasMatchingImageSignature(mimeType, bytes.subarray(0, 12))) {
        throw new Error(`INVALID_LOCAL_IMAGE:${filename}`)
      }
      const stem = basename(filename, extension)
      const resolved = resolveNode(byTitle, typeById, stem)
      const portrait = portraitFor(
        portraitsByNode,
        resolved.node.id,
        resolved.isCarousel ? captionFor(stem) : null,
      )
      return {
        filename,
        mimeType,
        sizeBytes: bytes.length,
        storageKey: portrait.r2_key,
        importSource: `legacy:portrait:${portrait.r2_key}`,
        nodeId: resolved.node.id,
      }
    })
}

async function mapPlan(worldPath: string, campaignId: string): Promise<ImportPlan | null> {
  const world = JSON.parse(readFileSync(worldPath, 'utf8')) as { map?: { backgroundUrl?: string | null } }
  const url = world.map?.backgroundUrl
  if (!url) return null
  const response = await fetch(url)
  if (!response.ok) throw new Error(`NIKITA_MAP_DOWNLOAD_FAILED:${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const mimeType = response.headers.get('content-type')?.split(';')[0].toLowerCase() ?? ''
  if (!isSupportedImageType(mimeType) || !hasMatchingImageSignature(mimeType, bytes.subarray(0, 12))) {
    throw new Error('NIKITA_MAP_IS_NOT_SUPPORTED_IMAGE')
  }
  const extension = IMAGE_TYPES && ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' } as const)[mimeType]
  const digest = createHash('sha256').update(bytes).digest('hex')
  return {
    filename: 'Глубинные подземелья под Сиорией' + extension,
    mimeType,
    sizeBytes: bytes.length,
    storageKey: `media/${campaignId}/legacy/nikita-map-${digest}${extension}`,
    importSource: `legacy:nikita-map:${url}`,
    nodeId: null,
  }
}

async function uploadMap(plan: ImportPlan, worldPath: string): Promise<void> {
  const world = JSON.parse(readFileSync(worldPath, 'utf8')) as { map?: { backgroundUrl?: string | null } }
  const url = world.map?.backgroundUrl
  if (!url) return
  const endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const bucket = process.env.R2_BUCKET ?? ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? ''
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) throw new Error('R2_CONFIGURATION_MISSING')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`NIKITA_MAP_DOWNLOAD_FAILED:${response.status}`)
  const bytes = await response.arrayBuffer()
  const r2 = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' })
  const uploaded = await r2.fetch(`${endpoint}/${bucket}/${plan.storageKey}`, {
    method: 'PUT',
    headers: { 'content-type': plan.mimeType },
    body: bytes,
  })
  if (!uploaded.ok) throw new Error(`NIKITA_MAP_UPLOAD_FAILED:${uploaded.status}`)
}

async function main() {
  const dir = argument('dir')
  const worldPath = argument('nikita-world')
  const campaignSlug = argument('campaign') ?? 'mat-ucheniya'
  if (!dir) throw new Error('USAGE: --dir <portrait directory> [--nikita-world <world.json>] [--campaign <slug>] [--commit]')

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('SUPABASE_CONFIGURATION_MISSING')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const { data: campaign } = await admin.from('campaigns').select('id').eq('slug', campaignSlug).maybeSingle()
  if (!campaign) throw new Error(`CAMPAIGN_NOT_FOUND:${campaignSlug}`)
  const { data: types } = await admin.from('node_types').select('id, slug').eq('campaign_id', campaign.id).eq('slug', 'npc')
  const typeById = new Map((types ?? []).map((type: { id: string; slug: string }) => [type.id, type.slug]))
  const { data: nodes } = await admin.from('nodes').select('id, title, type_id').eq('campaign_id', campaign.id).in('type_id', [...typeById.keys()])
  const { data: portraits } = await admin.from('character_portraits').select('character_node_id, r2_key, sort_order, caption').in('character_node_id', (nodes ?? []).map((node: NodeRow) => node.id))

  const plans = readLocalPlan(dir, (nodes ?? []) as NodeRow[], typeById, (portraits ?? []) as PortraitRow[])
  const map = worldPath ? await mapPlan(worldPath, campaign.id) : null
  if (map) plans.push(map)
  console.log(JSON.stringify({ campaignSlug, portraits: plans.filter((plan) => plan.nodeId).length, maps: plans.filter((plan) => !plan.nodeId).length, commit: isCommit() }))
  if (!isCommit()) return

  const existingSources = new Set((await admin.from('media_assets').select('import_source').eq('campaign_id', campaign.id).in('import_source', plans.map((plan) => plan.importSource))).data?.map((asset) => asset.import_source) ?? [])
  for (const plan of plans) {
    if (!existingSources.has(plan.importSource) && !plan.nodeId && worldPath) await uploadMap(plan, worldPath)
    const { data: existing } = await admin.from('media_assets').select('id').eq('campaign_id', campaign.id).eq('import_source', plan.importSource).maybeSingle()
    const { data: asset, error } = existing ? { data: existing, error: null } : await admin.from('media_assets').insert({
      campaign_id: campaign.id,
      storage_key: plan.storageKey,
      original_filename: plan.filename,
      mime_type: plan.mimeType,
      size_bytes: plan.sizeBytes,
      import_source: plan.importSource,
    }).select('id').single()
    if (error || !asset) throw new Error(`ASSET_WRITE_FAILED:${plan.filename}`)
    if (plan.nodeId) {
      const { error: linkError } = await admin.from('media_asset_node_links').upsert({ media_asset_id: asset.id, node_id: plan.nodeId }, { onConflict: 'media_asset_id,node_id', ignoreDuplicates: true })
      if (linkError) throw new Error(`LINK_WRITE_FAILED:${plan.filename}`)
    }
  }
  console.log(JSON.stringify({ imported: plans.length }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'UNKNOWN_IMPORT_ERROR')
  process.exit(1)
})
