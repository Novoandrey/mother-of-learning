# Tasks: Крафт (spec-056)

Владельцы: I = интегратор (Claude main), A/C/D = агенты-исполнители.

- [x] **T0 (I)** Фундамент чисел: `lib/party-level.ts` + `lib/craft-settings.ts`
      + тесты (10 ✓). Все значения — настройки с дефолтами (AGENTS.md-правило).
- [ ] **T1 (A)** Миграция `127_craft.sql`: `craft_runs` + RLS/индексы ·
      категория `schema` (сид per-campaign, паттерн 125) ·
      `item_attributes.schema_for_node_id` (nullable FK). Идемпотентно, verify.
- [ ] **T2 (A)** Сидер `lib/seeds/item-value-lists.ts`: + `schema`, + `resource`
      (закрыть рассинхрон 125).
- [ ] **T3 (A)** `lib/items.ts`: hydrate + `schemaForNodeId`; тип в items-types.
- [ ] **T4 (A)** `lib/queries/craft-tg.ts`: `listSchemas` (предметы категории
      schema + цель + резолв цены крафта), `listCraftRuns`.
- [ ] **T5 (A)** `app/actions/craft.ts`: `createSchemaItem` (find-or-create,
      образец createResourceItem) · `disassembleItem` (−1 с общака, событие) ·
      `runCraft` (гейты по plan.md → строки транзакций по канону → craft_runs
      → событие 'craft'). Юнит-тесты чистой логики.
- [ ] **T6 (A)** Лента: union + case 'craft' в `ledger-format.ts` ·
      `ledger-feed.ts` null-actorPcId ветка + **тернарник строки 40** ·
      pure-тест формата (образец ledger-expedition-format.test.ts).
- [ ] **T7 (C)** `party_level` на петле: UI create/edit петли (fields,
      прецедент length_days), показывать БМ рядом (pbForLevel).
- [ ] **T8 (C)** `lib/campaign.ts`: `craft_settings` в CampaignSettings +
      parseCampaignSettings.
- [ ] **T9 (C)** `updateCraftSettings` (settings/actions.ts, шаблон
      updateItemPurchasePolicy) + `components/craft-settings-editor.tsx` +
      секция «Крафт» на `items/settings/page.tsx`.
- [ ] **T10 (D)** /tg экран «Крафт»: меню схем (образец ExpeditionsScreen) +
      кнопка входа.
- [ ] **T11 (D)** CraftRunSheet: схема → пикер крафтеров (R2) + часы per-PC
      (дефолт поровну, редактируемо) + день/старт + получатель (общак/PC) +
      превью «цена X зм · надо Y ч» + сабмит runCraft.
- [ ] **T12 (D)** Разбор предмета в /tg (выбор предмета общака → подтверждение
      → disassembleItem) + вход в крафт схемы.
- [ ] **T13 (I)** Интеграция: сверка денежных строк с createTransaction-каноном,
      полный typecheck + vitest + eslint.
- [ ] **T14 (I)** Миграция 127 на прод (rw-MCP) + verify.
- [ ] **T15 (I)** PR в main (Andrey мержит и тестит).

Хвосты спеки (№1–7) — не блокеры, дефолты в plan.md §Развилки.
