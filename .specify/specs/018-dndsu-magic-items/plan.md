# Implementation Plan: dnd.su magic items scraper & catalog import

**Spec**: `.specify/specs/018-dndsu-magic-items/spec.md`
**Created**: 2026-04-27 (chat 75)
**Status**: Draft
**Estimated effort**: ~2 рабочих дня. Phase 1 recon spike (≤ 2ч),
Phase 2-3 scraper + parser (~6ч), Phase 4-5 codegen + migrations
(~3ч), Phase 6-7 backfill + UI (~2ч), Phase 8 smoke (~2ч).
Сетевой бюджет: первый scrape ~30-50 мин на 1500 items при 1 req/s.

---

## Architecture overview

Спека — **scripts + data**, минимум кода в приложении. Пайплайн
повторяет существующий (`parse_srd.py` для монстров, `items-srd-codegen.ts`
для hand-curated baseline), расширяя его сетевым stage'ом:

```
   ┌──────────────┐    ┌──────────────────────┐    ┌─────────────────┐
   │  dnd.su      │───▶│  scripts/scrape_     │───▶│  cache/*.html   │
   │  /items/*    │    │     dndsu.py         │    │  (gitignored)   │
   └──────────────┘    └──────────────────────┘    └─────────────────┘
                                  │
                                  ▼
                       ┌──────────────────────┐
                       │  scripts/dndsu_      │  ← parser + classifier
                       │     items.json       │     (committed)
                       └──────────────────────┘
                                  │
                                  ▼
              ┌──────────────────────────────────────┐
              │  scripts/items-dndsu-codegen.ts      │  ← reads JSON,
              │                                       │     dedupes vs
              │                                       │     items-srd.ts
              └──────────────────────────────────────┘
                                  │
                       ┌──────────┴──────────┐
                       ▼                     ▼
       ┌──────────────────────┐   ┌──────────────────────┐
       │ lib/seeds/           │   │ supabase/migrations/ │
       │   items-dndsu.ts     │   │   056_*.sql … 06X    │
       └──────────────────────┘   └──────────────────────┘
                                  │
                                  ▼
                      Supabase (apply миграции)
```

Принципы:

- **Scrape stage** — Python (рядом с `parse_srd.py`), кеш в gitignored
  папке. Эмиттит structured JSON, который сам не идёт в прод —
  это intermediate.
- **Parser/classifier** внутри scrape'а (на той же стадии). Pure-rule
  HTML→record extraction, без AI.
- **Codegen stage** — TypeScript (рядом с `items-srd-codegen.ts`).
  Читает JSON + существующий `items-srd.ts` для dedup, эмиттит TS
  seed + per-book SQL миграции.
- **Application changes** — минимальны: `dndsu_url` field на item
  form (editable input) + "Источник" link на permalink page.

Разделение Python/TS осознанное: HTML-парсинг сильно проще на
Python с BeautifulSoup; codegen и dedup хочется в TS, чтобы прямо
импортировать существующий `ITEMS_SRD_SEED` массив и проверять
конфликты статически.

---

## Discovery strategy (Phase 1, T001)

Index-страница `/items/` рендерится JS'ом — список URL'ов не достаём
out-of-the-box. Три варианта в порядке предпочтения:

### Plan A: JSON API discovery

Большинство современных сайтов с динамическими списками подсасывают
данные XHR'ом. Если такой эндпоинт есть на dnd.su — он вернёт
полный список item URL/ID одним запросом. Это идеал: zero-fetch
discovery.

Как проверять (T001 spike):
- Открыть `/items/` в браузере с DevTools, посмотреть Network tab
  во время загрузки — найти XHR который грузит список.
- Альтернативно — fetch `/items/` и `grep` HTML на упоминания
  `.json`, `/api`, fetch(), XMLHttpRequest.

Если API найден — записать URL в `scripts/scrape_dndsu.py` константой,
парсить response, переходить к Phase 2.

### Plan B: Sequential ID iteration

URL-структура `/items/{numeric_id}-{slug}/` намекает: probe id=1, 2, 3,
... пока N подряд не вернут 404. Но slug в URL обязателен — может,
hit на `/items/{id}/` без slug сделает 301-redirect? Тоже T001 проверка.

Если works:
- iterate `id ∈ [1, 3000]` (overshoot), follow redirects, capture
  resolved URL.
- 1 req/s × 3000 ≈ 50 мин для discovery (плюс fetch контента —
  столько же).

Если slug в URL обязателен и redirect не работает — запасной план:
fetch `/items/{id}/` всё равно и парсить server-side error pages
(в Django 404 часто содержит правильный URL в Location header).

### Plan C: Headless render

Playwright/pyppeteer рендерит JS, парсит готовый список. Heaviest
dependency, но bulletproof. Использовать только если A и B не
сработали.

T001 deliverable: `scripts/dndsu-recon.md` — короткая записка
(0.5 страницы) с описанием что нашли + какой план выбираем.

---

## Schema impact

**Минимальный.** Никаких новых таблиц, никаких новых колонок.

### `nodes.fields` JSONB extensions

Добавляются три ключа (только для импортированных предметов):
- `srd_slug` — string, slug item'а с dnd.su (e.g. `ring-of-protection`).
  Уже используется hand-curated seed'ом (mig 044), переиспользуем.
- `description` — string, full Russian description from dnd.su.
  Уже используется (mig 044).
- `source_detail` — string, человекочитаемое название книги
  (e.g. `"Dungeon Master's Guide"`). Существующее поле (см. spec-015,
  `app/actions/items.ts:226`).
- `dndsu_url` — string, новое поле (FR-011).

### `item_attributes` (без миграций)

Все колонки уже есть от spec-015 + 055:
- `category_slug` — set'ит классификатор
- `rarity` — set'ит классификатор (NULL для не-magic)
- `price_gp` — **NULL** для всех magic-предметов (FR-020)
- `weight_lb` — set'им если dnd.su отдаёт; иначе NULL
- `slot_slug` — set'ит slot inference
- `source_slug` — **`'srd-5e'` для всего dnd.su-импорта**, см. ниже
- `availability_slug` — NULL (мы не импортируем availability с dnd.su;
  это per-campaign)
- `requires_attunement` — set'ит классификатор

### Revision of FR-012 (resolved during planning)

Spec FR-012 предполагал добавить новые `categories` rows
(`item-source`) для PHB / DMG / XGE / etc. Recon показал что:

1. Существующая схема использует `source_slug='srd-5e'` как broad
   bucket + `nodes.fields.source_detail` как free-text book name.
2. Все 274 hand-curated items уже сидят на `source_slug='srd-5e'`.
3. Per-book filter chips в catalog ни в каком user story не
   встречаются (все P1-P3 stories спека описывает фильтры по
   category / rarity / slot, не по source).

**Plan revises FR-012 to**: do NOT add new `item-source` slugs.
Все импортированные dnd.su items получают `source_slug='srd-5e'`,
имя книги (`Dungeon Master's Guide`, `Player's Handbook`, …) — в
`nodes.fields.source_detail`. Если per-book filter понадобится
позже — отдельная мини-спека с миграцией добавит slugs и UPDATE'ом
проставит их по source_detail.

Это **уменьшает scope**: убирает сложную часть FR-012 + связанную
правку `seedCampaignCategories` TS-extension. Spec-amendment в
конце Phase 8.

---

## Component layout

```
mat-ucheniya/
├── scripts/
│   ├── scrape_dndsu.py             ← NEW: fetch + cache + parse
│   ├── dndsu-cache/                ← NEW: gitignored HTML mirror
│   ├── dndsu_items.json            ← NEW: scraped intermediate
│   ├── items-dndsu-codegen.ts      ← NEW: emit TS seed + SQL
│   ├── dndsu-recon.md              ← NEW (T001): discovery notes
│   └── (existing: parse_srd.py, items-srd-codegen.ts, …)
├── lib/seeds/
│   ├── items-srd.ts                ← unchanged (274 entries)
│   └── items-dndsu.ts              ← NEW: generated seed (~1500 entries)
├── supabase/migrations/
│   ├── 056_dndsu_phb_items.sql     ← NEW (per-source-book)
│   ├── 057_dndsu_dmg_items.sql     ← NEW
│   ├── 058_dndsu_xge_items.sql     ← NEW
│   ├── 059_dndsu_tce_items.sql     ← NEW
│   ├── 060_dndsu_supplements.sql   ← NEW (catch-all if mixed)
│   └── (final list determined by codegen)
├── app/c/[slug]/items/[id]/
│   └── page.tsx                    ← MOD: render «Источник» link
├── components/
│   └── item-form-page.tsx          ← MOD: editable dndsu_url input
├── lib/items.ts                    ← MOD: include dndsu_url in shape
├── app/actions/items.ts            ← MOD: accept dndsuUrl in payload
└── .gitignore                      ← MOD: dndsu-cache/
```

---

## Scraper architecture (Phase 2-3)

### Python scraper (`scripts/scrape_dndsu.py`)

```python
# High-level shape (NOT implementation — that lives in tasks.md)

class Scraper:
    cache_dir: Path
    rate_limit_seconds: float = 1.0
    user_agent: str = "MoL spec-018 research bot (https://github.com/...)"

    def discover_urls(self) -> list[str]: ...   # Plan A confirmed (T001)
    def fetch_or_cached(self, url: str) -> str: # cache-first
    def parse_item(self, html: str) -> list[ItemRecord]:  # 0..N records
    def run(self) -> None:
        urls = self.discover_urls()
        records = [
            r
            for u in urls
            for r in self.parse_item(self.fetch_or_cached(u))
        ]
        write_json(records, "dndsu_items.json")
```

**Note (post-T001 amendment, chat 76)**: `parse_item` returns
`list[ItemRecord]` — empty list for skipped pages (wrong edition),
single-item list for normal items, multi-item list for umbrellas
(see «Umbrella items» below). Original signature was
`Optional[ItemRecord]`; widened to handle tier expansion.

### `ItemRecord` shape (intermediate JSON)

```json
{
  "srd_slug": "ring-of-protection",
  "title_ru": "Кольцо защиты",
  "title_en": "Ring of protection",
  "category": "magic-item",
  "rarity": "rare",
  "requires_attunement": true,
  "slot": "ring",
  "weight_lb": null,
  "price_range_text": "501-5 000 зм",
  "description_ru": "Вы получаете бонус +1 к КД и спасброскам, пока носите это кольцо.",
  "source_book": "Dungeon Master's Guide",
  "source_book_short": "DMG",
  "edition": "5e14",
  "dndsu_url": "https://dnd.su/items/94-ring-of-protection/",
  "_warnings": []
}
```

### Parser stages

1. **Header parse** — `<h2>` или `## ` блок: title_ru, title_en,
   source_book_short (`DMG14` → `DMG` + edition `5e14`).
2. **Type/rarity/attunement line** — bullet-1 после image:
   regex на «(тип), (редкость) (требуется настройка)?». Maps to
   `category` + `rarity` + `requires_attunement`.
3. **Price line** — bullet «**Рекомендованная стоимость:** N–M зм».
   Capture as raw text → `price_range_text`. NOT parsed to numbers
   (FR-020).
4. **Description** — все остальные `<p>` / `<li>` ниже до начала
   секции `## Комментарии`. Strip to plain text + paragraph breaks
   (`\n\n`).
5. **Edition gate** — если страница относится к 5e24 (URL `next.dnd.su`
   или badge показывает только `XX24`) — skip. Текущая редакция
   = 5e14 only.

### Classification rules

**Rarity vocabulary** (dnd.su → ours):

| dnd.su text                        | our `rarity`   |
|------------------------------------|----------------|
| `обычный`, `обычное`, `обычная`    | `common`       |
| `необычный`, `необычное`, …        | `uncommon`     |
| `редкий`, `редкое`, `редкая`       | `rare`         |
| `очень редкий`, `очень редкое`, …  | `very-rare`    |
| `легендарный`, `легендарное`, …    | `legendary`    |
| `артефакт`                          | `artifact`     |
| `качество варьируется`              | `null` (skip)  |

**Category vocabulary** (dnd.su тип → наш category_slug):

| dnd.su «тип»                                     | our `category_slug` |
|--------------------------------------------------|---------------------|
| `Кольцо`                                         | `magic-item`        |
| `Плащ`, `Амулет`, `Сапоги`, …, `Чудесный предмет`| `wondrous`          |
| `Оружие (X)` (e.g. `Оружие (длинный меч)`)       | `weapon`            |
| `Доспех (X)`                                     | `armor`             |
| `Зелье`, `Свиток`                                | `consumable`        |
| `Жезл`, `Палочка`, `Посох` (specifically magic)  | `magic-item`        |
| Anything else                                    | `magic-item` (fallback) |

(Final mapping table goes into the scraper as a Python dict;
extending = editing dict + re-running.)

**Slot vocabulary** (dnd.su → ours, lossy mapping):

| dnd.su «тип» tail                | our `slot_slug` |
|----------------------------------|-----------------|
| `Кольцо`                         | `ring`          |
| `Плащ`                           | `cloak`         |
| `Амулет`, `Талисман`             | `amulet`        |
| `Сапоги`, `Ботинки`              | `boots`         |
| `Перчатки`, `Рукавицы`           | `gloves`        |
| `Шлем`, `Корона`, `Диадема`      | `headwear`      |
| `Пояс`                           | `belt`          |
| `Оружие (двуручное …)`           | `2-handed`      |
| `Оружие (метательное / лук)`     | `ranged`        |
| `Оружие (...)` else              | `1-handed` (default for melee weapons) |
| `Доспех`                         | `body`          |
| `Щит`                            | `shield`        |
| Anything else                    | `null`          |

**Attunement** — boolean, true iff text contains
«требует настройки» (case-insensitive).

**Source-book mapping** (dnd.su badge → source_detail string):

| Badge | source_detail                          |
|-------|----------------------------------------|
| `PHB` | `"Player's Handbook"`                  |
| `DMG` | `"Dungeon Master's Guide"`             |
| `XGE` | `"Xanathar's Guide to Everything"`     |
| `TCE` | `"Tasha's Cauldron of Everything"`     |
| `VRGR`| `"Van Richten's Guide to Ravenloft"`   |
| `IMR` | `"Icewind Dale: Rime of the Frostmaiden"` |
| `…`   | (fall back to badge code)              |

(Final list determined empirically — scraper logs unknown badges.)

### Umbrella items — tier expansion (post-T001 amendment, chat 76)

Some dnd.su pages bundle multiple rarity tiers under one URL. First
bullet matches:

```
<тип>, редкость варьируется (+1 X, +2 Y, +3 Z[, требуется настройка ...])
```

Confirmed examples (recon T001):

- `/items/160-weapon-1-2-3/` — title «Оружие, +1, +2, +3»
- `/items/2489-bloodwell-vial/` — title «Флакон с кровью»

**Decision: split into N records, one per tier.** Different rarity →
different price → different availability — single-record loses
critical info that the catalog must expose.

**Detection**: regex on first bullet:
`редкость варьируется \(((?:\+\d+\s+[а-яё ]+,?\s*){2,})(?:,\s*требуется[^)]*)?\)`

Capture the tier list, parse into `[(plus_n, rarity_word), ...]`.

**Per-tier emit rules**:

| Field | Rule |
|---|---|
| `title_ru` | `<base>, +N` where base = strip trailing `, ?\+\d+(, ?\+\d+)*` from page title |
| `title_en` | same approach on English title |
| `rarity` | from tier word via rarity vocabulary |
| `requires_attunement` | shared flag from same bullet — applies to all tiers |
| `srd_slug` | `dndsu-{id}-{slug}-plus-{N}` (e.g. `dndsu-160-weapon-plus-1`) |
| `dndsu_url` | shared umbrella URL across tiers |
| `description_ru` | shared body — body itself describes per-tier rule |
| `category` / `slot` | from same first bullet (shared) |
| `source_book*` / `edition` | shared |
| `price_range_text` | shared if present (often umbrella has no price line) |

**Non-umbrella items keep concrete rarity** in first bullet → single
record path. The fallback rarity vocabulary entry for `качество
варьируется` (rarity=null) handles the rare edge where umbrella regex
doesn't match but rarity is still variable.

**Parser flow**:

```python
def parse_item(html: str) -> list[ItemRecord]:
    if edition_5e24(html): return []
    base = parse_header_and_body(html)  # shared fields
    first_bullet = base.first_bullet_text
    tiers = match_umbrella_pattern(first_bullet)  # [(N, rarity), ...] or []
    if tiers:
        return [
            ItemRecord(**{**base.shared, "title_ru": f"{base.base_title}, +{n}",
                          "rarity": r, "srd_slug": f"{base.slug}-plus-{n}"})
            for (n, r) in tiers
        ]
    return [ItemRecord(**base.shared, rarity=base.concrete_rarity)]
```

---

## TS codegen architecture (Phase 4-5)

### `scripts/items-dndsu-codegen.ts`

Workflow:

1. Read `scripts/dndsu_items.json`.
2. Import `ITEMS_SRD_SEED` from `lib/seeds/items-srd.ts`.
3. **Dedup pass**: drop any record where `srd_slug` already exists
   in `ITEMS_SRD_SEED`. Log skipped count.
4. **Sort pass**: alphabetical by `srd_slug` (FR-005, deterministic
   diff).
5. **Emit `lib/seeds/items-dndsu.ts`**:
   ```typescript
   import type { ItemSeedEntry } from './items-srd' // re-use existing type
   export const ITEMS_DNDSU_SEED: ReadonlyArray<ItemSeedEntry & {
     dndsuUrl: string
     sourceDetail: string
   }> = [ ... ]
   ```
   (Type extension is small — `ItemSeedEntry` gets `dndsuUrl` and
   `sourceDetail` as optional fields, so both seeds share the same
   shape.)
6. **Emit per-book migrations** under `supabase/migrations/`:
   - Group records by `source_book_short`.
   - For each group, generate a migration matching the 049-054
     template (per-campaign DO loop, NOT EXISTS guard, RAISE NOTICE,
     Phase 2 backfill of `transactions.item_node_id`).
   - Filename: `0XX_dndsu_<book>_items.sql` where XX = next free
     migration number.
   - Header comment includes count + source.

### Migration template (per-book)

Pseudo-SQL skeleton (full template lives in tasks.md):

```sql
-- Migration 056 — dnd.su PHB magic items (spec-018).
-- N items, fetched <date> from dnd.su.

begin;

do $$
declare
  c_rec record;
  inserted_count int := 0;
  bf_count int := 0;
begin
  for c_rec in select id from campaigns loop
    -- Phase 1: insert items not yet present (NOT EXISTS guard on srd_slug)
    with seed_data(srd_slug, title_ru, category, rarity, slot,
                   description, source_detail, dndsu_url,
                   requires_attunement) as (
      values
        ('item-1', 'Название 1', 'magic-item', 'rare', 'ring',
         'Полное описание...', 'Player''s Handbook',
         'https://dnd.su/items/X-item-1/', true),
        -- ...
        ('item-N', '…', '…', '…', '…', '…', '…', '…', false)
    ),
    inserted as (
      insert into nodes (campaign_id, type_slug, title, fields)
      select c_rec.id, 'item', s.title_ru,
             jsonb_build_object(
               'srd_slug', s.srd_slug,
               'description', s.description,
               'source_detail', s.source_detail,
               'dndsu_url', s.dndsu_url
             )
      from seed_data s
      where not exists (
        select 1 from nodes n
        where n.campaign_id = c_rec.id
          and n.type_slug = 'item'
          and n.fields->>'srd_slug' = s.srd_slug
      )
      returning id, fields->>'srd_slug' as srd_slug
    )
    insert into item_attributes (
      node_id, category_slug, rarity, slot_slug,
      source_slug, requires_attunement
    )
    select i.id, s.category, s.rarity, s.slot,
           'srd-5e', s.requires_attunement
    from inserted i join seed_data s on s.srd_slug = i.srd_slug;

    get diagnostics inserted_count = row_count;

    -- Phase 2: backfill transactions.item_node_id by name match
    update transactions tx
    set item_node_id = n.id
    from nodes n join item_attributes ia on ia.node_id = n.id
    where tx.kind = 'item'
      and tx.item_node_id is null
      and n.campaign_id = c_rec.id
      and ia.source_slug = 'srd-5e'
      and (
        lower(trim(tx.item_name)) = lower(trim(n.title))
        or lower(trim(coalesce(tx.item_name, ''))) =
           lower(coalesce(n.fields->>'srd_slug', ''))
      );

    get diagnostics bf_count = row_count;

    raise notice 'Campaign %: inserted % items, backfilled % transactions',
                  c_rec.id, inserted_count, bf_count;
  end loop;
end $$;

commit;
```

(Identical structure to migrations 049–054. Codegen just templates
the seed_data VALUES.)

---

## UI changes (Phase 7)

### `components/item-form-page.tsx`

- Add `dndsuUrl?: string` field to form state.
- Render plain `<input type="url">` под "Источник:" label.
- Hooked into existing `onSubmit` — passed to `app/actions/items.ts`
  `updateItem` payload as `dndsuUrl`.

### `app/c/[slug]/items/[id]/page.tsx`

- If `node.fields.dndsu_url` present → render link icon + "Источник:
  dnd.su" link, opens in new tab (`target="_blank"`,
  `rel="noopener noreferrer"`).
- Если поле пустое — секция не рендерится.

### `lib/items.ts` `getItemById`

- Extract `dndsu_url` from `nodes.fields` into the returned shape:
  ```typescript
  type ItemNode = {
    // ... existing fields
    dndsuUrl: string | null
  }
  ```

### `app/actions/items.ts`

- `ItemPayload` accepts optional `dndsuUrl?: string`.
- `createItem` / `updateItem` writes to `fields.dndsu_url`.

**Все правки — additive**, не ломают существующий form / payload /
shape. Зеро TypeScript breakage в других consumer'ах.

---

## Phase ordering (Implement)

| Phase | Tasks | Description                                | Output                          |
|-------|-------|--------------------------------------------|----------------------------------|
| 1     | T001-T002 | Recon spike: discovery strategy        | `scripts/dndsu-recon.md`         |
| 2     | T003-T006 | Scraper infra: fetch + cache + parser  | `scripts/scrape_dndsu.py`        |
| 3     | T007-T010 | Classification rules + edge case handling | `dndsu_items.json` (committed) |
| 4     | T011-T013 | Codegen TS seed                        | `lib/seeds/items-dndsu.ts`       |
| 5     | T014-T017 | Codegen migrations 056+                | `supabase/migrations/056_*.sql…` |
| 6     | T018-T020 | Apply migrations + backfill verify     | mat-ucheniya populated           |
| 7     | T021-T023 | UI wire-up: dndsu_url field + link     | item form + permalink updated    |
| 8     | T024-T025 | Smoke + chatlog + commit               | spec-018 closed out              |

Each phase ends with `[x]` mark on tasks + commit. Phase 1-2-3 can
run independently (no app code changes); Phase 6 requires applying
SQL via Supabase Dashboard (DM does this, hand off файлами через
`present_files`).

---

## Test plan summary

- **Scraper unit-tests**: pytest covers parser correctness on 5
  sample HTML pages saved in `scripts/dndsu-cache-fixtures/` (small
  mirror — these ones DO get committed). Cases: ring (rare,
  attuned), wondrous (no attune), weapon-+1 (rare, weapon
  category), legendary artifact, edge case with missing price.
- **Codegen sanity**: TS test (`vitest`) reading the generated
  `items-dndsu.ts`, asserting:
  - All entries have `srdSlug` populated.
  - No duplicate `srdSlug` across `items-srd.ts` + `items-dndsu.ts`.
  - All `category` / `rarity` / `slot` values are within enum.
- **Migration smoke**: SQL script `scripts/check-rls-018.sql`
  (8 cases, BEGIN…ROLLBACK pattern matching 013-014-015): RLS,
  CASCADE, idempotency on re-apply, backfill rule fires.
- **Manual visual check**: 20 random items compared to dnd.su
  (SC-002).

Vitest target: ≥ existing pass rate. No new failing tests.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| dnd.su rate-limits / bans | low-med | 1 req/s, identifying UA, expone backoff. Manual fallback: download HTML via browser into cache folder. |
| Parser fails on unknown HTML pattern | med | Defensive parser: log warnings, skip item, continue. Final report shows skipped count. |
| Slot inference wrong for ~10% | med | Visual review post-scrape; manual override list in scraper config. |
| Volume estimate wrong (5000+ items) | low | Codegen scales linearly. If a single migration exceeds Supabase 5MB SQL limit, codegen splits per-book by alphabetical ranges. |
| dnd.su HTML structure changes mid-scrape | very low | Cache + idempotent re-run handle this fine. |
| Description text contains HTML entities | high | BeautifulSoup `.get_text()` handles automatically; one verify pass. |
| Edition mixing (5e14 vs 5e24) | med | Hard gate in parser: skip pages with only `XX24` badges. |
| 274-item baseline conflict | low | Skip-by-srd-slug rule (FR-009); codegen logs skipped count. |
| Russian transliteration drift | low | Не делаем — slug всегда из URL, не из title. |

---

## Open decisions deferred to `tasks.md`

1. **Discovery strategy concrete** — A/B/C choice happens after T001
   spike.
2. **Slot mapping edge cases** — full table compiled empirically
   during T007 from actual scraped data.
3. **Source-book code list** — same; T009 produces final mapping
   from observed badges.
4. **Whether to commit `dndsu_items.json` to repo** — leaning yes
   (it's the snapshot the migrations were generated from; reproducible
   builds), but ~5-10 MB. Final call in T013.
5. **Sample fixture HTMLs for tests** — choose 5 in T002, save in
   `scripts/dndsu-cache-fixtures/`.

---

## Out of scope (reaffirmed)

Mirror'ит spec.md `## Out of scope`. Здесь дополнительно:

- **Не пишем тесты для UI правок.** Они тривиальные — additive
  string field + ссылка. Существующие e2e / integration не нужны
  для Phase A.
- **Не пишем pure-helper'ов в `lib/`.** Спека на 95% data-import,
  бизнес-логики на стороне приложения почти нет (только тривиальное
  hydration `dndsu_url` через `getItemById`).

---

## Done criteria

- [ ] `scripts/scrape_dndsu.py` запускается, эмиттит
      `scripts/dndsu_items.json` с ≥ 1000 items.
- [ ] `scripts/items-dndsu-codegen.ts` запускается, эмиттит
      `lib/seeds/items-dndsu.ts` + N миграций 056+.
- [ ] Все миграции применены к mat-ucheniya без ошибок.
- [ ] `/c/mat-ucheniya/items?category=magic-item` показывает
      ≥ 1000 items с корректными rarity / attunement / slot.
- [ ] 20 случайных items проверены visually против dnd.su.
- [ ] `npm run lint` clean, `npm run build` clean,
      `npm run vitest` ≥ existing pass rate.
- [ ] `chatlog/2026-04-XX-chat75-spec018-*.md` создан.
- [ ] FR-012 amendment applied to spec.md.
- [ ] PR merged, version bump to 0.7.0.
