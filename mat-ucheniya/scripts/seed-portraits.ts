/**
 * scripts/seed-portraits.ts
 *
 * Заливка портретов персонажей в публичный R2-бакет + запись primary-строк
 * в character_portraits (spec-046, T022).
 *
 * Вход — локальная папка с картинками, где ИМЯ ФАЙЛА = имя персонажа:
 *   ./portraits/Британия Мерц.png
 *   ./portraits/Зак Новеда.png
 * (Папку скачай из Google Drive: выдели всё → Download → распакуй. Идзаи
 *  положи туда же, назвав файл точно как title его ноды.)
 *
 * Матчинг файл → нода:
 *   trim → нормализация апострофов (’ → ') → таблица ALIASES → точный
 *   case-sensitive матч по nodes.title в рамках кампании.
 * Файлы с запятой в имени ("Роза Тиссмур, в чёрном") — альтернативные
 *   портреты; в v0 пропускаются (нет колонки под подпись — уйдут в
 *   карусель-спеку).
 *
 * R2-ключ стабильный: `<node_id><ext>`. Идемпотентно — повторный прогон
 *   перезаливает объект и заменяет primary-строку.
 *
 * DRY RUN по умолчанию: печатает план и НИЧЕГО не пишет. Запись — с --commit.
 *
 * Env (БД — целься сначала на staging, потом на прод):
 *   NEXT_PUBLIC_SUPABASE_URL   SUPABASE_SERVICE_ROLE_KEY
 * Env (R2, нужны только на --commit):
 *   R2_ACCESS_KEY_ID   R2_SECRET_ACCESS_KEY   R2_ENDPOINT   R2_BUCKET
 *
 * Usage:
 *   npm run seed-portraits -- --dir ./portraits                  # dry run
 *   npm run seed-portraits -- --dir ./portraits --commit         # залить
 *   npm run seed-portraits -- --dir ./portraits --campaign mat-ucheniya --commit
 */

import { createClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'
import { readdirSync, readFileSync } from 'node:fs'
import { extname, basename, join } from 'node:path'

// Имя файла (без расширения) → точный title ноды, где они расходятся.
const ALIASES: Record<string, string> = {
  'Фрэд Белум': 'Фред Белум',
  Киллиан: 'Киллиан Дрейфус',
  'Бальтазар Неотразимый': 'Бальтазар Неотразимый a.k.a Морис Хампердинк',
  // Идзаи: '<точный title ноды>',  // TODO: заполнить, когда узнаем ноду Идзаи
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])
const CONTENT_TYPE: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
}

function normalizeName(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC\u0060]/g, "'").trim()
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

type NodeRow = { id: string; title: string }

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

  // Типы-персонажи и ноды (в рамках кампании).
  const { data: types } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('slug', 'character')
  const typeIds = (types ?? []).map((t: { id: string }) => t.id)
  if (typeIds.length === 0) {
    console.error('❌ Нет типа ноды character в этой кампании')
    process.exit(1)
  }
  const { data: nodes } = await admin
    .from('nodes')
    .select('id, title')
    .eq('campaign_id', campaign.id)
    .in('type_id', typeIds)

  const byTitle = new Map<string, NodeRow[]>()
  for (const n of (nodes ?? []) as NodeRow[]) {
    const k = normalizeName(n.title)
    const arr = byTitle.get(k) ?? []
    arr.push(n)
    byTitle.set(k, arr)
  }

  // Файлы.
  const matched: { file: string; ext: string; node: NodeRow }[] = []
  const skippedAlt: string[] = []
  const unmatched: { file: string; reason: string }[] = []
  const seen = new Set<string>()

  for (const file of readdirSync(dir)) {
    const ext = extname(file).toLowerCase()
    if (!IMAGE_EXT.has(ext)) continue
    const stem = basename(file, extname(file))
    if (stem.includes(',')) {
      skippedAlt.push(file)
      continue
    }
    const wanted = normalizeName(ALIASES[stem] ?? stem)
    const hits = byTitle.get(wanted) ?? []
    if (hits.length === 1) {
      matched.push({ file, ext, node: hits[0] })
      seen.add(hits[0].id)
    } else if (hits.length > 1) {
      unmatched.push({
        file,
        reason: `неоднозначно: ${hits.length} нод с title "${wanted}"`,
      })
    } else {
      unmatched.push({ file, reason: `нет ноды с title "${wanted}"` })
    }
  }

  const noPortrait = ((nodes ?? []) as NodeRow[])
    .filter((n) => !seen.has(n.id))
    .map((n) => n.title)

  // Отчёт.
  console.log(`\nСопоставлено: ${matched.length}`)
  for (const m of matched) console.log(`  ✅ ${m.file}  →  ${m.node.title}`)
  if (skippedAlt.length) {
    console.log(
      `\n↪ Пропущено (альтернативные портреты → карусель-спека): ${skippedAlt.length}`,
    )
    for (const f of skippedAlt) console.log(`     ${f}`)
  }
  if (unmatched.length) {
    console.log(`\n❌ Не сопоставлено: ${unmatched.length}`)
    for (const u of unmatched) console.log(`     ${u.file} — ${u.reason}`)
  }
  if (noPortrait.length) {
    console.log(`\n· Без портрета (нода есть, файла нет): ${noPortrait.length}`)
    for (const t of noPortrait) console.log(`     ${t}`)
  }

  if (!commit) {
    console.log(
      '\n— DRY RUN: ничего не записано. Перезапусти с --commit, когда план устроит.',
    )
    return
  }

  console.log('\nЗаливаю в R2 и пишу строки…')
  let ok = 0
  for (const m of matched) {
    const key = `${m.node.id}${m.ext}`
    const body = new Uint8Array(readFileSync(join(dir, m.file)))
    const put = await r2!.fetch(`${r2Endpoint}/${r2Bucket}/${key}`, {
      method: 'PUT',
      body,
      headers: {
        'content-type': CONTENT_TYPE[m.ext] ?? 'application/octet-stream',
      },
    })
    if (!put.ok) {
      console.log(`  ❌ ${m.node.title}: R2 ${put.status}`)
      continue
    }
    await admin
      .from('character_portraits')
      .delete()
      .eq('character_node_id', m.node.id)
      .eq('is_primary', true)
    const { error } = await admin
      .from('character_portraits')
      .insert({ character_node_id: m.node.id, r2_key: key, is_primary: true })
    if (error) {
      console.log(`  ❌ ${m.node.title}: ${error.message}`)
      continue
    }
    ok++
  }
  console.log(`\n✅ Готово: ${ok}/${matched.length} портретов залито и записано.`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
