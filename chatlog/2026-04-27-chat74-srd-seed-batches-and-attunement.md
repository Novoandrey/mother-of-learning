# Chat 74 — SRD seed batches 049-054 + attunement + auto-managed price flag, 2026-04-27

## Контекст (откуда пришли)

Chat 73 (spec-016) закрылся: миграции 047+048 применены на пред-чат-границе,
spec-016 + spec-017 в проде. Юзер запросил расширение SRD-каталога —
закрыть все mundane категории D&D 5e PHB+XGE, плюс несколько
supplements (DMG/VRGR/IMR/JRC/EGW/RLW). И в конце — отдельная просьба
пометить attunement-предметы галочкой в каталоге.

## Что сделано

### Migrations 049–054 (224 новых SRD items)

Все следуют pattern из mig 044/046: per-campaign DO loop, NOT EXISTS
guard на (campaign_id, srd_slug), Phase 2 backfill `transactions.
item_node_id` по name/slug match. Идемпотентны.

- **049** Яды: 19 шт. (DMG/VRGR/IMR/JRC) — simple/contact/inhaled/injury.
  14 priced + 5 priceless (quest-only). Skip «Противоядие» = существующий
  `antitoxin-vial`.
- **050** Drugs/substances: 11 шт. (DMG/EGW/RLW/JRC).
- **051** Weapons-extended: 30 шт. (5 simple melee, 3 simple ranged, 12
  martial melee, 2 martial ranged, 3 Renaissance firearms, 5 Modern
  firearms — Modern с `priceGp=null`).
- **052** Armors-extended: 5 PHB armors (padded, hide, breastplate,
  ring-mail, splint) + conditional rename `studded-leather` «Клёпаный
  кожаный доспех» → «Проклёпанный кожаный доспех».
- **053** Tools-extended: 36 шт. (5 standalone kits, 4 gaming sets,
  10 musical instruments, 17 artisan tools).
- **054** Equipment: 82 PHB items (70 standalone gear + 5 arcane foci
  + 3 holy symbols + 4 druidic foci) + conditional rename `whetstone`
  «Точило» → «Точильный камень». Skip 17 dups уже-в-сиде (alchemists-
  fire, rope-hempen-50ft, potion-of-healing, mirror-steel, acid-vial,
  healers-kit, oil-flask, tent-two-person, antitoxin-vial=Противоядие,
  backpack, holy-water-flask, bedroll=Спальник, mess-kit=Столовый
  набор, whetstone, torch, lantern-hooded, poison-basic-vial).

Итого `lib/seeds/items-srd.ts`: 274 предмета (50 base + 41 ext +
19 ядов + 11 веществ + 30 weapons + 5 armors + 36 tools + 82 gear).

### Migration 055 — attunement + auto-managed use_default_price

Маленький follow-up к spec-016 (без отдельной спеки — vibe-coding для
small UX win). Пользователь сначала спутал колонку «Н» (от spec-016
= price-override) с «Настройка/attunement» — пришли к решению:
переименовать существующую «Н» → «Цр», добавить новую «Н» под
attunement, плюс флаг прайс-оверрайда сделать auto.

**Phase 1:** schema. `item_attributes.requires_attunement boolean
not null default false`.

**Phase 2:** бэкфилл `requires_attunement = true` для items с
«Требует настройки» в `nodes.fields->>'description'`. 17 items.

**Phase 3a:** бэкфилл `use_default_price` для magic+consumable bucket
(rarity ∈ common..legendary). Сравнение текущего `price_gp` vs
`campaigns.settings->'item_default_prices'[bucket][rarity]` JSONB.
Совпадает → flag=true; отличается → flag=false. Items без cell в
defaults не трогаются.

**Phase 3b:** бэкфилл `use_default_price` для mundane (rarity=null,
non-consumable, с srd_slug). Сравнение vs embedded PHB seed
baselines (210 tuples в CTE). Эта логика покрывает кейс пользователя:
он руками сменил цены латов и полулат, флаг должен встать.

Bug fix в процессе: `c_rec.item_default_prices` → `(settings->
'item_default_prices') as item_default_prices` (defaults лежат в
JSONB sub-key `campaigns.settings`, не top-level колонкой).

### TS / UI changes

- `lib/seeds/items-srd.ts`: тип `ItemSeedEntry.requiresAttunement?:
  boolean`; 17 entries помечены.
- `lib/items-types.ts`: `ItemNode.requiresAttunement: boolean`.
  `ItemPayload`: drop `useDefaultPrice` (auto-computed server-side),
  add `requiresAttunement: boolean`.
- `lib/items.ts`: `requires_attunement` в `ItemAttrsRow`, во всех 3
  SELECT-строках, в `hydrate`.
- `app/actions/items.ts`: helper `computeUseDefaultPrice(payload,
  defaults)` зеркалит SQL phase 3a/3b. Импорт `ITEMS_SRD_SEED` →
  `SEED_BASELINE_BY_SLUG` Map. `loadDefaultPrices` грузит
  `campaigns.settings->item_default_prices`. Create/update
  пере-вычисляют флаг и пробрасывают `requires_attunement` из
  payload.
- `components/item-form-page.tsx`: убран state + чекбокс «Не
  использовать стандартную цену»; добавлен `requiresAttunement`
  state + чекбокс «Требует настройки» под полем Слот.
  `handleRarityChange` / `handleCategoryChange` теперь всегда
  делают autofill (без gate на flag).
- `components/item-catalog-grid.tsx`: колонка «Н» → «Цр»
  (price-customized indicator, emerald ✓); новая колонка «Н»
  справа (attunement, purple ✓). `colgroup`: 9 → 10 col, ширины
  пересчитаны (22+12+10+10+9+7+10+10+5+5). `colSpan` description-
  expand row 9 → 10.
- `app/c/[slug]/items/[id]/edit/page.tsx`: initial без
  `useDefaultPrice`, с `requiresAttunement`.

### Future per-location pricing — note for future spec

Пользователь упомянул что в будущем планирует per-city / black-
market цены. Решили: это отдельный layer поверх base price
(новая таблица типа `item_location_prices(item_id, location_node_id,
price_gp, availability)`). С `use_default_price` не пересекается —
тот остаётся про base price vs campaign-default. Таким образом
сегодняшний дизайн не противоречит будущему расширению. В backlog
не пихал — заведём когда дойдём до spec-022/023 (DM session
control + movement timeline).

## Миграции

- `049_srd_items_seed_poisons.sql` — 19 ядов
- `050_srd_items_seed_drugs_substances.sql` — 11 веществ
- `051_srd_items_seed_weapons_extended.sql` — 30 оружий
- `052_srd_items_seed_armor_extended.sql` — 5 armors + 1 rename
- `053_srd_items_seed_tools_extended.sql` — 36 tools
- `054_srd_items_seed_equipment.sql` — 82 gear + 1 rename
- `055_attunement_and_price_autoflag.sql` — `requires_attunement`
  column + 3-phase backfill (attunement, magic-bucket flag,
  mundane-bucket flag)

## Коммиты

- `41788f7` `Items: 049-054 SRD seed batches + 055 attunement +
  auto-managed price flag` — single big commit (sed batches +
  attunement feature вместе; 14 files, +1996/-68).

## Действия пользователю (после чата)

- [x] Применил миграции 049–055
- [x] Smoke: каталог рендерит «Цр» + «Н», 17 attunement помечены,
  латы/полулаты в «Цр»
- [ ] (опционально) lint / type-check / next build локально —
  у меня в container'е npm не было

## Что помнить следующему чату

- `package.json` version 0.5.1 → 0.6.0 (bump за +224 предмета и
  attunement feature).
- Spec-018 «Карта мира» — следующий по плану, фундаментальная,
  ~5–7 дней. spec.md ещё не написан, начинать с Specify фазы.
- При выполнении spec-018 проверить что catalog page нормально
  работает с 274 items — если grouping начнёт тормозить, может
  понадобиться pagination (сейчас не нужно).
- В chatlog/2026-04-26-chat73 упомянут потенциал перевода
  `applyItemDefaultPrices` в RPC если каталог >500 items —
  актуальность снижается потому что флаг теперь auto, и DM
  редко жмёт «применить».
- Per-location pricing axis — не пересекается с use_default_price.
  При spec-022/023 заводить отдельную таблицу.
