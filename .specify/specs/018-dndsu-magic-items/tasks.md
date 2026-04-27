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

- [ ] **T011 [P1]** Full scrape run:
  - `python scrape_dndsu.py --output dndsu_items.json` (без
    `--limit`)
  - Сетевой бюджет: ~30-50 мин
  - Verify ≥ 1000 records в JSON
  - `_warnings` field analysis: если > 5% items с warnings,
    open issue + manually patch parser, re-run
  - Commit `dndsu_items.json` to repo (decision T011 — keep for
    reproducibility, ~5 MB)

- [ ] **T012 [P1] [P]** Extend `ItemSeedEntry` type в
  `mat-ucheniya/lib/seeds/items-srd.ts`:
  - Add optional fields: `dndsuUrl?: string`, `sourceDetail?: string`
  - Existing 274 entries не трогаем (поля optional)
  - Update typedoc comment

- [ ] **T013 [P1]** TS codegen
  `mat-ucheniya/scripts/items-dndsu-codegen.ts`:
  - Read `dndsu_items.json`
  - Import `ITEMS_SRD_SEED` from `lib/seeds/items-srd.ts`
  - Dedup: drop records where `srd_slug` ∈ existing seed (log
    skipped count)
  - Sort by `srd_slug` ASC
  - Emit `mat-ucheniya/lib/seeds/items-dndsu.ts` со структурой:
    ```typescript
    export const ITEMS_DNDSU_SEED: ReadonlyArray<ItemSeedEntry> = [
      // ~1000 entries
    ]
    ```
  - Validate: no duplicate `srdSlug` в emitted array
  - Run: `cd mat-ucheniya && npx tsx scripts/items-dndsu-codegen.ts`

---

## Phase 5 — Codegen migrations

- [ ] **T014 [P1]** SQL emit helper inside `items-dndsu-codegen.ts`:
  - `groupBySourceBook(records)` → `Map<bookCode, records[]>`
  - `emitMigrationSql(book, records, migrationNum)` → string
  - Template per migration: header comment, `begin`, `do $$ ... $$`,
    Phase 1 INSERT (NOT EXISTS guard), Phase 2 backfill UPDATE,
    `commit`. Skeleton в plan.md `## Migration template`.

- [ ] **T015 [P1]** Run codegen, produce migrations:
  - `npx tsx scripts/items-dndsu-codegen.ts --emit-migrations`
  - Output: `mat-ucheniya/supabase/migrations/056_*.sql … 06X_*.sql`
  - Filenames: `056_dndsu_phb_items.sql` etc.
  - Inspect first migration visually: SQL syntax valid, expected
    item count, NOT EXISTS clause correct

- [ ] **T016 [P1] [P]** vitest для codegen
  `mat-ucheniya/lib/seeds/__tests__/items-dndsu.test.ts`:
  - All entries have `srdSlug`, `titleRu`, `category`, `dndsuUrl`
  - All `category` ∈ enum, all `rarity` ∈ enum-or-null,
    all `slot` ∈ enum-or-null
  - No duplicate `srdSlug` between `ITEMS_SRD_SEED` и
    `ITEMS_DNDSU_SEED`
  - All `dndsuUrl` start with `https://dnd.su/items/`
  - Run: `npm run vitest`

- [ ] **T017 [P1]** `present_files` всех новых миграций для review
  ДМом перед applying.

---

## Phase 6 — Apply + verify

- [ ] **T018 [P1]** Apply migrations to mat-ucheniya:
  - DM (user) копирует каждую миграцию в Supabase Dashboard SQL Editor
  - Применяет по порядку 056 → 057 → … → 06X
  - Capture RAISE NOTICE output для каждой: «Campaign X: inserted N,
    backfilled M»
  - Проверка: total inserted ≈ количество в JSON минус skipped

- [ ] **T019 [P1]** SQL smoke
  `mat-ucheniya/scripts/check-rls-018.sql` (8 cases, BEGIN…ROLLBACK):
  1. Outsider RLS — non-member не видит imported items
  2. Member RLS — DM/player видят, читают `dndsu_url` из fields
  3. CASCADE — delete node удаляет item_attributes row
  4. SET NULL — delete node sets transactions.item_node_id = null
  5. kind/link CHECK — нельзя поставить item_node_id на kind='money'
  6. JSONB shape — `fields ? 'srd_slug'`, `fields ? 'description'`,
     `fields ? 'dndsu_url'` все true
  7. Idempotency — re-apply одной миграции даёт 0 inserts, 0 updates
  8. Backfill rule — UPDATE привязал ≥ 3 transaction'а к imported
     items
  - Run в Supabase Dashboard, all 8 ✓

- [ ] **T020 [P1]** Visual sanity check на проде:
  - Open `https://mother-of-learning.vercel.app/c/mat-ucheniya/items?category=magic-item`
  - Confirm count ≥ 1000
  - Sample 20 random items, click permalink, compare against dnd.su
    оригинал (title, rarity, attunement, slot, description verbatim)
  - Pass: ≥ 18/20 точное совпадение
  - Fail >2 → парсер edge case → patch + re-run T011-T015

---

## Phase 7 — UI wire-up

- [ ] **T021 [P1] [P]** Extend `mat-ucheniya/lib/items.ts`:
  - Add `dndsuUrl: string | null` to `ItemNode` type
  - In `getItemById` / `getItems`: extract from
    `nodes.fields.dndsu_url` (or null)
  - In `mapItemRow` helper (если есть)

- [ ] **T022 [P1] [P]** `mat-ucheniya/app/actions/items.ts`:
  - `ItemPayload`: add optional `dndsuUrl?: string`
  - `createItem`: write `fields.dndsu_url = payload.dndsuUrl?.trim()
    || undefined`
  - `updateItem`: same write logic
  - No validation needed (any string OK; URL format не enforce'им)

- [ ] **T023 [P1]** UI components:
  - `mat-ucheniya/components/item-form-page.tsx`: новое поле
    "Источник" (URL input) рядом с "Источник материала" (которое
    уже там — это `sourceDetail`). Plain `<input type="url">`,
    state, submit hookup
  - `mat-ucheniya/app/c/[slug]/items/[id]/page.tsx`: если
    `item.dndsuUrl` truthy — рендер `<a>` с lucide `ExternalLink`
    icon, target=_blank, rel=noopener noreferrer, текст
    «Открыть на dnd.su»
  - Verify build: `npm run build` clean

---

## Phase 8 — Smoke + close-out

- [ ] **T024 [P1]** Spec amendment for FR-012:
  - Edit `.specify/specs/018-dndsu-magic-items/spec.md`
  - Replace FR-012 body: "Use existing `source_slug='srd-5e'`
    bucket; per-book name lives in `nodes.fields.source_detail`.
    Per-book filter chips deferred to follow-up spec if/when needed."
  - Add note in `## Clarifications`: "Q8 (post-clarify, plan-time):
    FR-012 narrowed — see plan.md `## Schema impact`."

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
