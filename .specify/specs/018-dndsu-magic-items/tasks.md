# Tasks: dnd.su magic items scraper & catalog import

**Spec**: `.specify/specs/018-dndsu-magic-items/spec.md`
**Plan**: `.specify/specs/018-dndsu-magic-items/plan.md`
**Created**: 2026-04-27 (chat 75)
**Status**: Draft

> Working mode: pick the first unchecked `[ ]`, do it, mark `[x]`,
> stop, wait for confirmation. `[P]` = parallelisable (no ordering
> dependency on neighbours). 25 tasks across 8 phases.

---

## Phase 1 — Recon spike

- [x] **T001 [P1]** dnd.su list discovery. Plan A confirmed —
  `/piece/items/index-list/` returns full HTML index (934 items,
  OPFS-cached client-side). Snapshot committed at
  `mat-ucheniya/scripts/dndsu-recon-snapshot.html`. Findings + split
  strategy for umbrella items in `mat-ucheniya/scripts/dndsu-recon.md`.

- [x] **T002 [P1]** Sample item fixtures saved в
  `mat-ucheniya/scripts/dndsu-cache-fixtures/` (committed).
  **Format: `.md` (markdown extraction)** — а не `.html`. Reason:
  fetched через web_fetch tool (markdown extraction), не через
  raw HTTP. Production `scrape_dndsu.py` (T005) делает
  HTML→markdown preprocessing (BeautifulSoup отрезает
  header/aside/footer + html2text/markdownify), парсер работает
  на унифицированной markdown-форме.

  Захвачено 4/5 (chat 76):
  - `1-adamantine-armor.md` — uncommon armor, no attunement, generic
  - `160-weapon-1-2-3.md` — **umbrella** (3 tiers, no attunement)
  - `2489-bloodwell-vial.md` — **umbrella** (3 tiers, attunement сорсэрером)
  - `161-weapon-of-warning.md` — non-umbrella generic weapon enchant
    (concrete uncommon, requires attunement)

  Missing 5th (`94-ring-of-protection.md` для rare + ring slot
  coverage) — добавит юзер вручную через `Save Page As` либо T011
  full scrape подберёт автоматически. Текущих 4 хватает для
  umbrella vs single-record split testing в T010.

---

## Phase 2 — Scraper infrastructure

- [x] **T003 [P1]** Skeleton `mat-ucheniya/scripts/scrape_dndsu.py`:
  argparse (`--refresh`, `--output`, `--limit`, `--from-id`,
  `--cache-dir`, `-v`), `Scraper` class shell, default cache dir
  `scripts/dndsu-cache/`, gitignore'd, `__main__` entry. Done.

- [x] **T004 [P1]** `Scraper.discover_urls()` per Plan A:
  single GET to `/piece/items/index-list/`, BeautifulSoup
  `.list-item__spell a.list-item-wrapper` → 934 hrefs. `--from-id`
  filter applied client-side. Verified against snapshot (no network):
  selector returns all 934 cards.

- [x] **T005 [P1]** `Scraper.fetch_or_cached(url)`:
  SHA1 cache key, hit → markdown read, miss → HTTP GET (1 req/s,
  retry on 429/5xx с exp backoff `[1,2,4,8]`s), strip nav/aside/
  footer/script via BeautifulSoup, html2text → markdown, save to
  cache. `--refresh` invalidates per-url cache.

- [x] **T006 [P1] [P]** `parse_item(md, url) -> list[ItemRecord]`:
  line-based header split (replaces monolithic regex — too many
  optional fields confused engine), edition gate (5e24 → `[]`),
  delegates to `parse_first_bullet` for umbrella vs single dispatch.

- [x] **T007 [P1]** `parse_first_bullet`: UMBRELLA_RE first
  (literal "редкость варьируется" anchor, captures tier list),
  fallback SINGLE_BULLET_RE (rarity stems enumerated, `.+?` for
  type_clause to allow parenthetical commas, e.g. «Доспех (средний
  или тяжёлый, кроме шкурного)»). Rarity vocabulary order:
  `необычн` before `обычн`, `очень редк` before `редк` (substring
  trap fix).

- [x] **T008 [P1]** `map_category` / `map_slot` (top-level lookups
  with order-sensitive matching), weapon-shape inference (двуручн
  → `2-handed`, лук/арбалет/метательн → `ranged`, default `1-handed`).
  Unknown badges → `_warnings` field.

- [x] **T009 [P1]** Description + price parsing:
  `PRICE_RE` captures `**Рекомендованная стоимость:**` bullet,
  `parse_description` collects body between item-title H2 and next
  H2, filters out `[Распечатать]`, image bullets, type/rarity
  bullet, and price bullet. Source-book mapping: 41 codes in
  `SOURCE_BOOKS` dict (DMG, PHB, XGE, TCE, VRGR, …), unknown →
  `_warnings`.

- [x] **T010 [P1] [P]** Parser unit tests
  `mat-ucheniya/scripts/test_scrape_dndsu.py`: **17 tests, all
  passing** (`pytest test_scrape_dndsu.py -v`). Coverage: 4
  helper-fn tests, 5 header/first-bullet structural tests, 2
  non-umbrella full ItemRecord assertions, 2 umbrella expansion
  assertions (3 records each, distinct slugs/titles/rarities,
  shared attunement/url/description), 2 edition-gate / non-item
  rejection tests. Synthetic 5e24 fixture → `[]`.

---

## Phase 4 — Codegen TS seed

- [x] **T011 [P1]** Full scrape run (chat 76):
  ```
  python scrape_dndsu.py --output dndsu_items.json -v
  ```
  Result: **887 records from 934 URLs** (77 skipped — empty cards
  from 5e24-migrated entries; akmon-style). Cache populated;
  re-runs use disk hits. Iterative SOURCE_BOOKS patches across
  3 chats (initial guesses → +6 codes → +13 codes) brought
  warnings down to 0. `dndsu_items.json` is the source for T013.

- [x] **T012 [P1] [P]** Extended `ItemSeedEntry` with two optional
  fields: `dndsuUrl?: string`, `sourceDetail?: string`. Existing
  hand-curated entries leave both `undefined`; dnd.su entries carry
  both. typedoc comments explain provenance.

- [x] **T013 [P1]** TS codegen — `scripts/items-dndsu-codegen.ts`:
  - Reads `scripts/dndsu_items.json`
  - Validates each record's category/rarity/slot against the enum
    unions (throws on out-of-band values)
  - Detects internal `srdSlug` duplicates (throws)
  - Dedups against `ITEMS_SRD_SEED` (warns to stderr)
  - Sorts by `srdSlug` ASC
  - Default mode: writes `lib/seeds/items-dndsu.ts` with
    `export const ITEMS_DNDSU_SEED: ReadonlyArray<ItemSeedEntry>`
  - Run: `npx tsx scripts/items-dndsu-codegen.ts`

- [x] **T014 [P1]** SQL emit helpers in same file — invoked via
  `--emit-migrations` flag:
  - `groupBySourceBook` partitions by `sourceDetail` (or `misc`)
  - `bookSlug` produces stable filename token from book name
  - `emitMigrationSql` per book — header comment, `begin`,
    `do $$ ... $$` block, single CTE (seed → typed_seed → inserted →
    item_attributes), NOT EXISTS guard on `(campaign_id, srd_slug)`,
    `commit`. Phase 2 backfill omitted vs spec-015 — dnd.su titles
    too generic to safely match historical transactions
  - Files written to `supabase/migrations/0XX_dndsu_<book>_items.sql`,
    starting at next free migration number (auto-detected)
  - Run: `npx tsx scripts/items-dndsu-codegen.ts --emit-migrations`

- [x] **T016 [P1] [P]** vitest для codegen
  `mat-ucheniya/lib/seeds/__tests__/items-dndsu.test.ts`:
  - Sanity floor (≥ 100 entries)
  - All category / rarity / slot values within enum (or null)
  - No internal `srdSlug` duplicates
  - No `srdSlug` collision with `ITEMS_SRD_SEED`
  - All `dndsuUrl` start with `https://dnd.su/items/<id>-`
  - Umbrella tier slugs (`...-plus-N`) come in groups ≥ 2
  - Run: `npm run vitest` (after T015 generates the seed)

---

## Phase 5 — Run codegen + present migrations

- [ ] **T015 [P1]** Run codegen, produce migrations.
  TS seed:
  ```
  cd mat-ucheniya && npx tsx scripts/items-dndsu-codegen.ts
  ```
  Migrations:
  ```
  cd mat-ucheniya && npx tsx scripts/items-dndsu-codegen.ts --emit-migrations
  ```
  Output: `mat-ucheniya/supabase/migrations/056_*.sql …`,
  filenames per book (e.g. `056_dndsu_dungeon-masters-guide_items.sql`).
  Inspect first migration visually: SQL valid, expected count, NOT
  EXISTS clause correct.

- [ ] **T017 [P1]** `present_files` всех новых миграций для review
  ДМом перед applying.

- [x] **T018 [P1]** DM applied 50 migrations (056-105) to mat-ucheniya
  via Supabase Dashboard SQL Editor (chat 76).

- [x] **T019 [P1]** SQL smoke `mat-ucheniya/scripts/check-rls-018.sql`
  written. 8 cases inside BEGIN/ROLLBACK:
  1. Total seeded count (≥ 800 floor)
  2. JSONB shape — every item has srd_slug + description + dndsu_url
  3. item_attributes row + source_slug='srd-5e' for all imported items
  4. dndsu_url shape — all match `https://dnd.su/items/N-...`
  5. Idempotency — re-apply produces 0 new inserts (NOT EXISTS guard)
  6. FK CASCADE — delete node removes item_attributes row
  7. FK SET NULL — delete node nulls transactions.item_node_id
  8. kind/link CHECK — rejects item_node_id on kind='money'
  Run: paste into Supabase Dashboard SQL Editor → Run → all `PASS`.

- [ ] **T020 [P1]** Visual sanity check на проде:
  - Open `https://mother-of-learning.vercel.app/c/mat-ucheniya/items?category=magic-item`
  - Confirm count ≥ 800
  - Sample 20 random items, click permalink, compare against dnd.su
    оригинал (title, rarity, attunement, slot, description verbatim)
  - Pass: ≥ 18/20 точное совпадение
  - Fail >2 → парсер edge case → patch + re-run T011-T015

---

## Phase 7 — UI wire-up

- [x] **T021 [P1] [P]** `lib/items.ts` + `lib/items-types.ts`:
  - `ItemNode.dndsuUrl: string | null` added
  - `hydrate()` reads `nodes.fields.dndsu_url` into the field
  - All test fixtures updated (`items-filters.test.ts`,
    `items-grouping.test.ts`, `items-validation.test.ts`)

- [x] **T022 [P1] [P]** `app/actions/items.ts`:
  - `ItemPayload.dndsuUrl: string | null` added
  - `createItem` and `updateItem` write `fields.dndsu_url =
    payload.dndsuUrl?.trim() || undefined` (omits empty strings to
    keep JSONB clean)
  - No validation — any string acceptable

- [x] **T023 [P1]** UI components:
  - `components/item-form-page.tsx`: новое поле «Ссылка на dnd.su»
    (`<input type="url">`) рядом с «Детали источника»; стейт +
    submit hookup
  - `app/c/[slug]/items/[id]/page.tsx`: при truthy `item.dndsuUrl` —
    рендер ссылки `<a target="_blank" rel="noopener noreferrer">`
    с lucide `<ExternalLink>` иконкой, текст «Открыть на dnd.su»

---

## Phase 8 — Smoke + close-out

- [x] **T024 [P1]** Spec amendment for FR-012:
  - `spec.md` FR-012 переписан: «All imported items reuse the
    existing `source_slug='srd-5e'` bucket; per-book name lives in
    `nodes.fields.source_detail`. Per-book filter chips deferred to
    follow-up spec»
  - Q8 (post-clarify, plan-time) добавлен в `## Clarifications`
    — narrowing rationale

- [ ] **T025 [P1]** Close-out:
  - `NEXT.md`: move spec-018 into «В проде» с краткой выжимкой,
    bump version `0.6.0 → 0.7.0`, "Следующий приоритет" → spec-019
    карта мира (если порядок не поменялся)
  - `backlog.md`: только если новые баги/идеи появились
  - `chatlog/2026-04-XX-chat75-spec018-dndsu-items.md` (плюс
    отдельные файлы под последующие чаты в Implement-фазе)
  - Commit + push

---

### Status: **Draft**. Awaiting Implement.

### Phase dependencies

```
Phase 1 (T001-T002) ──▶ Phase 2 (T003-T006) ──▶ Phase 3 (T007-T010)
                                                       │
                                                       ▼
                                              Phase 4 (T011-T013)
                                                       │
                                                       ▼
                                              Phase 5 (T014-T017)
                                                       │
                                                       ▼
                            Phase 7 (T021-T023) ◀──── Phase 6 (T018-T020)
                                       │                       │
                                       └────────┬──────────────┘
                                                ▼
                                       Phase 8 (T024-T025)
```

Phase 7 и Phase 6 параллельны (UI правки можно делать пока DM
применяет миграции). Остальные строго последовательны.
