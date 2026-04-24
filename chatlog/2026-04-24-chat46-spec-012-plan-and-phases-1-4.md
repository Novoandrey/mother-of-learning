# Chat 46 — spec-012 specify/clarify/plan/tasks + implement Phases 1-4, 2026-04-24

## Контекст (откуда пришли)

Предыдущий чат (45) закрыл BUG-018 encounter role gate и перевёл
spec-011 в прод. Пользователь выбрал следующий приоритет — **spec-012
Starting setup per loop** из `.specify/memory/bookkeeping-roadmap.md`.
Параллельный кандидат spec-016 «Сборы» отложен (там уже есть только
spec.md, остальное в работу не берём сейчас).

## Что сделано

### Spec-kit артефакты

- **spec.md** (1124 строки). Specify → Clarify Round 1 → forward-compat:
  - Переосмыслен scope: не «фича стартового сетапа», а **общий autogen-
    layer** с 4 конкретными wizard'ами (`starting_money`, `starting_loan`,
    `stash_seed`, `starting_items`). Spec-013 encounter loot — ожидаемый
    второй клиент того же слоя.
  - 7 user stories (US1–US7), 23 FR, 6 SC, 12 Assumptions, расширенный
    Out of Scope.
  - Clarify Round 1 — 3 вопроса решены:
    - **Q1**: игрок флипает `takes_starting_loan` на своих PC; всё
      остальное DM-only.
    - **Q2**: reapply детектит hand-edits/deletes и показывает
      confirmation dialog; «hand_touched» флаг на транзакции + tombstones
      на hand-deletes.
    - **Q3**: loop create не генерит ничего автоматически; DM жмёт
      "Применить стартовый сетап" на странице петли; banner ждёт клика.
  - Форвард-compat закреплён явно: item location / equip state /
    PC movement between location nodes — out of scope, но план не должен
    блокировать их (anchored IDEA-054 epic в backlog'е).

- **plan.md** (1274 строки):
  - 3 новые таблицы: `campaign_starter_configs`, `pc_starter_configs`,
    `autogen_tombstones`.
  - 3 новые колонки на `transactions`: `autogen_wizard_key`,
    `autogen_source_node_id`, `autogen_hand_touched`.
  - 2 trigger'а + session-local setting `spec012.applying` как guard.
  - Партиционный index `(source_node_id, wizard_key)`.
  - Apply action — two-phase (needsConfirmation → confirmed).
  - RPC `apply_loop_start_setup` для атомарности в одной DB-транзакции.
  - Permission routing: `setPcTakesStartingLoan` (DM **или** PC owner)
    vs `updatePcStarterConfig` (DM only).
  - Секция «Forward-Compat Column Map» — явная таблица отложенных
    колонок (item_node_id, item_location_node_id, carried_state).

- **tasks.md** (486 строк, 47 задач, 12 фаз).

### Implement — Phases 1-4 (17 / 47 задач)

- **Phase 1 (Migration):**
  - `037_loop_start_setup.sql` — создаёт 3 таблицы, добавляет 3 колонки
    на `transactions`, ставит partial index, устанавливает 2 trigger'а,
    сидит 2 новые category slugs.
  - Пользователь применил в Supabase, успешно.

- **Phase 2 (Types):**
  - `lib/starter-setup.ts` — все типы spec-012 (StarterItem, Campaign/Pc
    StarterConfig, WizardKey, AutogenMarker, DesiredRow,
    ExistingAutogenRow, Tombstone, RowDiff, UpdatePair, ApplyResult,
    ApplySummary, AffectedRow, LoopSetupStatus).
  - `lib/transactions.ts` — расширен: `autogen` поле на `Transaction`,
    3 колонки на `TxRawRow`, `JOIN_SELECT`, гидратация в
    `rawToTransaction`.

- **Phase 3 (Pure helpers + vitest):**
  - `lib/starter-setup-resolver.ts` — `canonicalKey`,
    `resolveDesiredRowSet` (15 тестов).
  - `lib/starter-setup-diff.ts` — `diffRowSets` (9 тестов).
  - `lib/starter-setup-affected.ts` — `identifyAffectedRows` + форматтер
    для dialog'а (10 тестов).
  - `lib/starter-setup-validation.ts` — 3 валидатора (21 тест).
  - Итого 55 новых тестов, **135/135 зелёных** локально.

- **Phase 4 (Read queries):** appended в `lib/starter-setup.ts`:
  - `getCampaignStarterConfig(campaignId)`
  - `getPcStarterConfigsForCampaign(campaignId)`
  - `getPcStarterConfig(pcId)` (single-PC variant)
  - `getLoopSetupStatus(loopNodeId)` — feeds banner
  - `getExistingAutogenRows(loopNodeId)` — reconcile input
  - `getTombstones(loopNodeId)` — hand-delete detection input

- **Локально подтверждено:** `npm run test` — 135 passed.
  `npm run build` — чисто (TypeScript + Next.js production build прошли).

### Backlog

- **IDEA-054** добавлена — 🗺️ EPIC «PC↔Location граф»: привязка PC к
  location-нодам по дням/сессиям, item_location_node_id на транзакциях,
  carried_state, wipeable локации. Эпик касается будущих специфик и
  spec-012 plan-а (forward-compat column map отражает это).

## Миграции

- `037_loop_start_setup.sql` — autogen layer + starter configs +
  tombstones + 2 triggers + seed category slugs.

## Коммиты (все в main)

- `644a905` spec-012: pin forward-compat intent for item location/equip + PC movement
- `29a9140` backlog: IDEA-054 epic anchor — PC↔Location graph
- `984dbdd` spec-012: plan.md — autogen layer, wizards, apply action
- `2ac8446` spec-012: tasks.md — 47 tasks in 12 phases
- `f144bcc` T001: migration 037 — autogen layer + triggers
- `8d36c3c` spec-012 Phases 2-4: types, pure helpers, read queries

## Действия пользователю (после чата)

- [x] применить миграцию 037 в Supabase
- [x] `npm run test` — 135 passed
- [x] `npm run build` — clean

## Что помнить следующему чату

- spec-012 в процессе implement, **Phases 5-12 впереди** (30 из 47
  задач остались).
- **Следующая фаза — Phase 5 (config write actions):** T018–T020 в
  новом файле `app/actions/starter-setup.ts`. Три server actions:
  `updateCampaignStarterConfig` (DM-only), `updatePcStarterConfig`
  (DM-only, rejects `takesStartingLoan` в patch), `setPcTakesStartingLoan`
  (DM **или** PC owner).
- **Phase 6 (Apply action)** — главное ядро spec-012. T021 — сам
  `applyLoopStartSetup` two-phase, T022 — RPC `apply_loop_start_setup`
  как **миграция 038** (append или separate file — решить в момент
  написания). T023 — пользователь применяет RPC-миграцию.
- Правило работы: **по 3 фазы за раз**, останавливаемся перед
  применением миграции (у Phase 6 это T023 — RPC применение).
- **Phase 7** — cross-cutting hook в PC-create flow. Надо найти
  `createPcNode` (probably в `lib/campaign-actions.ts` или
  `app/actions/node-actions.ts`) и вставить default-row insert в
  `pc_starter_configs`.
- **Phases 8–10** — UI: banner + confirm dialog, PC block, campaign
  config page.
- **Phase 11** — P2 polish: autogen badge + filter chip на ledger.
- **Phase 12** — close-out (lint, test, build, walkthrough, NEXT,
  chatlog).
- Pure-helper пачка — **135 тестов зелёные**, forward-compat column
  map зафиксирована в `plan.md § Forward-Compat Column Map`.
- spec-016 «Сборы» отложена — только spec.md. Решение, когда к ней
  возвращаться, — после spec-012 (или параллельно в новом чате).
