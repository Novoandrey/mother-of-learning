/**
 * scripts/spells-dndsu-codegen.ts — spec-059 этап 1.
 *
 * Форк scripts/items-dndsu-codegen.ts. Читает `scripts/dndsu_spells.json`
 * (продукт scrape_dndsu_spells.py), дедупит по slug, сортирует и эмитит
 * один из двух артефактов:
 *
 *   1. Default (без флага): пишет `lib/seeds/spells-dndsu.ts` с
 *      `SPELLS_DNDSU_SEED: ReadonlyArray<SpellSeedEntry>`.
 *
 *      $ npx tsx scripts/spells-dndsu-codegen.ts
 *
 *   2. `--emit-migrations`: пишет по одному
 *      `supabase/migrations/NNN_dndsu_<книга>_spells.sql` на книгу-источник,
 *      начиная с START_MIGRATION_NUMBER (140 — координатор spec-059 занял
 *      130/132 + резерв 131,133-139 под механику; переопределяется
 *      `--start-num N`). Каждая миграция идемпотентна через NOT EXISTS
 *      guard на (campaign_id, type_id spell, fields->>'slug').
 *
 *      $ npx tsx scripts/spells-dndsu-codegen.ts --emit-migrations
 *      $ npx tsx scripts/spells-dndsu-codegen.ts --emit-migrations --start-num 140
 *
 * Тело редакции 2014 -> nodes.content; тело 2024 -> fields.content_2024
 * (nullable). Горячие поля (level/school/…/slug) -> nodes.fields, форма
 * совпадает с node_type default_fields (миграция 130 / lib/seeds/dnd5e-srd.ts).
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// Базовый номер сид-миграций spec-059 (см. заголовок). Явный, НЕ через
// nextMigrationNumber — координатор параллельно занял соседние номера.
const START_MIGRATION_NUMBER = 140

// ---------------------------------------------------------------------------
// Raw JSON shape (совпадает с Python SpellRecord.to_dict).
// ---------------------------------------------------------------------------

type DndsuSpellRaw = {
  slug: string
  title_ru: string
  title_en: string | null
  level: number
  school: string | null
  casting_time: string | null
  range: string | null
  components: string | null
  duration: string | null
  concentration: boolean
  ritual: boolean
  classes: string[]
  source: string | null
  source_short: string | null
  content: string
  content_2024: string | null
  dndsu_url: string
  dndsu_url_2024: string | null
  _warnings: string[]
}

// ---------------------------------------------------------------------------
// Seed entry shape (для lib/seeds/spells-dndsu.ts).
// ---------------------------------------------------------------------------

export type SpellSeedEntry = {
  slug: string
  titleRu: string
  titleEn: string | null
  level: number
  school: string | null
  castingTime: string | null
  range: string | null
  components: string | null
  duration: string | null
  concentration: boolean
  ritual: boolean
  classes: string // classes джойнятся в строку (форма fields.classes = '')
  source: string | null
  content: string // markdown-тело 2014 (или 2024 для 2024-only)
  content2024: string | null
  dndsuUrl: string
  dndsuUrl2024: string | null
}

function rawToSeedEntry(r: DndsuSpellRaw): SpellSeedEntry {
  if (r.level < 0 || r.level > 9) {
    throw new Error(`invalid level ${r.level} for spell ${r.slug}`)
  }
  return {
    slug: r.slug,
    titleRu: r.title_ru,
    titleEn: r.title_en,
    level: r.level,
    school: r.school,
    castingTime: r.casting_time,
    range: r.range,
    components: r.components,
    duration: r.duration,
    concentration: r.concentration,
    ritual: r.ritual,
    classes: (r.classes ?? []).join(', '),
    source: r.source,
    content: r.content,
    content2024: r.content_2024,
    dndsuUrl: r.dndsu_url,
    dndsuUrl2024: r.dndsu_url_2024,
  }
}

function dedupInternal(entries: SpellSeedEntry[]): {
  kept: SpellSeedEntry[]
  dropped: { slug: string; reason: string }[]
} {
  const seen = new Map<string, SpellSeedEntry>()
  const dropped: { slug: string; reason: string }[] = []
  for (const e of entries) {
    if (seen.has(e.slug)) {
      dropped.push({ slug: e.slug, reason: 'duplicate slug (kept first)' })
    } else {
      seen.set(e.slug, e)
    }
  }
  return { kept: Array.from(seen.values()), dropped }
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = path.dirname(__filename)
const REPO_DIR = path.dirname(SCRIPTS_DIR) // mat-ucheniya/
const JSON_PATH = path.join(SCRIPTS_DIR, 'dndsu_spells.json')
const SEED_OUT = path.join(REPO_DIR, 'lib', 'seeds', 'spells-dndsu.ts')
const MIGRATIONS_DIR = path.join(REPO_DIR, 'supabase', 'migrations')

function loadJson(): DndsuSpellRaw[] {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(
      `Missing ${JSON_PATH}. Run scrape_dndsu_spells.py first ` +
        `(python scripts/scrape_dndsu_spells.py [--max-level N]).`,
    )
  }
  return JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
}

// ---------------------------------------------------------------------------
// TS const emit
// ---------------------------------------------------------------------------

function tsLit(v: string): string {
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}

function tsLitOrNull(v: string | null): string {
  return v === null ? 'null' : tsLit(v)
}

function emitTsEntry(e: SpellSeedEntry): string {
  const parts: string[] = []
  parts.push(`slug: ${tsLit(e.slug)}`)
  parts.push(`titleRu: ${tsLit(e.titleRu)}`)
  parts.push(`titleEn: ${tsLitOrNull(e.titleEn)}`)
  parts.push(`level: ${e.level}`)
  parts.push(`school: ${tsLitOrNull(e.school)}`)
  parts.push(`castingTime: ${tsLitOrNull(e.castingTime)}`)
  parts.push(`range: ${tsLitOrNull(e.range)}`)
  parts.push(`components: ${tsLitOrNull(e.components)}`)
  parts.push(`duration: ${tsLitOrNull(e.duration)}`)
  parts.push(`concentration: ${e.concentration}`)
  parts.push(`ritual: ${e.ritual}`)
  parts.push(`classes: ${tsLit(e.classes)}`)
  parts.push(`source: ${tsLitOrNull(e.source)}`)
  parts.push(`content: ${tsLit(e.content)}`)
  parts.push(`content2024: ${tsLitOrNull(e.content2024)}`)
  parts.push(`dndsuUrl: ${tsLit(e.dndsuUrl)}`)
  parts.push(`dndsuUrl2024: ${tsLitOrNull(e.dndsuUrl2024)}`)
  return `  { ${parts.join(', ')} },`
}

function emitTsSeed(entries: SpellSeedEntry[]): string {
  const sorted = [...entries].sort(
    (a, b) => a.level - b.level || a.slug.localeCompare(b.slug),
  )
  const lines = sorted.map(emitTsEntry).join('\n')
  return `/**
 * Auto-generated by scripts/spells-dndsu-codegen.ts — DO NOT edit by hand.
 *
 * Заклинания dnd.su (spec-059, этап 1). Две редакции слиты по slug:
 * \`content\` — markdown-тело 2014, \`content2024\` — тело 2024 (nullable).
 *
 * Ключ идемпотентности сид-миграций: \`(campaign_id, node_type spell,
 * fields->>'slug')\`. Миграции 140+ вставляют только новые slug и не
 * перетирают правки ДМ.
 *
 * Regenerate:
 *   $ python scripts/scrape_dndsu_spells.py
 *   $ npx tsx scripts/spells-dndsu-codegen.ts
 */

export type SpellSeedEntry = {
  slug: string
  titleRu: string
  titleEn: string | null
  level: number
  school: string | null
  castingTime: string | null
  range: string | null
  components: string | null
  duration: string | null
  concentration: boolean
  ritual: boolean
  classes: string
  source: string | null
  content: string
  content2024: string | null
  dndsuUrl: string
  dndsuUrl2024: string | null
}

export const SPELLS_DNDSU_SEED: ReadonlyArray<SpellSeedEntry> = [
${lines}
]
`
}

// ---------------------------------------------------------------------------
// SQL migration emit (per source book)
// ---------------------------------------------------------------------------

function escSqlString(s: string): string {
  return s.replace(/'/g, "''")
}

function strLit(v: string | null | undefined): string {
  if (v === null || v === undefined) return 'null'
  return `'${escSqlString(v)}'`
}

function bool(v: boolean): string {
  return v ? 'true' : 'false'
}

function tupleFor(e: SpellSeedEntry): string {
  // Порядок колонок = seed(...) CTE ниже.
  return [
    strLit(e.slug),
    strLit(e.titleRu),
    String(e.level),
    strLit(e.school),
    strLit(e.castingTime),
    strLit(e.range),
    strLit(e.components),
    strLit(e.duration),
    bool(e.concentration),
    bool(e.ritual),
    strLit(e.classes),
    strLit(e.source),
    strLit(e.content),
    strLit(e.content2024),
  ].join(', ')
}

function bookSlug(source: string | null | undefined): string {
  if (!source) return 'misc'
  return (
    source
      .toLowerCase()
      .replace(/[':"&]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'misc'
  )
}

function groupBySourceBook(entries: SpellSeedEntry[]): Map<string, SpellSeedEntry[]> {
  const groups = new Map<string, SpellSeedEntry[]>()
  for (const e of entries) {
    const key = bookSlug(e.source)
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.level - b.level || a.slug.localeCompare(b.slug))
  }
  return groups
}

function emitMigrationSql(args: {
  bookName: string
  entries: SpellSeedEntry[]
  migrationNum: number
}): string {
  const { bookName, entries, migrationNum } = args
  const seedRows = entries.map((e) => `      (${tupleFor(e)})`).join(',\n')

  return `-- Migration ${migrationNum.toString().padStart(3, '0')} — dnd.su spells seed: ${bookName}.
-- Spec-059 этап 1. Auto-generated by scripts/spells-dndsu-codegen.ts —
-- DO NOT edit by hand; regenerate with:
--
--   npx tsx scripts/spells-dndsu-codegen.ts --emit-migrations
--
-- Идемпотентность:
--   * NOT EXISTS guard на (campaign_id, node_type spell, fields->>'slug')
--     — повторный прогон не плодит дублей и не перетирает правки ДМ.
-- Тело редакции 2014 -> nodes.content; тело 2024 -> fields.content_2024
-- (nullable, переключатель редакции показывается только при наличии).
-- node_type 'spell' создан миграцией 130; здесь только вставка строк.
--
-- NB: notify pgrst 'reload schema' здесь НЕ нужен — это чистый insert строк,
-- а не DDL: схема эмбедов PostgREST не меняется (в отличие от смены колонок).

begin;

do $$
declare
  c_rec record;
  type_id_v uuid;
  ins_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    select id into type_id_v from node_types
      where campaign_id = c_rec.id and slug = 'spell'
      limit 1;

    if type_id_v is null then
      raise notice 'Campaign % (%): no node_type=spell, skipping seed',
        c_rec.slug, c_rec.id;
      continue;
    end if;

    with seed(
      slug, title_ru, level, school, casting_time, range_, components,
      duration, concentration, ritual, classes, source, content, content_2024
    ) as (values
${seedRows}
    ),
    typed_seed as (
      select
        slug::text,
        title_ru::text,
        level::int,
        school::text,
        casting_time::text,
        range_::text,
        components::text,
        duration::text,
        concentration::boolean,
        ritual::boolean,
        classes::text,
        source::text,
        content::text,
        content_2024::text
      from seed
    )
    insert into nodes (campaign_id, type_id, title, content, fields)
    select
      c_rec.id,
      type_id_v,
      s.title_ru,
      s.content,
      jsonb_build_object(
        'level', s.level,
        'school', s.school,
        'casting_time', s.casting_time,
        'range', s.range_,
        'components', s.components,
        'duration', s.duration,
        'concentration', s.concentration,
        'ritual', s.ritual,
        'classes', s.classes,
        'source', s.source,
        'slug', s.slug,
        'content_2024', coalesce(s.content_2024, '')
      )
    from typed_seed s
    where not exists (
      select 1 from nodes n
      where n.campaign_id = c_rec.id
        and n.type_id = type_id_v
        and n.fields->>'slug' = s.slug
    );

    get diagnostics ins_count = row_count;
    raise notice 'Campaign % (%): inserted % new dnd.su spells (${escSqlString(bookName)})',
      c_rec.slug, c_rec.id, ins_count;
  end loop;
end $$;

commit;

-- ─────────────────────────── Verify ───────────────────────────
-- Ни одна засеянная spell-нода не должна иметь пустой slug.
select case
  when not exists (
    select 1 from nodes n
    join node_types t on t.id = n.type_id
    where t.slug = 'spell' and coalesce(n.fields->>'slug', '') = ''
  )
  then '✅ миграция ${migrationNum.toString().padStart(3, '0')} (${escSqlString(bookName)}): spell-ноды со slug'
  else '❌ есть spell-ноды с пустым slug'
end as result;
`
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function main(): void {
  const emitMigrations = process.argv.includes('--emit-migrations')
  const startIdx = process.argv.indexOf('--start-num')
  const startNum =
    startIdx >= 0 && process.argv[startIdx + 1]
      ? parseInt(process.argv[startIdx + 1], 10)
      : START_MIGRATION_NUMBER

  const raw = loadJson()
  const rawEntries = raw.map(rawToSeedEntry)

  const { kept, dropped } = dedupInternal(rawEntries)
  if (dropped.length > 0) {
    console.error(`Internal dedup: dropped ${dropped.length} duplicate slugs.`)
  }
  console.error(`Kept ${kept.length} spells from dnd.su.`)

  if (!emitMigrations) {
    fs.mkdirSync(path.dirname(SEED_OUT), { recursive: true })
    fs.writeFileSync(SEED_OUT, emitTsSeed(kept), 'utf-8')
    console.error(`Wrote ${SEED_OUT}`)
    return
  }

  // --emit-migrations
  const groups = groupBySourceBook(kept)
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'misc' && b !== 'misc') return 1
    if (b === 'misc' && a !== 'misc') return -1
    return a.localeCompare(b)
  })

  let nextNum = startNum
  let total = 0
  for (const key of orderedKeys) {
    const groupEntries = groups.get(key)!
    if (groupEntries.length === 0) continue
    const bookName = groupEntries[0].source ?? 'Misc / unmapped'
    const filename = `${nextNum.toString().padStart(3, '0')}_dndsu_${key}_spells.sql`
    const filepath = path.join(MIGRATIONS_DIR, filename)
    if (fs.existsSync(filepath)) {
      console.error(`⚠️  ${filename} already exists — overwriting.`)
    }
    fs.writeFileSync(
      filepath,
      emitMigrationSql({ bookName, entries: groupEntries, migrationNum: nextNum }),
      'utf-8',
    )
    console.error(`Wrote ${filename} (${groupEntries.length} spells)`)
    nextNum += 1
    total += groupEntries.length
  }
  console.error(
    `Total: ${total} spells across ${orderedKeys.length} migrations (${startNum}..${nextNum - 1}).`,
  )
}

main()
