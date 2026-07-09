# Plan: Крафт (spec-056)

Ветка `claude/spec-056-crafting` (от `origin/main`). Реализует spec.md v2
(канон Andrey 2026-07-09). Формат и метод — как 055 (агенты по слоям +
интеграция + сверка денег).

## Модель данных — решения

- **`craft_runs`** — выделенная таблица (прецедент `expedition_runs`, 124):
  ```
  id uuid pk · campaign_id → campaigns · schema_item_node_id uuid → nodes (set null)
  loop_number int · day_in_loop int · start_minute int null
  participants jsonb '[]'    -- [{nodeId, hours}] — часы per-крафтер (не uuid[]!)
  invested_gp numeric(12,2)  -- рабочая цена, списанная с общака
  output_item_node_id uuid → nodes (set null) · output_item_name text
  recipient_node_id uuid → nodes (set null)   -- null = общак
  created_by uuid · created_at
  ```
  RLS как 124: select/insert — члены; правки — модель доверия (append-only v1).
- **Категория «Схема»**: `scope='item', slug='schema', label='Схема'` — сид
  миграцией per-campaign (паттерн 125) **И** в `DEFAULT_ITEM_CATEGORIES`
  (`lib/seeds/item-value-lists.ts`). Заодно закрыть найденный скаутом
  рассинхрон: добавить туда же отсутствующий `resource`.
- **Связь схема → изделие**: nullable-колонка `item_attributes.schema_for_node_id
  uuid → nodes(id) on delete set null` (прецедент `transactions.item_node_id`;
  edges дороже — отдельный edge_type + join). `hydrate()` в `lib/items.ts`
  добавляет поле.
- **Кастомная схема** (вплетённые и др.): rarity CHECK каталога не знает
  'custom' → кастомная схема хранит `rarity NULL` + свою крафт-цену в
  `nodes.fields.craft_cost_gp` (override). Резолв цены крафта:
  (1) override на схеме → (2) `craft_settings.rarity[rarity целевого предмета]`
  → (3) `craft_settings.custom` при rarity NULL без override.
- **`party_level`** — `nodes.fields` петли (прецедент `length_days`).
  Парсер `lib/party-level.ts` (null = не задан → крафт отказывает).
- **`craft_settings`** — блок `campaigns.settings` (паттерн
  `item_purchase_policy`): `lib/craft-settings.ts` — типы + дефолты таблиц
  Andrey + parse + чистые хелперы. **Ни одного числа в бизнес-логике.**

## Деньги (канон runExpedition, сверка — интегратор)

- Вложения: money-строка `kind='money'`, actor = нода общака,
  `category_slug='expense'`, `resolveSpend` + проверка покрытия
  («В общаке недостаточно…»), НЕ писать нулевые money-строки (CHECK 034).
- Изделие: item-строка `kind='item'`, actor = получатель (общак ИЛИ PC),
  `category_slug='loot'`, `item_node_id` + `item_name`, qty=1.
- Всё одним batch-insert, общий `transfer_group_id`, `status='approved'`,
  корректный `loop_number` (иначе мастер-сообщение не увидит).
- Разбор (`disassembleItem`): item-строка −1 (actor = где лежит предмет,
  v1 — общак), категория 'expense'-нет — kind='item' списание; события ленты.

## Событие ленты `'craft'` (+ мины скаутов)

- `ledger-format.ts`: член union + case в `formatLedgerEvent` (TS сам заставит).
- `ledger-feed.ts`: (а) craft → null-ветка `actorPcId` (строки 33-37); (б)
  **строка 40** — тернарник `participantPcIds` расширить на craft, иначе имена
  крафтеров тихо потеряются (мина, найдена скаутом).
- Мастер-сообщение НЕ трогаем: transactions-driven, изделие в общаке подхватит
  само. Изделие-в-PC видно только в ленте — принято (модель доверия).
- Формат: `🛠 <b>Крафт</b>` · Петля/День · с HH:MM · крафтеры с часами · изделие
  (→ получатель) · −вложено зм.

## Гейты runCraft (порядок)

1. Членство кампании (`getMembership`) — любой член (как вылазки).
2. `party_level` петли задан (иначе «Задайте уровень партии в петле»).
3. `minPartyLevel` редкости ≤ уровень партии.
4. `Σ(hours_i) × rateForPb(pb)` ≥ рабочая цена (клиент присылает часы).
5. День 1..30 + старт-минута валидны (переиспользовать календарь 055 —
   мягко: старт в окне; длительность НЕ гейтим окном, мультидень ок).
6. Покрытие общака деньгами.

## Слои и владельцы

- **W0 (интегратор, ГОТОВО)**: `lib/party-level.ts`, `lib/craft-settings.ts`
  + тесты (10 зелёных: таблицы, время-деривация, датапоинты вплетения).
- **A (агент, данные)**: миграция 127 (craft_runs + категория schema +
  `schema_for_node_id`) · сидер (schema + resource) · `lib/items.ts` hydrate ·
  `lib/queries/craft-tg.ts` (список схем + прогонов) · `app/actions/craft.ts`
  (`runCraft`, `disassembleItem`, `createSchemaItem` find-or-create по образцу
  `createResourceItem`) · событие 'craft' (format+feed+тест) · тесты.
  НЕ трогает: lib/campaign.ts, app/c/**, components/**, app/tg/**.
- **C (агент, десктоп, ∥ A)**: `party_level` в UI петли (fields, прецедент
  length_days) · `lib/campaign.ts` (parseCampaignSettings + тип) ·
  `updateCraftSettings` в `app/c/[slug]/settings/actions.ts` ·
  `components/craft-settings-editor.tsx` (шаблон item-purchase-policy-editor,
  debounce 400) · секция на `app/c/[slug]/items/settings/page.tsx`.
  НЕ трогает: migrations, lib/queries, app/actions/craft.ts, lib/telegram, app/tg.
- **D (агент, /tg UI, после A)**: экран «Крафт» в `ledger-app.tsx` (меню схем
  как меню вылазок) · CraftRunSheet (схема → крафтеры-пикер R2 + часы per-PC
  (дефолт поровну) + день/старт + получатель (общак/PC) + превью цены/часов) ·
  разбор предмета · Sheet-паттерн R2 (скролл, «← Назад», мобила).
- **Интегратор**: сверка денежных форм, миграция 127 на прод (rw-MCP),
  полный гейт, PR.

## Развилки — дефолты v1 (хвосты спеки, ДМ поправит содержимым)

- Крафт-цена самой схемы = workCost ЕЁ редкости (редкость предмета + 1).
- Разбор мгновенный, предмет списывается с общака.
- «3 шт» фонаря — контент (3 экземпляра схемы у НПЦ), не код.
- Wall-clock = max(hours_i); в run пишем duration производной (не гейтим).
- UI настроек крафта — на items/settings (рядом с ценами).

## Out of scope (v1)

Пауза/прогресс крафта (акт одношаговый, как вылазка) · перенос изделия между
петлями · автоучёт занятости PC (семя 057) · UI-редактор вплетений с
автоценой на десктопе (кастомная схема заводится с ценой) · batch-крафт.
