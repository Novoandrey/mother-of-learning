# Tasks: Крафт (spec-056)

Владельцы: I = интегратор (Claude main), A/C/D = агенты-исполнители.

- [x] **T0 (I)** Фундамент чисел: `lib/party-level.ts` + `lib/craft-settings.ts`
      + тесты (10 ✓). Все значения — настройки с дефолтами (AGENTS.md-правило).
- [x] **T1 (A)** Миграция `127_craft.sql` (`b7998b1`): `craft_runs` + RLS/индексы ·
      категория `schema` · `item_attributes.schema_for_node_id`. Идемпотентно, verify.
- [x] **T2 (A)** Сидер: + `schema`, + `resource` (рассинхрон 125 закрыт).
- [x] **T3 (A)** `lib/items.ts` + items-types: `schemaForNodeId` (hydrate + 3 select-списка).
- [x] **T4 (A)** `lib/queries/craft-tg.ts`: `listSchemas`, `listCraftRuns`
      (+ D дописал: `getCraftSettingsTg`, `getCurrentPartyLevelTg`,
      `listDisassemblableStashItemsTg`).
- [x] **T5 (A)** `app/actions/craft.ts`: `createSchemaItem` · `disassembleItem`
      (категория 'other' — обосновано в шапке) · `runCraft` (гейты по plan.md,
      деньги по канону runExpedition). `lib/craft.ts` + тесты.
- [x] **T6 (A)** Лента 'craft' (union+case, mode 'craft'|'disassemble') ·
      обе мины + третья (recipientPcId-тернарник) · pure-тест 7 кейсов.
- [x] **T7 (C)** `party_level` на петле (`f47d4e5`): EXTRA_TYPE_FIELDS в
      node-form + живой хинт «БМ +N» + preserve-guard учтён.
- [x] **T8 (C)** `lib/campaign.ts`: `craft_settings` (deep-copy дефолтов).
- [x] **T9 (C)** `updateCraftSettings` + `craft-settings-editor.tsx` (5 секций,
      debounce) + секция «Крафт» на items/settings.
- [x] **T10 (D)** /tg экран «Крафт» (`115faf1`): шапка уровень/БМ/ставка,
      карточки схем с ценой и ~часами, история, кнопки входа в обоих меню.
- [x] **T11 (D)** CraftRunSheet: пикер + часы per-PC (живой дефолт поровну,
      округление до 0.5) + Σ-строка с недостачей + день/старт + получатель
      (общак/PC) + превью = серверная формула (craftCostFor зеркалит runCraft).
- [x] **T12 (D)** Разбор: список общака → подтверждение → disassembleItem →
      форма схемы (префилл, редкость +1, опц. цена) или пропустить.
- [x] **T13 (I)** Интеграция: деньги сверены с каноном (A и D), полный гейт —
      typecheck чисто, vitest 578/578, eslint чисто.
- [x] **T14 (I)** Миграция 127 применена к проду (rw-MCP, verify ✅,
      владелец postgres).
- [ ] **T15 (I)** PR в main (после финального ревью-прохода; Andrey мержит и тестит).

Хвосты спеки (№1–7) — не блокеры, дефолты в plan.md §Развилки.
