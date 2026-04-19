/**
 * scripts/import-electives.ts
 *
 * Импорт факультативов из CSV в Supabase. Создаёт ноды типа elective
 * и ребра has_elective между PC и факультативом.
 *
 * Формат CSV (первая строка = заголовок):
 *   col 0: тип факультатива (kind)
 *   col 1: наименование
 *   col 2: ссылка на dnd.su / описание (link)
 *   col 3: комментарий
 *   col 4+: колонки по одной на каждого PC. Имя PC — в заголовке.
 *           Значение ячейки:
 *             - пусто → не брал
 *             - "Да" (любой регистр) → взял
 *             - любой другой непустой текст → взял, текст идёт в edge.meta.note
 *               (например, «Солинари», «Лунитари», «элек»)
 *
 * Usage:
 *   npm run import-electives -- --csv ./path/to/file.csv --campaign mat-ucheniya
 *
 * Идемпотентный:
 *   - Факультатив ищется по (kind, title); если есть — обновляется link/comment.
 *   - Если title пустой — используется (kind + first-20-chars-of-link) как fallback title.
 *   - Ребро has_elective уникально по (source, target, type) — ON CONFLICT DO NOTHING.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ─────────────────────────── Arg parsing ───────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const val = argv[i + 1]
      if (!val || val.startsWith('--')) {
        throw new Error(`Missing value for --${key}`)
      }
      out[key] = val
      i++
    }
  }
  return out
}

function loadEnvLocal() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return
  }
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      let val = trimmed.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {}
}

// ─────────────────────────── CSV parser (RFC 4180, with newlines in quoted) ───────────────────────────

/**
 * Parse CSV text into a 2D array of strings. Handles:
 *   - quoted fields with commas inside
 *   - quoted fields with newlines inside
 *   - escaped quotes ("" inside quoted field)
 *   - both \r\n and \n line endings
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }

    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      // \r\n → consume \n too
      if (text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }

  // Flush last field/row if file didn't end with newline
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

// ─────────────────────────── Helpers ───────────────────────────

function normalizeTitle(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

function cellIsTaken(value: string): boolean {
  return value.trim().length > 0
}

function cellNote(value: string): string | null {
  const v = value.trim()
  if (!v) return null
  // "Да" / "да" = plain yes, no special note
  if (v.toLowerCase() === 'да') return null
  return v
}

function deriveElectiveTitle(row: { title: string; kind: string; link: string }): string {
  if (row.title.trim()) return row.title.trim()
  // Fallback: extract slug tail from dnd.su link
  const m = row.link.match(/\/feats\/([^/]+)/i)
  if (m) return `[feat] ${m[1]}`
  if (row.link) return `[link] ${row.link.slice(0, 40)}`
  return `[unnamed elective]`
}

// ─────────────────────────── Main ───────────────────────────

async function main() {
  loadEnvLocal()

  const args = parseArgs(process.argv.slice(2))
  const csvPath = args.csv
  const campaignSlug = args.campaign ?? 'mat-ucheniya'

  if (!csvPath) {
    console.error('Usage: npm run import-electives -- --csv <path.csv> [--campaign <slug>]')
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
    process.exit(1)
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Resolve campaign + node_type + edge_type
  const { data: campaign } = await admin
    .from('campaigns')
    .select('id, name, slug')
    .eq('slug', campaignSlug)
    .single()
  if (!campaign) {
    console.error(`Campaign not found: ${campaignSlug}`)
    process.exit(1)
  }
  console.log(`→ Campaign: ${campaign.name} (${campaign.id})`)

  const { data: electiveType } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('slug', 'elective')
    .maybeSingle()
  if (!electiveType) {
    console.error("node_type 'elective' not found. Apply migration 029 first.")
    process.exit(1)
  }

  const { data: characterType } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('slug', 'character')
    .maybeSingle()
  if (!characterType) {
    console.error("node_type 'character' not found in this campaign.")
    process.exit(1)
  }

  const { data: hasElectiveType } = await admin
    .from('edge_types')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('slug', 'has_elective')
    .maybeSingle()
  if (!hasElectiveType) {
    console.error("edge_type 'has_elective' not found. Apply migration 029 first.")
    process.exit(1)
  }

  // 2. Load all PCs of this campaign
  const { data: pcs } = await admin
    .from('nodes')
    .select('id, title')
    .eq('campaign_id', campaign.id)
    .eq('type_id', characterType.id)
  const pcByName = new Map<string, { id: string; title: string }>()
  for (const p of pcs ?? []) {
    pcByName.set(normalizeTitle(p.title), p as { id: string; title: string })
  }
  console.log(`→ PCs in database: ${pcByName.size}`)

  // 3. Parse CSV
  const csvText = readFileSync(resolve(csvPath), 'utf-8')
  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    console.error('CSV is empty or has only header.')
    process.exit(1)
  }
  const header = rows[0]
  const pcColumns = header
    .map((h, idx) => ({ name: h.trim(), idx }))
    .filter((c) => c.idx >= 4 && c.name)
  console.log(`→ PC columns in CSV: ${pcColumns.map((c) => c.name).join(', ')}`)

  // 4. Resolve PC columns → PC node ids (report missing)
  //    Match strategy: exact title first, then "title starts with header"
  //    (handles short headers like "Альд" → "Альд Манкод", "Уини" → "Уинифред Прескотт").
  //    If startsWith is ambiguous (2+ candidates), skip with error.
  const allPcs = Array.from(pcByName.values())
  const pcColResolved: Array<{ name: string; idx: number; nodeId: string | null }> = []
  const ambiguous: Array<{ name: string; candidates: string[] }> = []
  for (const col of pcColumns) {
    const normalized = normalizeTitle(col.name)

    // 4a. Exact match
    let match = pcByName.get(normalized) ?? null

    // 4b. StartsWith fallback
    if (!match) {
      const candidates = allPcs.filter((p) => normalizeTitle(p.title).startsWith(normalized))
      if (candidates.length === 1) {
        match = candidates[0]
        console.log(`  ~ "${col.name}" → "${candidates[0].title}" (prefix match)`)
      } else if (candidates.length > 1) {
        ambiguous.push({ name: col.name, candidates: candidates.map((c) => c.title) })
      }
    }

    pcColResolved.push({ name: col.name, idx: col.idx, nodeId: match?.id ?? null })
  }
  if (ambiguous.length) {
    console.error('✗ Ambiguous CSV headers (multiple PCs match prefix):')
    for (const a of ambiguous) {
      console.error(`    "${a.name}" matches: ${a.candidates.join(', ')}`)
    }
    console.error('  Rename the CSV column to the full PC title to disambiguate.')
    process.exit(1)
  }
  const missing = pcColResolved.filter((c) => !c.nodeId).map((c) => c.name)
  if (missing.length) {
    console.warn(
      `⚠ CSV PCs not found in DB (skipped): ${missing.join(', ')}\n` +
        `  They'll still appear in electives as unlinked, create the PC in the catalog first.`,
    )
  }

  // 5. Upsert electives + edges
  let electivesCreated = 0
  let electivesUpdated = 0
  let edgesCreated = 0
  let edgesSkipped = 0

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (row.every((c) => c.trim() === '')) continue // blank row

    const kind = (row[0] ?? '').trim()
    const rawTitle = (row[1] ?? '').trim()
    const link = (row[2] ?? '').trim()
    const comment = (row[3] ?? '').trim()
    const title = deriveElectiveTitle({ title: rawTitle, kind, link })

    // Find existing by (campaign_id, type_id=elective, title)
    const { data: existing } = await admin
      .from('nodes')
      .select('id')
      .eq('campaign_id', campaign.id)
      .eq('type_id', electiveType.id)
      .eq('title', title)
      .maybeSingle()

    let nodeId: string
    const fields = { kind, link, comment }
    if (existing) {
      nodeId = existing.id
      await admin.from('nodes').update({ fields, updated_at: new Date().toISOString() }).eq('id', nodeId)
      electivesUpdated++
    } else {
      const { data: inserted, error: insErr } = await admin
        .from('nodes')
        .insert({
          campaign_id: campaign.id,
          type_id: electiveType.id,
          title,
          fields,
        })
        .select('id')
        .single()
      if (insErr || !inserted) {
        console.error(`Failed to insert elective "${title}":`, insErr?.message)
        continue
      }
      nodeId = inserted.id
      electivesCreated++
    }

    // Insert edges for each PC column that has a value in this row
    for (const col of pcColResolved) {
      if (!col.nodeId) continue
      const cell = row[col.idx] ?? ''
      if (!cellIsTaken(cell)) continue
      const note = cellNote(cell)

      const meta: Record<string, unknown> = note ? { note } : {}
      const { error: edgeErr } = await admin
        .from('edges')
        .upsert(
          {
            campaign_id: campaign.id,
            source_id: col.nodeId,
            target_id: nodeId,
            type_id: hasElectiveType.id,
            meta,
          },
          { onConflict: 'source_id,target_id,type_id', ignoreDuplicates: false },
        )
      if (edgeErr) {
        console.error(`Edge ${col.name} → ${title} failed:`, edgeErr.message)
        edgesSkipped++
      } else {
        edgesCreated++
      }
    }
  }

  console.log(`\n✓ Done:`)
  console.log(`  Electives created: ${electivesCreated}`)
  console.log(`  Electives updated: ${electivesUpdated}`)
  console.log(`  Edges created/upserted: ${edgesCreated}`)
  if (edgesSkipped) console.log(`  Edges skipped (errors): ${edgesSkipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
