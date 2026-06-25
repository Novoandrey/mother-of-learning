# Цены предметов

> Система дефолтных цен: матрица rarity × bucket, bulk apply, auto-managed
> флаг `use_default_price`. Спека 016.

---

## Структура дефолтных цен

Дефолты хранятся в `campaigns.settings.item_default_prices` как JSONB
следующей формы:

```json
{
  "magic": {
    "common": 100,
    "uncommon": 500,
    "rare": 5000,
    "very-rare": 50000,
    "legendary": null
  },
  "consumable": {
    "common": 50,
    ...
  }
}
```

Два bucket'а: `magic` (все магические предметы кроме расходников) и
`consumable` (категория `consumable`). Ось — rarity от `common` до
`legendary`; `artifact` в матрицу не входит. Значение `null` в ячейке
означает «DM ещё не задал стандарт для этой редкости».

Типы: `ItemDefaultPrices`, `RarityPriceMap` из `lib/item-default-prices.ts`.
Парсер `parseItemDefaultPrices()` защищает от невалидных JSONB (float, null
на целой структуре) с safe fallback.

---

## Флаг `use_default_price`

Колонка `item_attributes.use_default_price` (миграция
`048_item_use_default_price.sql`, default `true`):

- **`true`** — Образец участвует в bulk apply; его цена будет переписана
  из матрицы.
- **`false`** — DM opt-out, цена защищена от перезаписи на любом
  последующем «Применить ко всем».

**Auto-managed**: флаг вычисляется автоматически при создании или
обновлении предмета на сервере — сравнивается текущая `price_gp` с
дефолтом для `(bucket, rarity)`. Совпадает → `true`; отличается → `false`.
Ручного чекбокса «не использовать стандарт» больше нет (убран миграцией 055).

Колонка «Цр» в каталоге отмечает предметы с `use_default_price = false` —
визуальный сигнал «цена вручную».

---

## Bulk apply

Кнопка «Применить ко всем» на странице настроек цен вызывает server action,
который:

1. Загружает все Образцы кампании.
2. Вычисляет план через `computeApplyPlan(items, defaults)` из
   `lib/apply-default-prices.ts`.
3. Пишет только `updates` — предметы, у которых цена реально изменится.

**Skip-условия** (предмет пропускается):

| Условие | Причина |
|---|---|
| `use_default_price = false` | DM opt-out |
| `rarity ∈ {null, 'artifact'}` | вне диапазона матрицы |
| `defaults[bucket][rarity] = null` | стандарт для ячейки не задан |
| `cell === current price` | уже верная цена, no-op |

`computeApplyPlan()` возвращает `ApplyPlan` с разбивкой: `updates`,
`skippedByFlag`, `skippedByRarity`, `skippedByMissingCell`, `unchanged` —
toast на UI показывает сводку.

---

## Attunement и backfill (миграция 055)

Та же миграция (`055_attunement_and_price_autoflag.sql`) сделала три вещи:

1. Добавила `requires_attunement boolean not null default false` на
   `item_attributes`.
2. Backfill: `requires_attunement = true` для предметов, у которых
   `description` содержит «Требует настройки» — 17 предметов в mat-ucheniya.
3. Backfill `use_default_price`: для magic/consumable bucket — сравнение
   с матрицей из `campaigns.settings`; для mundane (rarity IS NULL,
   не consumable, есть `srd_slug`) — сравнение с 210 PHB baseline-кортежами,
   зашитыми в тело миграции.

После этой миграции TS-сторона также перешла на автовычисление флага:
item form больше не показывает чекбокс «Не использовать стандарт».

---

> Общий обзор каталога — в [`README.md`](README.md).
> Импортный пайплайн (SRD/dnd.su) — в [`technical.md`](technical.md).
