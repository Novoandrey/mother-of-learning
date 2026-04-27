# Feature Specification: dnd.su magic items scraper & catalog import

**Feature Branch**: `018-dndsu-magic-items`
**Created**: 2026-04-27
**Status**: Clarified (2026-04-27, chat 75)
**Input**: User chat 75 — «вытащить с dnd.su/items/ все магические
предметы и их свойства; корректно выставить тип, attunement,
категории, слоты; вытащить ПОЛНОЕ описание (вординг важен); пригодится
для дальнейшей работы над спекой-помощником в энкаунтерах. Полагаю
что ИИшкой это будет вытаскивать очень дорого, поэтому понадобятся
скрипты». Phase A only — see `## Out of scope` for the structured-
abilities follow-up (Phase B).

## Context

Spec-015 (chat 55–69) shipped the item catalog. Migrations 049–054
(chat 74) extended the SRD seed to 274 hand-curated items —
PHB / DMG / XGE mundane gear, simple firearms, poisons, drugs,
artisan tools. Migration 055 added `requires_attunement` and
auto-managed `use_default_price`. The mundane half of the catalog
is essentially complete.

The magical half is empty. dnd.su is the canonical Russian D&D
reference — it indexes ~1500–2500 magic items across PHB / DMG /
XGE / TCE / VRGR / supplements, all with full Russian descriptions,
rarity, attunement notes, item-type classification (Wondrous Item,
Wand, Ring, Armor, Weapon, etc.), and source attribution. Today
none of this is in the catalog. When a magic item shows up in the
campaign («Кольцо Защиты», «Сапоги-скороходы», «Глаз и рука Векны»),
the DM either creates a free-text transaction with a typed name and
no metadata, or hand-creates one item-node at a time through the UI.

The cost shape is asymmetric. Hand-curating ~2000 magic items from
dnd.su would take days of mechanical work and produce inconsistent
spelling / categorisation. An LLM round-trip per item would cost
real money and still need review. A scraper costs one afternoon
and produces a regenerable seed, the same shape the existing
`scripts/parse_srd.py` (10 SRD monsters) and `lib/seeds/items-srd.ts`
(274 mundane items) already use.

This spec is **Phase A** only — bulk import of structured metadata
+ full Russian description text. The hard part the user flagged
("самое сложное — вытащить из каждого предмета какие они дают
возможности через действие, бонусное действие, реакцию, легендарные
действия, заклинания") is **Phase B**, deliberately deferred. Two
reasons:

1. **No consumer yet.** The structured-abilities shape is meant to
   feed a future encounter assistant ("у игрока перед глазами набор
   что он может делать тратя действие / бонус / реакцию"). That
   assistant doesn't exist. Designing the schema for actions /
   bonus actions / reactions / legendary / spells in a vacuum
   risks shipping a shape the consumer can't use.
2. **The text is enough for v1.** Full descriptions in the catalog
   already let an LLM-driven assistant answer "what can my Cloak
   of Protection do?" by reading the description. Phase B is a
   speed/structure optimisation, not a feature blocker.

So Phase A: scrape, classify, seed. Description goes in as text
(`nodes.fields.description`), full and verbatim. Phase B (a future
spec) parses the description into structured action blocks once
the consumer is concrete.

## Site recon (dnd.su, chat 75)

Before fixing decisions, a brief look at the actual target:

- **Item URL pattern**: `https://dnd.su/items/{numeric_id}-{slug}/`
  (e.g. `94-ring-of-protection`). Slug falls out of the URL — no
  transliteration needed.
- **Page structure** (per-item): bullet list with
  1. icon (image URL) — out of scope
  2. `<type>, <rarity> (требуется настройка)?` — combined line,
     parseable by regex
  3. `**Рекомендованная стоимость:** N–M зм` — DMG-style range,
     **not a point price**
  4. description (one or more paragraphs, may include emphasis,
     bullet lists, embedded spell italics)
- **Source attribution** in the header: badge text like `DMG14`
  next to the English name (`14` = 5e14 / current edition; the
  site links to a separate 5e24 entry, which we ignore).
- **Editions**: scope is locked to **5e14** only. The 5e24 link is
  a sibling reference — Phase A does not import 5e24.
- **Volume estimate**: numeric IDs in 5e14 reach the low thousands;
  expected magic-item count ~1000–1500 (working figure for
  scraper sizing).
- **Index page** (`/items/`) renders client-side. Discovery of the
  full URL list is a Plan-phase concern (sequential ID iteration,
  JSON-API discovery, or headless render — to be decided in Plan).
- **Comments section** at the bottom of every page must be stripped
  before description text is captured.

## Clarifications

_Resolved 2026-04-27 in chat 75._

### Q1 (FR-006) — Seed file structure: split

**Answer:** Sibling file `items-dndsu.ts` next to the existing
`items-srd.ts`. The 274 hand-curated entries stay in `items-srd.ts`
unchanged; the migration generator (codegen script, separate from
the 049–054 batch script) reads both arrays, dedups by `srdSlug`,
and emits a unified set of INSERT statements.

**Rationale:** Adding ~1500 entries to `items-srd.ts` would push
git diffs into "unreviewable" territory (>40k LOC of seed array)
and the file name would become misleading — dnd.su is broader than
SRD. Keeping the curated baseline isolated also makes it trivial
to audit which items the DM trusts as authoritative vs auto-imported.

### Q2 (FR-007) — Migration granularity: per-source-book

**Answer:** One migration per source-book batch, matching the
049–054 pattern (per-campaign DO loop, NOT EXISTS guard,
RAISE NOTICE counts, Phase 2 backfill of `transactions.item_node_id`).
Likely numbering: 056 = PHB, 057 = DMG, 058 = XGE, 059 = TCE,
060+ = supplements (VRGR / IMR / etc.). Final list determined by
what the scraper extracts from `DMG14` / `PHB14` / etc. badges.

**Rationale:** Consistency with the existing convention; easier
diagnostics if any single batch fails partial-apply; smaller diffs
per migration; gives us per-batch RAISE NOTICE counts in the
Supabase Dashboard for sanity-checking inserts.

### Q3 (FR-011) — `scraped_at` timestamp: skip

**Answer:** Do not store `scraped_at` on imported nodes. The
`nodes.fields` JSONB carries `srd_slug`, `description`,
`source_detail`, `dndsu_url` — that's the full set.

**Rationale:** Every scraper re-run would change `scraped_at` for
every item, polluting git diffs of the seed file even when content
is unchanged. No current consumer needs the timestamp. If staleness
detection is ever needed, it can be added later without a migration
(add to `nodes.fields`, default to NULL, migration optional).

### Q4 (FR-016) — DM-edits to `dndsu_url`: editable

**Answer:** `dndsu_url` is rendered as an editable plain-text input
in the DM-only item form. No locking, no read-only badge.

**Rationale:** Constitution principle X — DM is authoritative on
campaign data. URLs may rot (dnd.su could move pages), or the DM
may want to point at a better source (a Wiki, a personal note).
Locking the field would force a workaround.

### Q5 (FR-017) — Catalog perf at 2000+ items: defer

**Answer:** Ship Phase A without UI changes to the catalog grid /
typeahead. Measure perf in production. If `<ItemCatalogGrid>`
becomes janky at the new volume (initial paint > 1s, sort/filter
> 200ms), open a follow-up spec for server-side pagination —
**not** in this scope.

**Rationale:** Catalog page is browse-heavy, not interaction-heavy
— users typically filter to a category before scrolling, which
already cuts the dataset. Typeahead is single-roundtrip nested-
select (chat 66) — likely fine. Adding pagination pre-emptively
expands scope by ~1 day and changes URL contract, both for what
might be a non-issue.

### Q6 (new) — Source HTML mirror: gitignored local cache

**Answer:** Scraper writes fetched HTML to
`mat-ucheniya/scripts/dndsu-cache/{numeric_id}-{slug}.html`,
which is `.gitignore`d. First run hits network at ≤ 1 req/s.
Subsequent runs read from cache. A `--refresh` (or `--force`) CLI
flag invalidates the cache and re-fetches. The scraper logs cache
hits / misses and total fetch time.

**Rationale:** Avoids committing 50–100 MB of HTML mirror to the
repo (bloats clones, hurts CI), avoids network dependency on every
re-run (deterministic seed regen). Trade-off: a fresh clone of the
repo without the cache requires a 30–40 min initial scrape. The DM
is the only person likely to run the scraper, so the trade-off is
asymmetric in our favour. If a future contributor needs to re-run,
the docs in `scripts/README.md` will explain the wait.

### Q7 (new) — Pricing strategy: NULL + spec-016 defaults

**Answer:** All imported magic items get `price_gp = NULL`. The
DMG-style price range from dnd.su (e.g. "501–5 000 зм") is
preserved verbatim inside `description` text — no separate field,
no parsed bounds.

**Rationale:** dnd.su prices are categorical ranges, not points.
Any single-number reduction (lower / upper / mid) is fake precision.
The spec-016 default-price-by-rarity layer already provides a
rational fallback at create-time and a bulk-apply at settings-time —
that's the right place for "what does a rare magic item cost
roughly". The original range stays human-readable in the
description for DM reference. New non-magical items (rare on
dnd.su but possible — e.g. supplement gear) keep their stated
price as a point if dnd.su gives one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — DM finds a magic item by name (Priority: P1)

The DM rolls a treasure parcel that includes «Перчатки великаньей
силы». She opens the item catalog (`/c/[slug]/items`), types
"перчатки" in the search field, and sees the item with correct
rarity badge, attunement marker, and full Russian description
matching what's on dnd.su.

**Why this priority**: Without this, the catalog is just the 274
mundane items + whatever the DM hand-types. The whole point of the
scraper is that any magic item the campaign encounters is already
in the catalog with correct metadata.

**Independent Test**: Apply the migration on a fresh DB. Open
`/c/mat-ucheniya/items`. Filter by `category=magic-item` (or by
rarity). Confirm the catalog contains a meaningful sample (~95% of
DMG magic items at minimum). Pick 5 items at random; compare
title, rarity, attunement flag, slot, description against dnd.su.
All should match.

**Acceptance Scenarios**:

1. **Given** the migration has been applied, **When** the DM
   navigates to `/items` and filters `rarity=rare`, **Then** the
   list shows all imported rare items with correct rarity chips.
2. **Given** an item exists in both `lib/seeds/items-srd.ts`
   (e.g. `cloak-of-protection`, hand-curated in mig 044) and on
   dnd.su, **When** the migration runs, **Then** the existing
   curated entry is preserved (no overwrite of DM edits) and no
   duplicate node is created.
3. **Given** the DM clicks on an imported magic item, **When** the
   item permalink loads, **Then** the description renders as
   multi-paragraph Russian text matching dnd.su verbatim, with
   the «Требует настройки» line preserved if present.
4. **Given** the DM creates a new item-out transaction and types
   "Кольцо Защиты", **When** the typeahead resolves, **Then** the
   imported `ring-of-protection` node appears as a suggestion with
   price-by-rarity already populated.

---

### User Story 2 — DM extends/re-runs the scraper for fresh items (Priority: P2)

A new dnd.su entry appears (the site adds an item from a fresh
supplement). The DM (or anyone with repo access) runs the scraper
script, which produces an updated TS seed file + an idempotent SQL
migration. Re-running on a campaign that already has the bulk seed
is safe: existing items are not overwritten, only new ones are
inserted.

**Why this priority**: Catalog data is never "done". TCE / VRGR /
new books keep arriving. The scraper has to be re-runnable without
clobbering DM edits.

**Independent Test**: Run the scraper twice in a row. Verify the
second run produces zero new INSERTs (or only INSERTs for items
genuinely added on dnd.su between runs). Verify a hand-edited
title or description on an already-imported item is preserved
across re-runs.

**Acceptance Scenarios**:

1. **Given** the bulk migration has been applied once, **When** it
   re-runs verbatim, **Then** no rows are inserted, no rows are
   updated, and no errors are thrown (idempotency, matching
   migrations 049–054 pattern).
2. **Given** the DM has hand-edited the description of an imported
   item, **When** the migration re-runs (or a new batch migration
   is applied), **Then** the DM's edit is preserved (the seed
   uses `ON CONFLICT (campaign_id, srd_slug) DO NOTHING`, never
   `DO UPDATE`).

---

### User Story 3 — Player sees correct item metadata on a transaction (Priority: P2)

A player has «Жезл Молний» linked to her inventory transaction.
She opens her PC page, scrolls to the inventory tab, and sees the
item with the correct rarity badge ("очень редкая"), attunement
marker, and a clickable link to the item permalink, which loads
the full description.

**Why this priority**: The player-facing UX over the imported data
must work without further changes — the existing `<InventoryTab>`,
`<ItemTypeahead>`, and item permalink already handle this for
hand-curated items. Imported items have to slot into the same
shape with no special-case rendering.

**Independent Test**: After the migration, link an existing
`item_name='Жезл молний'` transaction (free-text) to the imported
node via the spec-015 backfill rule (LOWER(TRIM) match). Player
opens her inventory tab. Item displays the imported metadata.

**Acceptance Scenarios**:

1. **Given** an existing free-text transaction `item_name='Жезл
   молний'`, **When** the migration's backfill phase runs,
   **Then** `transactions.item_node_id` is set to the imported
   node id (matching by `LOWER(TRIM(item_name)) = LOWER(TRIM(node.title))`
   per spec-015 FR-029).
2. **Given** the player's inventory tab shows an imported item
   row, **When** she clicks the item title, **Then** the item
   permalink loads with full description, rarity, attunement, and
   slot — no broken or missing fields.

---

### User Story 4 — Future Phase B has clean raw text to parse (Priority: P3)

When Phase B (structured abilities extraction) is built, the spec
author opens any imported item and finds the full description
intact, including formatting cues that signal action types
("в качестве действия", "бонусным действием", "реакцией", "1 раз
в день"). No information has been lost in scraping; Phase B can
work entirely off `nodes.fields.description` without re-scraping.

**Why this priority**: Insurance for downstream specs. If we strip
HTML tags too aggressively or normalise whitespace too hard in
Phase A, Phase B has to re-scrape to recover. Cheap to get right
once.

**Independent Test**: Pick 10 imported items with non-trivial
abilities (e.g. `cloak-of-displacement`, `ring-of-spell-storing`,
`wand-of-fireballs`). For each, manually compare
`nodes.fields.description` against the dnd.su page. The text must
contain every action-type cue ("действием", "бонусным действием",
etc.) that the source page contains.

**Acceptance Scenarios**:

1. **Given** an imported item with a multi-paragraph description
   on dnd.su, **When** the seed is read, **Then** the description
   contains all paragraph breaks (preserved as `\n\n` or
   equivalent) and all bullet points (preserved as plain text or
   markdown).
2. **Given** an item with embedded spell names on dnd.su (e.g.
   "*огненный шар*"), **When** the description is rendered in the
   permalink, **Then** the spell names are still visible as plain
   text (italics dropped is OK, content preserved is required).

---

### Edge Cases

- **Item with no rarity** (e.g. some homebrew/legacy entries on
  dnd.su) — store `rarity=null`, classify by item-type only.
- **Item with attunement-by-class** ("Требует настройки воином
  или паладином") — Phase A stores `requires_attunement=true`
  and preserves the qualifier in description text. Phase B may
  later parse class restrictions; not now.
- **Item duplicated across sources** (e.g. an item appears in PHB
  *and* in a supplement with slightly different text) — pick one
  canonical entry by `srd_slug` priority order (PHB > DMG > XGE >
  TCE > supplements) and skip duplicates. Source attribution
  goes in `source_detail` field.
- **dnd.su renames an item between scrapes** — slug derived from
  current title. If the slug shifts, the second run treats it as
  a new item (insert) and the old one becomes orphaned (no harm,
  no auto-delete). The scraper should log a warning when it sees
  a slug it's never seen before.
- **Items with non-ASCII slugs** — Russian titles transliterated
  to kebab-case ASCII for `srd_slug` (e.g. «Кольцо Защиты» →
  `ring-of-protection` if the English name is on the dnd.su page,
  else `koltso-zaschity` as fallback transliteration).
- **Items with placeholder pricing** — magic items on dnd.su often
  have no canonical price (the DMG gives ranges by rarity). Set
  `price_gp=null`; the spec-016 default-price layer handles this.
- **Items already in `lib/seeds/items-srd.ts`** (the 274 hand-
  curated baseline) — skip during scrape import. The hand-curated
  entry wins; the scraper logs `[skip] already in seed: <slug>`.
- **Slot inference ambiguity** — an item like "Талисман Чистого
  Добра" has slot=`amulet` but the page says "талисман", which
  doesn't directly match the existing slot vocabulary. The scraper
  uses a hand-tuned mapping table (see Plan); unmapped items get
  `slot=null` and a warning.

## Requirements *(mandatory)*

### Functional Requirements

#### Scraper

- **FR-001**: System MUST provide a Python script (next to existing
  `parse_srd.py`) that reads a snapshot of dnd.su item pages and
  emits a structured intermediate (JSON or TS) listing every magic
  item with: `srd_slug`, `title_ru`, `category`, `rarity`,
  `requires_attunement`, `slot`, `source_detail`, `price_gp`,
  `weight_lb`, `description_ru`, `dndsu_url`.
- **FR-002**: The scraper MUST work off either (a) a pre-fetched
  HTML mirror or (b) live HTTP fetches with rate-limiting (≤ 1
  req/s, configurable). Default mode is the pre-fetched mirror so
  the script is deterministic and offline-runnable.
- **FR-003**: The scraper MUST NOT depend on any AI/LLM API call.
  Classification (rarity / category / slot / attunement) is
  pure-rule extraction from the page DOM and the rendered text.
- **FR-004**: The scraper MUST emit a runnable list of
  `{slug, title, category, rarity, attunement, slot, price, weight,
  description, source_detail, dndsu_url}` records, deduplicated by
  `srd_slug`. Conflicts logged but not fatal.
- **FR-005**: The scraper MUST produce a stable ordering across
  runs (sort by `srd_slug` ASC) so the generated seed file diffs
  cleanly in git.

#### Seed file & migration

- **FR-006**: System MUST place imported entries in a sibling file
  `lib/seeds/items-dndsu.ts`, parallel to the existing
  `lib/seeds/items-srd.ts` (resolved Q1). The migration generator
  reads both arrays and dedupes by `srdSlug` before emitting INSERTs.
- **FR-007**: System MUST generate idempotent migrations
  matching the 049–054 pattern: per-campaign DO loop, NOT EXISTS
  guard on `(campaign_id, srd_slug)`, RAISE NOTICE counts. One
  migration per source-book batch (resolved Q2): expected layout
  is 056 = PHB, 057 = DMG, 058 = XGE, 059 = TCE, 060+ for
  supplements. Final list determined by what the scraper emits.
- **FR-008**: Each generated migration MUST include a Phase 2
  backfill block: `UPDATE transactions SET item_node_id = … WHERE
  item_name matches LOWER(TRIM(title))`, identical to migration
  044 / 049–054.
- **FR-009**: The migration MUST be safe to apply on top of the
  existing 274-item baseline. Items already present in
  `lib/seeds/items-srd.ts` MUST be skipped at scrape-import time
  (the seed file's `ITEMS_SRD_SEED` array is the authority).
- **FR-010**: Migrations MUST be idempotent — re-running on an
  already-seeded campaign produces zero changes (no INSERT / no
  UPDATE on `item_attributes`).

#### Schema additions

- **FR-011**: System MUST add a `dndsu_url` field to the item-node
  shape, stored in `nodes.fields.dndsu_url` (JSONB), so the catalog
  can show a "Источник" link back to dnd.su. No new column on
  `item_attributes`. No `scraped_at` timestamp (resolved Q3).
- **FR-012**: System MUST extend the `categories` table seed (scope
  `item-source`) with new source slugs for any books not yet
  represented (likely `phb`, `dmg`, `xge`, `tce`, `vrgr`, `imr`,
  others — actual list determined by what dnd.su exposes). The
  `seedCampaignCategories` extension covers new campaigns; existing
  campaigns get the new slugs in the migration.
- **FR-013**: System MUST classify each item into one of the
  existing category slugs (`weapon`, `armor`, `consumable`,
  `magic-item`, `wondrous`, `tool`, `treasure`, `misc`). Magic
  items default to `magic-item`; armour pieces with a magic prefix
  (e.g. «Латные доспехи +1») go in `armor`; magical weapons in
  `weapon`. The mapping rules are defined in the scraper.

#### Catalog UI additions

- **FR-014**: The item permalink page MUST render a "Источник"
  link (icon + URL) when `dndsu_url` is present, opening in a new
  tab.
- **FR-015**: The item catalog filter bar MUST already handle the
  full set of imported items (category / rarity / slot / source /
  availability) without further code changes — Phase A is data
  only. If the existing filter UI breaks at scale (e.g. >2000
  items), that's a perf bug to fix in spec-018, but the design
  intent is "no UI changes needed".
- **FR-016**: The DM-only item form (`<ItemFormPage>`, edit mode)
  MUST display the `dndsu_url` field as an editable plain-text
  input, regardless of provenance (resolved Q4 — no locking;
  DM authoritative).

#### Volume & performance

- **FR-017**: The catalog list endpoint MUST handle the new item
  volume without a perceptible regression on `/items`. Phase A
  ships without UI changes (resolved Q5 — defer to ship-and-
  measure). Server-side pagination is **out of scope** for this
  spec; if perf measurements post-ship show jank, a follow-up spec
  handles it.
- **FR-018**: The item typeahead (`<ItemTypeahead>`) MUST stay
  responsive at the new catalog volume. Existing implementation
  uses a single nested-select query (UX iter 1.5, chat 66) — likely
  fine, but to be re-measured.

#### Scraper cache & pricing

- **FR-019**: The scraper MUST cache fetched HTML under
  `mat-ucheniya/scripts/dndsu-cache/` (gitignored). First run
  fetches at ≤ 1 req/s; subsequent runs read from cache. A
  `--refresh` (or `--force`) flag invalidates and re-fetches
  (resolved Q6).
- **FR-020**: All imported magic items MUST set `price_gp = NULL`
  (resolved Q7). dnd.su gives DMG-style ranges, not point prices;
  the spec-016 rarity-default layer provides the rational
  fallback. The original range stays inside the `description`
  text. Non-magical items with a stated point price keep that
  price.

### Key Entities

- **Imported magic item node**: A `nodes` row of `type='item'`,
  paired with `item_attributes` row, paired with extended
  `nodes.fields` JSONB containing `srd_slug`, `description`,
  `source_detail`, `dndsu_url`. No new tables.

- **Source attribution**: dnd.su exposes the source book per item.
  We map it to a `categories` row of `scope='item-source'` with a
  stable slug (`phb`, `dmg`, `xge`, …). Multiple items share a
  slug; the slug is what filter chips bind to.

## Success Criteria

- **SC-001**: After the migration, `/c/mat-ucheniya/items?category=magic-item`
  shows ≥ 1500 items (the working size of the dnd.su magic-item
  index, allowing for filtering of homebrew/non-canonical
  entries).
- **SC-002**: For 20 randomly sampled imported items, all of
  {title, rarity, attunement, slot, description} match dnd.su
  verbatim or with explicitly tracked normalisations (whitespace,
  HTML entity decoding).
- **SC-003**: `npm run lint` clean, `npm run vitest` ≥ existing
  pass rate, `npm run build` clean. (No new TS/lint failures from
  the scraper output.)
- **SC-004**: The migration applies cleanly to a fresh
  `mat-ucheniya` campaign in < 30s.
- **SC-005**: Re-running the migration produces zero changes.
- **SC-006**: At least 3 existing `transactions.item_name`
  free-text rows in `mat-ucheniya` get auto-linked to imported
  items via the Phase 2 backfill (sanity check that the backfill
  rule fires).

## Out of scope

The following are tracked for **Phase B / future specs**, not this
one:

- **Structured ability extraction** — parsing the description text
  into `actions[] / bonus_actions[] / reactions[] / legendary[] /
  spells[]`. Defer until the encounter assistant (provisional
  spec-022 or sibling) is concrete enough to drive the schema.
- **Spell catalog import.** Spells (заклинания) on dnd.su deserve
  their own spec — they're a separate entity type with cast time,
  range, duration, slot level, school, classes. IDEA-029 in
  backlog.
- **Cross-language slug matching.** When a transaction has
  `item_name='Cloak of Protection'` (English) and the imported
  item is `title='Плащ защиты'`, the spec-015 backfill won't
  match. Fixing that requires a separate slug-or-aliases column.
  Tracked as a follow-up; for now, the DM retypes occasional
  English entries.
- **Image / artwork import.** dnd.su pages have item icons /
  artwork. Phase A imports text only. If later we want a thumbnail
  on the catalog grid, that's a separate spec.
- **Variant items** ("+1 / +2 / +3" weapons). dnd.su lists these
  as separate items; we import as separate. No deduplication via
  variant edges. (Could be a Phase B+ enhancement.)
- **DM-private items.** Items the DM wants to seed for a future
  encounter without players seeing them yet. spec-020 / sandbox
  visibility covers this orthogonally.
- **Live API / no-scrape mode.** Reading dnd.su at runtime per
  request. Out of scope; the seed is static.

## Open clarifications

All seven clarifications resolved 2026-04-27 in chat 75 — see the
`## Clarifications` block near the top of this document. Summary:

| # | Topic | Resolution |
|---|---|---|
| Q1 | Seed file structure | Sibling `items-dndsu.ts` |
| Q2 | Migration granularity | Per-source-book (mig 056+) |
| Q3 | `scraped_at` timestamp | Skip |
| Q4 | DM-edits to `dndsu_url` | Editable plain text |
| Q5 | Catalog perf at 2000+ | Defer; ship-and-measure |
| Q6 | HTML mirror | Gitignored local cache + `--refresh` |
| Q7 | Pricing strategy | `price_gp = NULL` + spec-016 defaults |

## Review & Acceptance Checklist

- [x] Functional requirements complete (FR-001 … FR-020)
- [x] User stories prioritised and each independently testable
- [x] Edge cases listed
- [x] Out-of-scope explicit
- [x] Open clarifications resolved
- [x] No premature implementation detail (no SQL DDL, no file paths
      beyond the existing convention)
