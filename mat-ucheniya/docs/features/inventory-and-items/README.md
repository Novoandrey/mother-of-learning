# Инвентарь и предметы

> Каталог предметов кампании: Образцы с атрибутами, инвентарь PC и общака,
> фильтры и группировка через URL. Спека 015.

---

## Образец (ItemNode)

Каждый предмет в системе — нода с `node_type='item'` плюс строка в таблице
`item_attributes` (миграция `043_item_catalog.sql`). Это **Образец** —
платонический шаблон, не конкретный экземпляр. У Образца нет количества и
нет владельца; транзакции ссылаются на него через `item_node_id` FK.

Горячие поля (`item_attributes`) — типизированные колонки для фильтрации и
группировки:

| Поле | Тип | Примечание |
|---|---|---|
| `category_slug` | `text` | `scope='item'` из `categories` |
| `rarity` | `text enum` | `common / uncommon / rare / very-rare / legendary / artifact`; null для немагических |
| `price_gp` | `numeric(12,2)` | null = нет цены |
| `weight_lb` | `numeric(8,2)` | null = нет веса |
| `slot_slug` | `text` | `scope='item-slot'` из `categories`; null = слот не занимает |
| `source_slug` | `text` | `scope='item-source'` |
| `availability_slug` | `text` | `scope='item-source'` |
| `use_default_price` | `boolean` | управляется автоматически; подробно в [`pricing.md`](pricing.md) |
| `requires_attunement` | `boolean` | добавлена миграцией 055 |

Холодные поля живут в `nodes.fields` JSONB: `srd_slug`, `description`,
`source_detail`, `dndsu_url`.

Каталог mat-ucheniya содержит **1118 предметов**: ≈274 hand-curated SRD
(`lib/seeds/items-srd.ts`) + 844 из dnd.su (миграции 056–105). Как они
импортировались — в [`technical.md`](technical.md).

---

## Каталог: страница `/items/`

Роут `app/c/[slug]/items/page.tsx`. Server-компонент: парсит фильтры из
`searchParams` через `parseItemFiltersFromSearchParams()` из
`lib/items-filters.ts`, делает `getCatalogItems(campaign.id, filters)`,
рендерит `<ItemFilterBar>` + `<ItemCatalogGrid>`.

Все четыре списка значений (категории, слоты, источники, доступность)
загружаются параллельно через `Promise.all`.

Фильтры в URL: `?q=…&category=…&rarity=…&slot=…&source=…&availability=…&priceBand=…`.
URL — единственный источник истины; React-state в `<ItemCatalogGrid>` управляет
только client-side group-by и sort (не требуют рефетча).

### Группировка и сортировка

`lib/items-grouping.ts` реализует `groupItems(items, groupBy)` и
`sortItems(items, key, dir)`. Оси группировки:

| `groupBy` | По чему |
|---|---|
| `category` | `category_slug` |
| `rarity` | `rarity` |
| `slot` | `slot_slug` |
| `priceBand` | `priceBandFor(priceGp)` — free / cheap / mid / expensive / priceless |
| `source` | `source_slug` |
| `availability` | `availability_slug` |

Группировка — клиентская (UI re-fold), смена оси не перезапрашивает сервер.
Сортировка: `name / price / weight / rarity`.

---

## Item permalink

Страница `/items/[id]` — детальная карточка Образца: атрибуты, описание,
история транзакций, где предмет сейчас. FK `item_node_id` в `transactions`
позволяет собрать все вхождения предмета одним запросом по `item_node_id`.

---

## Инвентарь PC и общака

`<InventoryTab>` (`components/inventory-tab.tsx`) — общий компонент для PC
и общака; разница только в `actorNodeId`. Монтируется как `?tab=inventory`
на странице персонажа и как «Предметы» на странице общака.

URL-параметры вкладки:
- `loop` — выбранная петля (по умолчанию текущая).
- `day` — день внутри петли (по умолчанию 30 — конец петли).
- `group` — ось группировки (`category / rarity / slot / priceBand / source / availability`).

Срез `(loop, day)` — прозрачный UI-контроль: клиент видит чип «Срез: петля N · день M»
и понимает, на какой момент смотрит. Функция `getInventoryAt(actorNodeId, loop, day)`
из `lib/inventory.ts` возвращает агрегированные `InventoryRow[]`.

---

## Связь с транзакциями через `item_node_id`

Транзакция с `item_node_id IS NOT NULL` ссылается на Образец — UI показывает
живое название из каталога. Транзакция с `item_node_id IS NULL` — старый
free-text путь через `item_name`. CHECK-констрейнт
`transactions_item_node_id_kind_match` (миграция 043) запрещает
`item_node_id IS NOT NULL` при `kind ≠ 'item'`.

---

> Ценообразование по умолчанию — в [`pricing.md`](pricing.md).
> Импорт-пайплайн — в [`technical.md`](technical.md).
> Общак как актор инвентаря — в [`../stash-and-skladchina/README.md`](../stash-and-skladchina/README.md).
