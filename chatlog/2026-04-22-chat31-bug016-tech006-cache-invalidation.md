# Chat 31 — BUG-016 + TECH-006 cache invalidation audit, 2026-04-22

## Контекст (откуда пришли)
Chat 30 нашёл рассинхрон каталог/сайдбар после `seed-srd` и конкретный
миссинг в `createCustomType`. Backlog составил план systematic sweep
по всем мутациям таргетных таблиц (nodes, node_types, node_pc_owners,
chronicles, encounters, loops, sessions, edges).

## Что сделано

### Фиксы
- **`hooks/use-node-form.ts:191`** `createCustomType` — добавлен
  `await invalidateSidebarAction(campaignId)` после успешного инсерта
  в `node_types`. Quick win из BUG-016.
- **`lib/campaign-actions.ts`** `initializeCampaignFromTemplate` —
  добавлен `invalidateSidebar(campaignId)` после `seedCampaignSrd`.
  Server action (в Next runtime), поэтому может вызвать invalidate
  напрямую. Без фикса при создании новой кампании сайдбар пустой
  до 60с TTL.
- **`AGENTS.md`** — задокументировано правило: любая server-side
  мутация `node_types`/`nodes` обязана звать `invalidateSidebar`.
  С разбивкой по местам вызова (server action / route handler /
  client hook / CLI).

### Аудит (всё проверено)
Прошёл по всему списку из backlog. Нашёл всего 2 миссинга (выше).
Остальные мутации либо уже зовут invalidate, либо не аффектят сайдбар:

| Источник | Таблица | Статус |
|---|---|---|
| `api/nodes/[id]` DELETE | nodes | ✅ зовёт invalidate |
| `api/nodes/[id]` PATCH/content | nodes.fields/content | не в сайдбаре |
| `api/chronicles/*` | chronicles | catalog/loops `force-dynamic`, UI оптимистичный |
| `members/actions.ts` PC owners | node_pc_owners | сайдбар не фильтрует по owner |
| `electives/actions.ts` | nodes/edges | ✅ зовёт invalidate |
| `lib/encounter-actions.ts` createEncounter | encounters | не в сайдбаре, list `force-dynamic` |
| `use-encounter-turns.ts`, `encounter-grid.tsx` | encounters.* | not in sidebar |
| `create-edge-form.tsx` | edges | не в сайдбаре, `router.refresh()` ok |

### Не трогал
- CLI-скрипты (`seed-srd`, `dedupe-srd`, `seed-players`, `seed-owner`,
  `import-electives`) — вне Next runtime, `revalidateTag` недоступен.
  Вариант с `/api/admin/invalidate-sidebar` или TTL=10 — отдельная задача.
- Race conditions в encounter grid (одновременные правки двух DM) —
  отдельная история, нужен план (optimistic concurrency vs version column
  vs realtime).

## Миграции
Нет.

## Коммиты
- TBD после пуша

## Действия пользователю (после чата)
- [x] задеплоить (авто через main)
- [ ] проверить на проде: создать кастомный тип ноды → сайдбар
      обновляется сразу, без 60с ожидания

## Что помнить следующему чату
- BUG-016 + TECH-006 закрыты для in-runtime вызовов. Остался
  CLI-кейс — см. backlog (TECH-007 либо новая задача).
- Encounter grid race conditions — открытый вопрос.
