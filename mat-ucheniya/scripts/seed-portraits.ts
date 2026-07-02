/**
 * scripts/seed-portraits.ts
 *
 * Заливка портретов персонажей в публичный R2-бакет + запись строк в
 * character_portraits (spec-046 → расширено spec-030: карусель + метаданные).
 *
 * Вход — локальная папка с картинками, где ИМЯ ФАЙЛА = title ноды:
 *   ./AI-Art/AI/Оливия Форсейл.png
 *   ./AI-Art/AI/Прадедушка Ираби.png
 *
 * Матчинг файл → нода (spec-030): по nodes.title в рамках кампании, среди
 * типов npc + creature. Тип character (PC) НЕ трогаем — портреты PC уже
 * залиты spec-046, а эти арты все NPC (Андрей, chat 2026-07-03); сверено —
 * ноль коллизий имён арта с PC-нодами. Порядок:
 *   1. ALIASES[stem] (явная замена, где имя файла ≠ title ноды);
 *   2. точный title;
 *   3. underscore→кавычки ("Оран Скарна _Ворчун_" → 'Оран Скарна "Ворчун"');
 *   4. карусель: "База, подпись" где База — точный title ноды (напр.
 *      «Кватач-Ичл, лич» / «…, человек» → одна нода «Кватач-Ичл», 4 портрета,
 *      подпись = часть после запятой).
 * Апострофы нормализуются (’ → '). Матч case-sensitive.
 *
 * Неоднозначные (title под >1 нодой, напр. «Нилбог» = npc и creature) —
 *   разрешаются через TYPE_PIN; иначе пропуск с пометкой.
 * Требующие решения DM (несколько кандидатов) — NEEDS_ANDREY: пропуск + крик.
 * Файлы ChatGPT-*.png (безымянные экспорты) — пропускаются.
 *
 * R2-ключ: одиночный портрет `<node_id><ext>` (совместимо с mig-116);
 *   карусельные — `<node_id>-<i><ext>`. Идемпотентно: перед записью все
 *   строки ноды из этого прогона удаляются и пишутся заново (⚠️ затрёт
 *   портреты, добавленные из UI, — это bulk-сидер, гоняем на чистых нодах).
 *
 * DRY RUN по умолчанию: печатает план, ничего не пишет. Запись — с --commit.
 *
 * Env (БД — целься сначала на staging, потом на прод):
 *   NEXT_PUBLIC_SUPABASE_URL   SUPABASE_SERVICE_ROLE_KEY
 * Env (R2, нужны только на --commit):
 *   R2_ACCESS_KEY_ID   R2_SECRET_ACCESS_KEY   R2_ENDPOINT   R2_BUCKET
 *
 * Usage:
 *   npm run seed-portraits -- --dir ./AI-Art/AI                  # dry run
 *   npm run seed-portraits -- --dir ./AI-Art/AI --commit         # залить
 *   npm run seed-portraits -- --dir ./AI-Art/AI --campaign mat-ucheniya --commit
 */

import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, basename, join } from 'node:path'

// Имя файла (без расширения) → точный title ноды, где они расходятся.
// Разрешено против живой БД (spec-030, прогон 2026-07-03).
const ALIASES: Record<string, string> = {
  // spec-030 (bulk NPC) — все разрешены против живой БД
  'Анека и Арми Ашера': 'Анека и Арми Аширай',
  'Боб Саймон': 'Саймон "Боб"',
  'Имайа Курошка': 'Имайя Курошка',
  Мерега: 'Мерега, дочь Агонии',
  Неолу: 'Неолу (Неолума-Ману Ильятир)',
  Новизна: 'Исполненная энтузиазма искательница новизны (Новизна)',
  'Савва Шрэк': 'Савва "Савочка" Шрэк',
  'Красный Плащ': 'Red Robe', // Андрей: chat 2026-07-03
  // подчёркивания = кавычки (см. underscoreToQuote), оставлены явно:
  'Оран Скарна _Ворчун_': 'Оран Скарна "Ворчун"',
  'Урик Крешна _Мямля_': 'Урик Крешна "Мямля"',
}

// Title существует под несколькими нодами → закрепить тип.
const TYPE_PIN: Record<string, string> = {
  Нилбог: 'npc', // Андрей: арт — непись, а не статблок-существо
}

// Несколько кандидатов, нужен выбор DM — пропустить с громкой пометкой.
// (Сейчас пусто — Красный Плащ разрешён в ALIASES → Red Robe.)
const NEEDS_ANDREY: Record<string, string> = {}

// PC (character) исключён намеренно — см. шапку файла.
const CHARACTER_TYPES = ['npc', 'creature']

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const CONTENT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function normalizeName(s: string): string {
  return s.replace(/[‘’ʼ`]/g, "'").trim()
}

/** "Оран Скарна _Ворчун_" → 'Оран Скарна "Ворчун"' (файловые кавычки). */
function underscoreToQuote(s: string): string {
  return s.replace(/_/g, '"')
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const key = a.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i++
    } else {
      out[key] = true
    }
  }
  return out
}

type NodeRow = { id: string; title: string; type: string }
type Placement = {
  file: string
  ext: string
  node: NodeRow
  caption: string | null
  sortOrder: number
  isPrimary: boolean
}

/** Look up nodes by (normalized) title, honoring an optional pinned type. */
function resolve(
  byTitle: Map<string, NodeRow[]>,
  title: string,
  pinType?: string,
): { hits: NodeRow[] } {
  let hits = byTitle.get(normalizeName(title)) ?? []
  if (pinType) hits = hits.filter((n) => n.type === pinType)
  return { hits }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dir = typeof args.dir === 'string' ? args.dir : ''
  const campaignSlug =
    typeof args.campaign === 'string' ? args.campaign : 'mat-ucheniya'
  const commit = args.commit === true

  if (!dir) {
    console.error(
      'Usage: npm run seed-portraits -- --dir <папка> [--campaign <slug>] [--commit]',
    )
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('❌ Задай NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  // R2 — только для записи.
  let r2: AwsClient | null = null
  const r2Endpoint = (process.env.R2_ENDPOINT ?? '').replace(/\/$/, '')
  const r2Bucket = process.env.R2_BUCKET ?? ''
  if (commit) {
    const id = process.env.R2_ACCESS_KEY_ID
    const secret = process.env.R2_SECRET_ACCESS_KEY
    if (!id || !secret || !r2Endpoint || !r2Bucket) {
      console.error(
        '❌ --commit требует R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET',
      )
      process.exit(1)
    }
    r2 = new AwsClient({
      accessKeyId: id,
      secretAccessKey: secret,
      service: 's3',
      region: 'auto',
    })
  }

  // Кампания.
  const { data: campaign } = await admin
    .from('campaigns')
    .select('id, name, slug')
    .eq('slug', campaignSlug)
    .maybeSingle()
  if (!campaign) {
    console.error(`❌ Кампания не найдена: ${campaignSlug}`)
    process.exit(1)
  }
  console.log(`→ Кампания: ${campaign.name}`)

  // Типы-персонажи (character + npc + creature) и их ноды.
  const { data: types } = await admin
    .from('node_types')
    .select('id, slug')
    .eq('campaign_id', campaign.id)
    .in('slug', CHARACTER_TYPES)
  const typeById = new Map<string, string>(
    (types ?? []).map((t: { id: string; slug: string }) => [t.id, t.slug]),
  )
  const typeIds = [...typeById.keys()]
  if (typeIds.length === 0) {
    console.error(`❌ Нет типов ${CHARACTER_TYPES.join('/')} в этой кампании`)
    process.exit(1)
  }
  const { data: nodes } = await admin
    .from('nodes')
    .select('id, title, type_id')
    .eq('campaign_id', campaign.id)
    .in('type_id', typeIds)

  const byTitle = new Map<string, NodeRow[]>()
  for (const n of (nodes ?? []) as Array<{ id: string; title: string; type_id: string }>) {
    const row: NodeRow = { id: n.id, title: n.title, type: typeById.get(n.type_id) ?? '?' }
    const k = normalizeName(n.title)
    const arr = byTitle.get(k) ?? []
    arr.push(row)
    byTitle.set(k, arr)
  }

  // ── Проход по файлам ────────────────────────────────────────────
  const singles: { file: string; ext: string; node: NodeRow }[] = []
  const carouselGroups = new Map<string, { node: NodeRow; items: { file: string; ext: string; caption: string }[] }>()
  const ambiguous: { file: string; reason: string }[] = []
  const unmatched: { file: string; reason: string }[] = []
  const needsAndrey: { file: string; reason: string }[] = []
  const skippedUnnamed: string[] = []

  const files = readdirSync(dir).filter((f) => IMAGE_EXT.has(extname(f).toLowerCase()))
  for (const file of files) {
    const ext = extname(file).toLowerCase()
    const stem = basename(file, extname(file))

    if (/^ChatGPT/i.test(stem)) {
      skippedUnnamed.push(file)
      continue
    }
    if (NEEDS_ANDREY[stem]) {
      needsAndrey.push({ file, reason: NEEDS_ANDREY[stem] })
      continue
    }

    // 1–3: точный / алиас / underscore-кавычки
    const candidates = [ALIASES[stem], stem, underscoreToQuote(stem)].filter(
      (v): v is string => typeof v === 'string',
    )
    let placed = false
    for (const cand of candidates) {
      const { hits } = resolve(byTitle, cand, TYPE_PIN[stem])
      if (hits.length === 1) {
        singles.push({ file, ext, node: hits[0] })
        placed = true
        break
      }
      if (hits.length > 1) {
        ambiguous.push({
          file,
          reason: `title "${cand}" под ${hits.length} нодами (${hits.map((h) => h.type).join('/')}) — добавь в TYPE_PIN`,
        })
        placed = true
        break
      }
    }
    if (placed) continue

    // 4: карусель — "База, подпись", где База — точный title ноды
    if (stem.includes(',')) {
      const base = stem.slice(0, stem.indexOf(',')).trim()
      const caption = stem.slice(stem.indexOf(',') + 1).trim()
      const { hits } = resolve(byTitle, base, TYPE_PIN[base])
      if (hits.length === 1) {
        const g = carouselGroups.get(hits[0].id) ?? { node: hits[0], items: [] }
        g.items.push({ file, ext, caption })
        carouselGroups.set(hits[0].id, g)
        continue
      }
    }

    unmatched.push({ file, reason: `нет ноды с title "${normalizeName(stem)}"` })
  }

  // ── Собрать финальные placements ────────────────────────────────
  const placements: Placement[] = []
  for (const s of singles) {
    placements.push({ file: s.file, ext: s.ext, node: s.node, caption: null, sortOrder: 0, isPrimary: true })
  }
  for (const g of carouselGroups.values()) {
    const items = [...g.items].sort((a, b) => a.file.localeCompare(b.file, 'ru'))
    items.forEach((it, i) => {
      placements.push({
        file: it.file,
        ext: it.ext,
        node: g.node,
        caption: it.caption || null,
        sortOrder: i,
        isPrimary: i === 0,
      })
    })
  }

  const placedNodeIds = new Set(placements.map((p) => p.node.id))
  const noPortrait = ((nodes ?? []) as Array<{ id: string; title: string }>)
    .filter((n) => !placedNodeIds.has(n.id))
    .map((n) => n.title)

  // ── Отчёт ───────────────────────────────────────────────────────
  console.log(`\nОдиночных портретов: ${singles.length}`)
  console.log(`Карусельных нод: ${carouselGroups.size} (портретов: ${placements.length - singles.length})`)
  for (const g of carouselGroups.values()) {
    console.log(`  🎠 ${g.node.title} [${g.node.type}] — ${g.items.length}: ${g.items.map((i) => i.caption).join(', ')}`)
  }
  console.log(`Всего файлов к заливке: ${placements.length}`)

  if (needsAndrey.length) {
    console.log(`\n🧑 Нужно решение DM: ${needsAndrey.length}`)
    for (const u of needsAndrey) console.log(`     ${u.file} — ${u.reason}`)
  }
  if (ambiguous.length) {
    console.log(`\n⚠️ Неоднозначно: ${ambiguous.length}`)
    for (const u of ambiguous) console.log(`     ${u.file} — ${u.reason}`)
  }
  if (unmatched.length) {
    console.log(`\n❌ Не сопоставлено: ${unmatched.length}`)
    for (const u of unmatched) console.log(`     ${u.file} — ${u.reason}`)
  }
  if (skippedUnnamed.length) {
    console.log(`\n↪ Пропущено безымянных (ChatGPT-*): ${skippedUnnamed.length}`)
  }
  if (noPortrait.length) {
    console.log(`\n· Ноды без портрета: ${noPortrait.length}`)
  }

  if (!commit) {
    console.log('\n— DRY RUN: ничего не записано. Перезапусти с --commit, когда план устроит.')
    return
  }

  // ── Запись ──────────────────────────────────────────────────────
  console.log('\nЗаливаю в R2 и пишу строки…')
  let ok = 0
  for (const nodeId of placedNodeIds) {
    // Идемпотентность: снять все строки ноды из этого прогона, залить набор.
    await admin.from('character_portraits').delete().eq('character_node_id', nodeId)
  }
  for (const p of placements) {
    const key = p.sortOrder === 0 && placements.filter((q) => q.node.id === p.node.id).length === 1
      ? `${p.node.id}${p.ext}`
      : `${p.node.id}-${p.sortOrder}${p.ext}`
    const body = new Uint8Array(readFileSync(join(dir, p.file)))
    const put = await r2!.fetch(`${r2Endpoint}/${r2Bucket}/${key}`, {
      method: 'PUT',
      body,
      headers: { 'content-type': CONTENT_TYPE[p.ext] ?? 'application/octet-stream' },
    })
    if (!put.ok) {
      console.log(`  ❌ ${p.node.title} (${p.file}): R2 ${put.status}`)
      continue
    }
    const { error } = await admin.from('character_portraits').insert({
      character_node_id: p.node.id,
      r2_key: key,
      is_primary: p.isPrimary,
      sort_order: p.sortOrder,
      caption: p.caption,
    })
    if (error) {
      console.log(`  ❌ ${p.node.title} (${p.file}): ${error.message}`)
      continue
    }
    ok++
  }
  console.log(`\n✅ Готово: ${ok}/${placements.length} портретов залито и записано.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
