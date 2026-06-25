# Каталог предметов — под капотом

> Трёхслойный пайплайн импорта (Python → JSON → TS codegen → SQL),
> SRD-seed как источник истины по slug-конфликтам, детали схемы `item_attributes`.
> Для разработчиков.

---

## Схема `item_attributes`

Таблица `item_attributes` (миграция `043_item_catalog.sql`) — side table к
`nodes` с PK на `node_id`, FK → `nodes(id) ON DELETE CASCADE`. Индексы на
`(category_slug)`, `(rarity)`, `(slot_slug)` и `(source_slug)` покрывают
горячие пути фильтрации и группировки каталога.

Новая колонка `transactions.item_node_id` из той же миграции — nullable FK
(`ON DELETE SET NULL`). CHECK `transactions_item_node_id_kind_match` запрещает
ненулевое значение при `kind ≠ 'item'`.

Категории (`categories`) расширились с двух `scope`-ов до пяти: добавлены
`item-slot`, `item-source`, `item-availability` для списков значений каталога.

---

## Hand-curated SRD seed

`lib/seeds/items-srd.ts` — вручную собранный список ~274 записей. Критерий
выбора — предметы, которые реально встречаются в транзакциях mat-ucheniya:
оружие, броня, снаряжение, базовые расходники, несколько низкоуровневых
магических предметов.

Каждый `ItemSeedEntry` содержит `srdSlug` (стабильный kebab-case
идентификатор) и `priceGp` (цена из PHB в золотых). Это одно ключевое
отличие от dnd.su: SRD seed **имеет конкретные цены**, dnd.su даёт только
диапазоны текстом (`"101–500 зм"`) → `priceGp = null` в dnd.su items.

**SRD выигрывает при конфликте slug**: если `srdSlug` из dnd.su совпадает
с записью в `ITEMS_SRD_SEED` — codegen дропает dnd.su запись, SRD-запись
остаётся источником истины.

Миграция `044_srd_items_seed.sql` применяет seed ON CONFLICT DO NOTHING на
`(campaign_id, fields->>'srd_slug')`. Backfill `transactions.item_node_id`
при первом примении (FR-029): сопоставление по
`LOWER(TRIM(item_name)) = LOWER(TRIM(title))` или по srd_slug.

---

## Трёхслойный пайплайн импорта dnd.su

### Слой 1: Python scraper

`scripts/scrape_dndsu.py` — CLI скрипт:

1. `discover_urls()` — один запрос к `https://dnd.su/piece/items/index-list/`,
   парсит ~934 ссылок через BeautifulSoup.
2. Для каждой ссылки `fetch_or_cached(url)`:
   - Проверяет SHA1-кэш в `scripts/dndsu-cache/`.
   - При miss: `requests.get` → strip nav/aside/footer → `html2text` → сохранить.
   - Rate limit 1 с между запросами, retry с backoff `(1, 2, 4, 8)`.
3. `parse_item(markdown, url)` — чистая функция (unit-testable без сети).
   Возвращает:
   - `[]` для предметов не 5e14 редакции.
   - `[record]` для обычных предметов.
   - `[r1, r2, r3]` для **umbrella items** — предметов с «редкость варьируется».
     Каждый tier (+1/+2/+3 или common/uncommon/rare) разворачивается в
     отдельную запись с суффиксом slug `dndsu-sword-plus-1`, `dndsu-sword-plus-2`.

Output: `scripts/dndsu_items.json` (~844 записи после парсинга).

### Слой 2: TS codegen

`scripts/items-dndsu-codegen.ts` — читает `dndsu_items.json`, дедупает против
`ITEMS_SRD_SEED` по `srdSlug`, выдаёт один из двух артефактов:

- **Default**: `lib/seeds/items-dndsu.ts` с `ITEMS_DNDSU_SEED: ReadonlyArray<ItemSeedEntry>`.
- **`--emit-migrations`**: по одному SQL-файлу на книгу-источник (DMG, XGE, TCE…),
  начиная с номера 056. Каждая миграция — идемпотентный `INSERT … ON CONFLICT DO NOTHING`.

Запуск:
```
npx tsx scripts/items-dndsu-codegen.ts
npx tsx scripts/items-dndsu-codegen.ts --emit-migrations
```

### Слой 3: SQL миграции 056–105

50 миграций вида `056_dndsu_DMG_items.sql`, `057_dndsu_XGE_items.sql` и т.д.
По одной на книгу-источник. Итого 844 записи из dnd.su в каталоге.

Идемпотентный guard:
```sql
WHERE NOT EXISTS (
  SELECT 1 FROM nodes
  WHERE fields->>'srd_slug' = $slug
    AND campaign_id = $campaign_id
)
```

**`source_detail`** в `nodes.fields` содержит полное название книги
(«Xanathar's Guide to Everything»), `source_slug` на `item_attributes` —
короткий slug (`dndsu`). **`dndsu_url`** в `nodes.fields` — permalink на страницу.

---

## Pagination workaround

Supabase PostgREST обрезает результат на 1000 строк по умолчанию, плюс
исторически встречался cap на 10k. В `lib/items.ts` `getCatalogItems()`
использует `embed !inner join`-ы (`item_attributes!inner(…)`) вместо
двухступенчатых `IN`-queries — это и быстрее, и не натыкается на
select-in-в-select pagination ограничения. Для очень больших каталогов
можно будет добавить `range()`-pagination, но на 1118 предметах запрос
укладывается в лимит.

---

## `scripts/dedupe-srd.ts`

Утилита для dry-run/apply дедупликации condition/effect нод, которые
могли задвоиться из-за смены idempotency key с `title` на `name_en`.
Работает только на `node_type ∈ {condition, effect}` — к item-каталогу
отношения не имеет.

---

> Обзор каталога — в [`README.md`](README.md).
> Ценообразование и `use_default_price` — в [`pricing.md`](pricing.md).
> Node-graph как основа всех нод — в [`../../concepts/node-graph.md`](../../concepts/node-graph.md).
