/**
 * scripts/items-dndsu-codegen.ts — spec-018 (T013-T015).
 *
 * Reads `scripts/dndsu_items.json` (produced by scrape_dndsu.py),
 * dedupes against the hand-curated `ITEMS_SRD_SEED`, sorts by
 * `srdSlug`, and emits one of two artefacts:
 *
 *   1. Default mode (no flag): writes `lib/seeds/items-dndsu.ts`
 *      containing `ITEMS_DNDSU_SEED: ReadonlyArray<ItemSeedEntry>`.
 *
 *      $ npx tsx scripts/items-dndsu-codegen.ts
 *
 *   2. With `--emit-migrations`: writes one
 *      `supabase/migrations/0XX_dndsu_<book>_items.sql` per source
 *      book (DMG, TCE, …), starting at the next free migration
 *      number. Each migration is idempotent via the
 *      `(campaign_id, fields->>'srd_slug')` NOT EXISTS guard, same
 *      pattern as 044/046/049-054.
 *
 *      $ npx tsx scripts/items-dndsu-codegen.ts --emit-migrations
 *
 * Items already present in `ITEMS_SRD_SEED` (matched by `srdSlug`)
 * are skipped — the hand-curated entries are the source of truth for
 * those slugs. `dndsu-…` slugs never collide with the existing
 * single-word slugs, so this normally only affects items the
 * maintainer has already lifted from dnd.su into the SRD seed.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { ITEMS_SRD_SEED, type ItemSeedEntry } from '../lib/seeds/items-srd'

// ---------------------------------------------------------------------------
// Raw JSON shape (matches Python ItemRecord.to_dict).
// ---------------------------------------------------------------------------

type DndsuRawRecord = {
  srd_slug: string
  title_ru: string
  title_en: string | null
  category: string
  rarity: string | null
  requires_attunement: boolean
  slot: string | null
  weight_lb: number | null
  price_range_text: string | null
  description_ru: string
  source_book: string | null
  source_book_short: string | null
  edition: string
  dndsu_url: string
  _warnings: string[]
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set([
  'weapon',
  'armor',
  'consumable',
  'magic-item',
  'wondrous',
  'tool',
  'treasure',
  'misc',
])

const VALID_RARITIES: ReadonlySet<string> = new Set([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
])

const VALID_SLOTS: ReadonlySet<string> = new Set([
  'ring',
  'cloak',
  'amulet',
  'boots',
  'gloves',
  'headwear',
  'belt',
  'body',
  'shield',
  '1-handed',
  '2-handed',
  'versatile',
  'ranged',
])

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

function rawToSeedEntry(r: DndsuRawRecord): ItemSeedEntry {
  if (!VALID_CATEGORIES.has(r.category)) {
    throw new Error(`invalid category '${r.category}' for ${r.srd_slug}`)
  }
  if (r.rarity !== null && !VALID_RARITIES.has(r.rarity)) {
    throw new Error(`invalid rarity '${r.rarity}' for ${r.srd_slug}`)
  }
  if (r.slot !== null && !VALID_SLOTS.has(r.slot)) {
    throw new Error(`invalid slot '${r.slot}' for ${r.srd_slug}`)
  }

  const entry: ItemSeedEntry = {
    srdSlug: r.srd_slug,
    titleRu: r.title_ru,
    category: r.category as ItemSeedEntry['category'],
    rarity: r.rarity as ItemSeedEntry['rarity'],
    // dnd.su exposes ranges ("101-500 зм") not single numbers — we
    // store the raw text in fields.price_range_text downstream and
    // leave priceGp null. The DM can edit a concrete price later.
    priceGp: null,
    weightLb: r.weight_lb,
    slot: r.slot as ItemSeedEntry['slot'],
    descriptionRu: r.description_ru,
  }
  if (r.requires_attunement) entry.requiresAttunement = true
  if (r.dndsu_url) entry.dndsuUrl = r.dndsu_url
  if (r.source_book) entry.sourceDetail = r.source_book
  return entry
}

function dedupAgainstSrd(entries: ItemSeedEntry[]): {
  kept: ItemSeedEntry[]
  dropped: string[]
} {
  const srdSlugs = new Set(ITEMS_SRD_SEED.map((e) => e.srdSlug))
  const dropped: string[] = []
  const kept: ItemSeedEntry[] = []
  for (const e of entries) {
    if (srdSlugs.has(e.srdSlug)) {
      dropped.push(e.srdSlug)
    } else {
      kept.push(e)
    }
  }
  return { kept, dropped }
}

function dedupInternal(entries: ItemSeedEntry[]): {
  kept: ItemSeedEntry[]
  dropped: { srdSlug: string; reason: string }[]
} {
  const seen = new Map<string, ItemSeedEntry>()
  const dropped: { srdSlug: string; reason: string }[] = []
  for (const e of entries) {
    const prev = seen.get(e.srdSlug)
    if (prev) {
      // Same English-derived slug from a different dnd.su URL — typically
      // a re-release (e.g. "Staff of Defense" appears in both LMOP and
      // PBSO). Keep the first occurrence; the second loses with a note
      // so the maintainer can investigate if needed.
      const prevBook = prev.sourceDetail ?? '?'
      const dupBook = e.sourceDetail ?? '?'
      dropped.push({
        srdSlug: e.srdSlug,
        reason: `kept ${prevBook}, dropped ${dupBook} (${e.dndsuUrl})`,
      })
    } else {
      seen.set(e.srdSlug, e)
    }
  }
  return { kept: Array.from(seen.values()), dropped }
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

const SCRIPTS_DIR = path.dirname(__filename)
const REPO_DIR = path.dirname(SCRIPTS_DIR) // mat-ucheniya/
const JSON_PATH = path.join(SCRIPTS_DIR, 'dndsu_items.json')
const SEED_OUT = path.join(REPO_DIR, 'lib', 'seeds', 'items-dndsu.ts')
const MIGRATIONS_DIR = path.join(REPO_DIR, 'supabase', 'migrations')

function loadJson(): DndsuRawRecord[] {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(
      `Missing ${JSON_PATH}. Run scrape_dndsu.py first ` +
        `(see .specify/specs/018-dndsu-magic-items/tasks.md T011).`,
    )
  }
  return JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'))
}

// ---------------------------------------------------------------------------
// TS const emit
// ---------------------------------------------------------------------------

function tsLit(v: string): string {
  // Single-quoted TS string with backslash escape for `\`, `'`, newline.
  return `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}

function emitTsEntry(e: ItemSeedEntry): string {
  const parts: string[] = []
  parts.push(`srdSlug: ${tsLit(e.srdSlug)}`)
  parts.push(`titleRu: ${tsLit(e.titleRu)}`)
  parts.push(`category: ${tsLit(e.category)}`)
  parts.push(`rarity: ${e.rarity === null ? 'null' : tsLit(e.rarity)}`)
  parts.push(`priceGp: ${e.priceGp === null ? 'null' : String(e.priceGp)}`)
  parts.push(`weightLb: ${e.weightLb === null ? 'null' : String(e.weightLb)}`)
  parts.push(`slot: ${e.slot === null ? 'null' : tsLit(e.slot)}`)
  parts.push(`descriptionRu: ${tsLit(e.descriptionRu)}`)
  if (e.requiresAttunement) parts.push(`requiresAttunement: true`)
  if (e.dndsuUrl) parts.push(`dndsuUrl: ${tsLit(e.dndsuUrl)}`)
  if (e.sourceDetail) parts.push(`sourceDetail: ${tsLit(e.sourceDetail)}`)
  return `  { ${parts.join(', ')} },`
}

function emitTsSeed(entries: ItemSeedEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.srdSlug.localeCompare(b.srdSlug))
  const lines = sorted.map(emitTsEntry).join('\n')
  return `/**
 * Auto-generated by scripts/items-dndsu-codegen.ts — DO NOT edit by hand.
 *
 * Magic items imported from https://dnd.su/items/ (5e14 only). Counts
 * may exceed the source-page count because umbrella items (e.g.
 * "Оружие, +1, +2, +3") expand to one ItemSeedEntry per rarity tier.
 *
 * Idempotency key: \`(campaign_id, fields->>'srd_slug')\`. The
 * migrations 056+ INSERT ON CONFLICT DO NOTHING and never overwrite
 * DM edits.
 *
 * To regenerate after re-running the scraper:
 *   $ cd mat-ucheniya/scripts
 *   $ python3 scrape_dndsu.py
 *   $ cd ..
 *   $ npx tsx scripts/items-dndsu-codegen.ts
 */

import type { ItemSeedEntry } from './items-srd'

export const ITEMS_DNDSU_SEED: ReadonlyArray<ItemSeedEntry> = [
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

function num(v: number | null): string {
  return v === null ? 'null' : String(v)
}

function bool(v: boolean | undefined): string {
  return v ? 'true' : 'false'
}

function tupleFor(e: ItemSeedEntry): string {
  return [
    strLit(e.srdSlug),
    strLit(e.titleRu),
    strLit(e.descriptionRu || null),
    strLit(e.category),
    strLit(e.rarity),
    num(e.priceGp),
    num(e.weightLb),
    strLit(e.slot),
    bool(e.requiresAttunement),
    strLit(e.dndsuUrl ?? null),
    strLit(e.sourceDetail ?? null),
  ].join(', ')
}

function bookSlug(sourceDetail: string | undefined): string {
  // Stable filename token from the human book name: lowercase, ASCII
  // word chars + dashes, no leading/trailing dashes. Falls back to
  // 'misc' when the entry has no source_detail.
  if (!sourceDetail) return 'misc'
  return (
    sourceDetail
      .toLowerCase()
      .replace(/[':"&]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'misc'
  )
}

function groupBySourceBook(entries: ItemSeedEntry[]): Map<string, ItemSeedEntry[]> {
  const groups = new Map<string, ItemSeedEntry[]>()
  for (const e of entries) {
    const key = bookSlug(e.sourceDetail)
    const arr = groups.get(key) ?? []
    arr.push(e)
    groups.set(key, arr)
  }
  // Sort entries within each group for determinism.
  for (const arr of groups.values()) {
    arr.sort((a, b) => a.srdSlug.localeCompare(b.srdSlug))
  }
  return groups
}

function emitMigrationSql(args: {
  bookKey: string
  bookName: string
  entries: ItemSeedEntry[]
  migrationNum: number
}): string {
  const { bookKey, bookName, entries, migrationNum } = args
  const seedRows = entries
    .map((e) => `      (${tupleFor(e)})`)
    .join(',\n')

  return `-- Migration ${migrationNum.toString().padStart(3, '0')} — dnd.su items seed: ${bookName}.
-- Spec-018 T015. Auto-generated by scripts/items-dndsu-codegen.ts —
-- DO NOT edit by hand; regenerate with:
--
--   npx tsx scripts/items-dndsu-codegen.ts --emit-migrations
--
-- Idempotency:
--   * NOT EXISTS guard on (campaign_id, fields->>'srd_slug')
--     — re-running adds no duplicates and never overwrites DM edits.
-- Source bucket: source_slug='srd-5e' (shared with mig 044/046+);
-- per-book name lives in nodes.fields.source_detail.

begin;

do $$
declare
  c_rec record;
  type_id_v uuid;
  ins_count int;
begin
  for c_rec in select id, slug from campaigns order by created_at loop
    select id into type_id_v from node_types
      where campaign_id = c_rec.id and slug = 'item'
      limit 1;

    if type_id_v is null then
      raise notice 'Campaign % (%): no node_type=item, skipping seed',
        c_rec.slug, c_rec.id;
      continue;
    end if;

    with seed(
      srd_slug, title_ru, description_ru,
      category, rarity, price_gp, weight_lb, slot,
      requires_attunement, dndsu_url, source_detail
    ) as (values
${seedRows}
    ),
    typed_seed as (
      select
        srd_slug::text,
        title_ru::text,
        description_ru::text,
        category::text,
        rarity::text,
        price_gp::numeric,
        weight_lb::numeric,
        slot::text,
        requires_attunement::boolean,
        dndsu_url::text,
        source_detail::text
      from seed
    ),
    inserted as (
      insert into nodes (campaign_id, type_id, title, fields)
      select
        c_rec.id,
        type_id_v,
        s.title_ru,
        jsonb_strip_nulls(jsonb_build_object(
          'srd_slug', s.srd_slug,
          'description', s.description_ru,
          'dndsu_url', s.dndsu_url,
          'source_detail', s.source_detail
        ))
      from typed_seed s
      where not exists (
        select 1 from nodes n
        where n.campaign_id = c_rec.id
          and n.fields->>'srd_slug' = s.srd_slug
      )
      returning id, fields->>'srd_slug' as srd_slug
    )
    insert into item_attributes (
      node_id, category_slug, rarity, price_gp, weight_lb,
      slot_slug, requires_attunement,
      source_slug, availability_slug
    )
    select
      i.id, s.category, s.rarity, s.price_gp, s.weight_lb,
      s.slot, s.requires_attunement,
      'srd-5e', null
    from inserted i
    join typed_seed s on s.srd_slug = i.srd_slug
    on conflict (node_id) do nothing;

    get diagnostics ins_count = row_count;
    raise notice 'Campaign % (%): inserted % new dnd.su items (${escSqlString(bookName)})',
      c_rec.slug, c_rec.id, ins_count;
  end loop;
end $$;

-- Phase 2 backfill (transactions.item_node_id = N) is intentionally
-- omitted for dnd.su entries: the canonical Russian title is shared
-- across many similar items and would mis-link prior transactions.
-- DMs do per-item linking on demand from the catalog UI.

commit;
`
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

function nextMigrationNumber(): number {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Missing ${MIGRATIONS_DIR}`)
  }
  const nums = fs
    .readdirSync(MIGRATIONS_DIR)
    .map((f) => /^(\d{3})_/.exec(f)?.[1])
    .filter((m): m is string => m !== undefined)
    .map((s) => parseInt(s, 10))
  if (nums.length === 0) return 1
  return Math.max(...nums) + 1
}

function main(): void {
  const emitMigrations = process.argv.includes('--emit-migrations')

  const raw = loadJson()
  const rawEntries = raw.map(rawToSeedEntry)

  const { kept: deduped, dropped: internalDropped } = dedupInternal(rawEntries)
  if (internalDropped.length > 0) {
    console.error(
      `Internal dedup: dropped ${internalDropped.length} duplicate slugs ` +
        `(re-releases across multiple books):`,
    )
    for (const d of internalDropped.slice(0, 10)) {
      console.error(`  ${d.srdSlug}  ${d.reason}`)
    }
    if (internalDropped.length > 10) {
      console.error(`  … +${internalDropped.length - 10} more`)
    }
  }

  const { kept, dropped } = dedupAgainstSrd(deduped)
  if (dropped.length > 0) {
    console.error(
      `Dropped ${dropped.length} entries already in ITEMS_SRD_SEED: ` +
        `${dropped.slice(0, 3).join(', ')}` +
        `${dropped.length > 3 ? `, … (+${dropped.length - 3} more)` : ''}`,
    )
  }
  console.error(`Kept ${kept.length} entries from dnd.su.`)

  if (!emitMigrations) {
    fs.writeFileSync(SEED_OUT, emitTsSeed(kept), 'utf-8')
    console.error(`Wrote ${SEED_OUT}`)
    return
  }

  // --emit-migrations
  const groups = groupBySourceBook(kept)
  // Sort group keys for deterministic file ordering ("misc" last so
  // it doesn't disrupt numbering when new books get scraped later).
  const orderedKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === 'misc' && b !== 'misc') return 1
    if (b === 'misc' && a !== 'misc') return -1
    return a.localeCompare(b)
  })

  let nextNum = nextMigrationNumber()
  let total = 0
  for (const key of orderedKeys) {
    const groupEntries = groups.get(key)!
    if (groupEntries.length === 0) continue
    const bookName = groupEntries[0].sourceDetail ?? 'Misc / unmapped'
    const filename = `${nextNum.toString().padStart(3, '0')}_dndsu_${key}_items.sql`
    const filepath = path.join(MIGRATIONS_DIR, filename)
    fs.writeFileSync(
      filepath,
      emitMigrationSql({
        bookKey: key,
        bookName,
        entries: groupEntries,
        migrationNum: nextNum,
      }),
      'utf-8',
    )
    console.error(`Wrote ${filename} (${groupEntries.length} items)`)
    nextNum += 1
    total += groupEntries.length
  }
  console.error(`Total: ${total} items across ${orderedKeys.length} migrations.`)
}

main()
