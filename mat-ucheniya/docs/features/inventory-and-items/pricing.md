# Цены предметов

> Заглушка. Содержание будет наполняться постепенно.

Подфича: дефолтные цены задаются на уровне кампании (matrix rarity × magic/consumable + mundane SRD baselines). Bulk apply проставляет default-цены всем подходящим предметам. Per-item override отмечается флагом `use_default_price=false` (auto-managed: сравнение payload с дефолтом). Колонка «Цр» в каталоге отмечает предметы с ручной ценой.

## Что планируется в статье

- Структура `campaigns.settings.item_default_prices`
- Bulk apply: что обходит и что перезаписывает
- Auto-managed flag: как считается на сервере
- Per-location pricing axis (на горизонте, отдельный layer)
