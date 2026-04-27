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

- [ ] **T001 [P1]** dnd.su list discovery. Open `https://dnd.su/items/`
  в браузере, DevTools Network tab. Найти XHR/fetch который грузит
  список items. Document findings:
  - **Plan A** найден: записать endpoint URL, response shape (JSON
    array? paged? what fields).
  - **Plan A** не найден, переход к **Plan B**: probe `/items/1/`,
    `/items/2/` без slug — есть 301 redirect на `/items/{id}-{slug}/`?
    Если да — sequential iteration работает.
  - Если ни A ни B — **Plan C**: пометить что нужен Playwright,
    bump effort estimate.

  Output: `mat-ucheniya/scripts/dndsu-recon.md` (~0.5 страницы) с
  выбранной стратегией + 1-2 sample URL, на которых проверена.

- [ ] **T002 [P1]** Сохранить 5 sample item HTML страниц в
  `mat-ucheniya/scripts/dndsu-cache-fixtures/` (committed, не
  gitignored — это test fixtures). Покрытие:
  - `94-ring-of-protection.html` — rare ring + attunement
  - `1-?` — common wondrous без attunement
  - `?-flaming-sword` (или аналог) — magic weapon +1
  - `?-vorpal-sword` (или legendary) — legendary
  - `?-?` — edge case: no price line / unusual structure

  Скачать вручную через браузер `Save Page As` или `curl` — главное
  чтобы они оказались в репо для unit-тестов парсера.

---

## Phase 2 — Scraper infrastructure

- [ ] **T003 [P1]** Skeleton `mat-ucheniya/scripts/scrape_dndsu.py`:
  - `argparse`: `--refresh`, `--output`, `--limit N`, `--from-id`,
    `--cache-dir`
  - Empty class `Scraper` с конструктором + конфиг
  - Cache directory под `scripts/dndsu-cache/`
  - Добавить `dndsu-cache/` в `.gitignore`
  - `if __name__ == "__main__":` block

- [ ] **T004 [P1]** Implement `Scraper.discover_urls()` per T001
  decision. Возвращает `list[str]` полных URL'ов.
  - Plan A: 1 fetch + parse JSON
  - Plan B: iterate IDs, 1 req/s, capture 200-redirected URLs
  - Поддерживать `--from-id` для resume

- [ ] **T005 [P1]** Implement `Scraper.fetch_or_cached(url)`:
  - SHA1(url) → cache filename
  - Cache hit → read from disk
  - Miss → HTTP GET (requests library), 1 req/s sleep, save to cache
  - Retry on 429/5xx с exponential backoff (1s, 2s, 4s, 8s; max 4
    retries)
  - User-Agent: `"MoL spec-018 research bot
    (https://github.com/Novoandrey/mother-of-learning)"`
  - `--refresh` flag invalidates cache (deletes file before fetch)
  - Logging: hit / miss / fetch time

- [ ] **T006 [P1] [P]** Implement `Scraper.parse_item(html)` —
  header section parsing:
  - Extract `title_ru`, `title_en`, `source_book_short`, `edition`
    из `<h2>` блока
  - Edition gate: skip if edition != `5e14` (return None)
  - Extract `dndsu_url` из canonical link / og:url meta

  Returns `ItemRecord | None` (skip ⇒ None).

---

## Phase 3 — Classification rules

- [ ] **T007 [P1]** Implement bullet-1 line parser
  (type/rarity/attunement):
  - Locate first bullet после image
  - Regex: `^(.+?), ([а-яё ]+?)( \(требуется настройк[аи]\))?\.?$`
  - Map captured Russian rarity → enum (см. `## Classification rules`
    в plan.md)
  - `requires_attunement` = bool(group 3 не пуст)
  - Edge: rarity «качество варьируется» → `rarity = None`

- [ ] **T008 [P1]** Category + slot mapping:
  - Python dict `CATEGORY_MAP` (тип → category_slug, fallback
    `magic-item`)
  - Python dict `SLOT_MAP` (тип → slot_slug, fallback `null`)
  - Special handling for `Оружие (X)` patterns — parse parenthetical
    to determine `1-handed`/`2-handed`/`ranged`/`versatile`
  - Logging: unknown category / slot strings → `_warnings` field
    в record

- [ ] **T009 [P1]** Description + price-range parser:
  - Locate `**Рекомендованная стоимость:**` bullet, capture remainder
    text → `price_range_text`
  - Description: collect all `<p>` / `<li>` between header bullets
    and `## Комментарии` heading
  - Strip HTML, decode entities, preserve `\n\n` between paragraphs
  - Inline emphasis (italics around spell names) → keep as plain text
  - Source-book mapping: `DMG` → `Dungeon Master's Guide` etc.
    (table в plan.md). Unknown badges → store badge as-is + warning.

- [ ] **T010 [P1] [P]** Parser unit tests
  `mat-ucheniya/scripts/test_scrape_dndsu.py` (pytest):
  - 5 тестов на 5 fixtures из T002
  - Each verifies all 13 fields в ItemRecord
  - Tests против 5e24 fixture (если есть): должен вернуть None
  - Run: `cd mat-ucheniya/scripts && pytest test_scrape_dndsu.py`
  - All 5+ passing — иначе stop until parser fixed

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
