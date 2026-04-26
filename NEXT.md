# NEXT — актуальное состояние проекта

> Обновляется в конце каждой сессии. ТОЛЬКО текущее состояние.
> История решений: `chatlog/`.
> Last updated: 2026-04-26 (chat 63 — spec-015 Phases 1–6 done +
> deployed; migration 043 applied; item catalog UI live; typeahead
> retrofit; awaiting prod verify before Phases 7–12)
> spec.md status Clarified, ждёт Plan)

## В проде сейчас

- **spec-001 Каталог сущностей**: граф нод+рёбер, поиск, фильтры, создание
- **spec-002/005 Трекер энкаунтера v3**: инициатива, HP, условия, эффекты, лог
- **spec-003 Петли и сессии как ноды**: миграции `008a`-`012`
- **spec-006 Auth + роли**: миграции `024`, `027`-`028`, `031`
- **spec-009 Loop progress bar + session packs**: миграции `032`-`033`
- **spec-010 Transactions ledger (chat 37-38)**: миграция `034`. Новая
  top-level app `/c/[slug]/accounting` (ledger + /settings/categories).
  Single-file UI: `transaction-form.tsx` поддерживает все три kind'а
  (money/item/transfer). Wallet block на странице PC (balance +
  recent 10 + «+ Транзакция»). Transfer — две связанные записи
  через `transfer_group_id`. Категории сидятся per-campaign
  (6 дефолтных: income/expense/credit/loot/transfer/other), scope-
  based таблица готова к spec-015 (item). Vitest подключён
  (47 pure-unit tests). Nav tab «Бухгалтерия» для всех member'ов.
  На session page секция «Транзакции» (stretch).
  **Chat 38 polish**: дефолтный день транзакции подставляется
  data-driven helper'ом `computeDefaultDayForTx` (latest tx →
  frontier → 1) — день «липнет», не откатывается при повторном
  открытии формы. В форме `loop` read-only, `day` — inline input
  без expand. `amount-input` per-denom panel без синего wrapper'а.
  Accounting page prefetchит `defaultDayByPcId` для всех
  доступных PC параллельно.
- **spec-011 Common stash / Общак (chat 40)**: миграции `035`+`036`.
  Новая нода type='stash' на кампанию, page `/c/[slug]/accounting/stash`
  (wallet + items grid + recent). `<StashButtons>` на PC-странице и
  в ledger actor bar — put/take одним тапом. Shortfall prompt в форме
  расхода (rich/poor/empty modes), lazy `getStashAggregate`. Item-
  трансферы через `createItemTransfer` с подписанным `item_qty`
  (sender=−qty, recipient=+qty) — миграция 036 релаксит CHECK до `<> 0`.
  `aggregateStashLegs` (pure, 9 тестов), `computeShortfall` (pure, 7
  тестов). Wallet-block переименован `pcId`→`actorNodeId` — тот же
  компонент рендерится и для PC, и для stash. Forward-compat с
  spec-015: `InventoryGrid` параметризуется `keyFn` для будущего
  `itemNodeId`. Catalog роут stash-ноды редиректит на `/accounting/stash`.
- **spec-011 polish Slice A (chat 42)**: универсальный
  `<TransactionRow>` — one-line layout, цвета `emerald-700 / red-700 /
  gray-700`, prefix `+/−/×`, WCAG AAA контрасты, day chip `д.N·с.M`,
  actor → counterparty для переводов. Заменяет старые inline-вёрстки
  в `wallet-block-client` и `ledger-list-client`. `ledger-row.tsx`
  удалён. Data-layer: добавлено поле `counterparty: { nodeId, title } |
  null` в `TransactionWithRelations`, новый `hydrateCounterparties`
  (один доп. запрос по `transfer_group_id`). Схема БД не меняется.
- **spec-011 polish Slice B (chat 42→43)**: stash page как табы над
  ledger. Новый `<BalanceHero>` + `<BalanceHeroClient>` — только hero
  card (без inline recent list). Новый `<StashPageTabs>` — «Предметы»
  (`<InventoryGrid>`) / «Лента транзакций» (`<LedgerList>` с новым
  prop `fixedActorNodeId` — override filter, hide actor chip, скрыть
  «N персонажей» stat). Оба таба всегда смонтированы, переключение
  CSS-only (сохраняет filter/scroll state). Stash page теперь:
  Header → BalanceHero → StashPageTabs. Устраняет дубляж UX между
  `/accounting` и `/accounting/stash` — внутри таба сразу красивые
  ряды из Slice A. `<WalletBlock>` для PC-страниц не трогался.
- **Ledger filter bar collapsible (chat 43)**: `components/ledger-filters.tsx`
  переписан. Свёрнут по умолчанию — показывает только кнопку
  «Фильтры (N)» + активные фильтры как removable chips + «Сбросить
  всё». Клик по кнопке разворачивает полную multi-group панель.
  URL по-прежнему single source of truth; `expanded` — local UI
  state. Дополнительно: новый prop `currentLoopNumber` — маркер «●»
  рядом с номером текущей петли в развёрнутом виде, подпись
  «Петля №3 · текущая» в active-chip.
- **Item ownership guard (chat 43, BUG-fix)**: `createItemTransfer`
  теперь агрегирует `item_qty` по (sender, item_name, loop_number)
  перед insert'ом и отклоняет перевод если `owned < qty`. Фиксит
  случай когда PC «кладёт в общак» предмет, которого у него нет —
  ранее создавалась пара легов (sender=−qty, recipient=+qty),
  оставляя у PC «отрицательный инвентарь», невидимый в UI.
  Ошибка: «У персонажа недостаточно «X» — есть N, нужно M. Сначала
  запишите получение предмета отдельной транзакцией.»
- **Transfer-pair collapse — IDEA-043 (chat 44)**: в `/accounting`
  каждый перевод рендерился двумя зеркальными рядами (sender leg +
  recipient leg). Новый pure-хелпер `lib/transaction-dedup.ts`
  (17 unit-тестов) — `dedupTransferPairs` оставляет канонический
  sender leg (с отрицательным знаком), `countDistinctEvents` считает
  пары как одно событие. Применён в `getLedgerPage` per-page +
  в `ledger-list-client` при merge пагинации (для сглаживания
  boundary-случаев). Totals `count` теперь «события», не «legs».
  Per-actor views (PC wallet, stash tab, любой `pc=…` filter) не
  затронуты — sibling leg там и так отсекался фильтром.
- **BUG-018 encounter role gate (chat 45)**: до фикса игрок
  кликал «Удар скимитаром», RLS режил write, но локальный
  `participantsSnap` на page-client обновлялся. Grid рендерил свой
  независимый `participants` state — asymmetry: в target-пикере
  damage виден, в гриде нет, F5 сбрасывал. Фикс в 4 файлах:
  страница энкаунтера читает membership, считает `canEdit` и
  прокидывает в клиент. `handleActionResolved` делает ранний exit
  с одним alert'ом для игрока, write-first/state-after для DM,
  sync grid через новый imperative handle `setParticipantHp`. Хук
  `useParticipantActions` для игрока возвращает noop-ы с
  warn-once alert'ом — все 18 mutation-колбэков сразу disabled.
- **spec-012 Loop start setup (chat 46-48)** — _полностью в проде_.
  Миграции 037+038: 3 таблицы (`campaign_starter_configs`,
  `pc_starter_configs`, `loop_starter_setup_applications`), 3 колонки
  на `transactions` (`autogen_wizard_key`, `autogen_source_node_id`,
  `autogen_hand_touched`), 2 триггера с `spec012.applying` guard'ом,
  RPC `apply_loop_start_setup` (security definer). Phase 5-7:
  `app/actions/starter-setup.ts` с `updateCampaignStarterConfig` /
  `updatePcStarterConfig` / `setPcTakesStartingLoan` /
  `applyLoopStartSetup` + `ensurePcStarterConfig` hook в
  use-node-form.ts. Phase 8: баннер «Стартовый сетап не применён» на
  `/loops` (DM-only, self-gating) + modal с таблицей hand-touched
  рядов. Phase 9: PC starter config block на `/catalog/[pcId]` (три
  режима — dm / player / read-only). Phase 10:
  `/accounting/starter-setup` DM-only editor для campaign-level loan
  + stash seed. Phase 11: optional `autogen` prop на
  `<TransactionRow>`, badge `<AutogenBadgeClient>` (⚙ + tooltip
  «Wizard · Source title»), URL filter `?autogen=only|none` в ledger
  (Postgres `.not is null` / `.is null`). T040 (chat 48): server
  собирает уникальные `autogen.sourceNodeId` из page.rows → batched
  IN-query за `nodes(id, title)` параллельно с PCs/loops →
  `autogenSourceTitles` Map → проп в `LedgerListClient` → `rows.map`
  гидрирует `{wizardKey, sourceTitle}` per row. Appended страницы
  fallback'ятся на пустой title — badge тогда показывает только
  wizard label. Pure helpers `lib/starter-setup-{resolver,diff,
  affected,validation}.ts` со своими vitest-тестами (135 в сумме).
  Phase 12 close-out (chat 48): lint 0/0, vitest 135/135, next build
  чистый. Spec-013 (encounter loot — 5й автоген-визард) переиспользует
  `autogen_*` инфраструктуру без миграций.
- **Статблоки монстров** (без папки спеки): миграции `013`-`014`, `018`-`020`, `023`
- **spec-013 Encounter loot distribution (chat 50)** — _полностью в
  проде_. Миграция 039: 1 mirror-node infra (encounter node_type +
  encounters.node_id + 3 триггера create/sync/delete) + 1 таблица
  `encounter_loot_drafts` + RLS. T004 (carve-out): извлёк
  `computeAutogenDiff` + `applyAutogenDiff` из spec-012 в
  `lib/autogen-reconcile.ts` — обе спеки используют общий reconcile
  core. Phase 4 pure helpers: `lib/encounter-loot-types.ts`,
  `lib/coin-split.ts` (floor-cp + remainder + greedy denominations,
  14 тестов), `lib/encounter-loot-resolver.ts` (15 тестов),
  `lib/encounter-loot-validation.ts` (35 тестов hand-rolled —
  следует codebase-конвенции, без zod). Phase 5 actions
  (`app/actions/encounter-loot.ts`): `getEncounterLootDraft`
  (lazy-create через upsert), `updateEncounterLootDraft`,
  `setAllToStashShortcut`, `applyEncounterLoot` (полный reconcile с
  bridge encounter-loot → spec-012 DesiredRow shape, two-phase
  confirm, ручная очистка encounter_loot tombstones — RPC хардкодит
  spec-012 keys). Phase 6 UI: `<EncounterLootSummaryReadOnly>` для
  игроков (3 состояния, link на `/accounting?autogen=only&source=...`),
  `<EncounterLootPanel>` server frame (DM-only, hides on active
  status), `<EncounterLootEditor>` client island (consolidated:
  day picker + coin/item rows + recipient picker single-select +
  live split preview + debounced save 300ms + apply + confirm
  dialog + «Всё в общак»). Mounted на encounter page. Phase 7
  filters: encounter mirrors отрезаны из sidebar
  (`lib/sidebar-cache.ts`), catalog grid + chip
  (`app/c/[slug]/catalog/page.tsx`), edge-creation typeahead
  (`components/create-edge-form.tsx`). T023: `encounter_loot:
  'Лут энкаунтера'` добавлен в оба `Record<WizardKey, string>`
  map'а. SQL smoke-скрипты `check-rls-013.sql` +
  `check-encounter-mirror-triggers.sql` (5+5 проверок каждый,
  обёрнуты в BEGIN...ROLLBACK) — запускаются через Supabase
  Dashboard. 199/199 vitest, lint 0/0, next build clean.
- **spec-014 Approval flow (chat 51-53)** — _полностью в проде_.
  Миграция 042: 6 колонок на `transactions` (`batch_id`,
  `approved_by_user_id`, `approved_at`, `rejected_by_user_id`,
  `rejected_at`, `rejection_comment`), 3 partial index'а
  (`idx_tx_pending` / `idx_tx_batch` / `idx_tx_author_pending`),
  CHECK `transactions_approval_consistency` (per-status field
  bleed protection — approved_at обязателен; approved_by_user_id
  может быть NULL из-за `on delete set null` на FK), backfill
  существующих рядов. Plus табличка `accounting_player_state`
  (user_id, campaign_id, last_seen_acted_at) с self-only RLS для
  FR-027 toast. Серверные actions:
  `app/actions/transactions.ts` — все три create-action'а
  (createTransaction / createTransfer / createItemTransfer)
  выбирают status по роли (player → pending, иначе approved),
  заполняют audit при auto-approve, auto-генерят `batch_id` для
  player'а (single-row → batch of 1, иначе groupRowsByBatch
  отбросил бы). `submitBatch` wrapper для multi-row submit с
  best-effort rollback. Status-gate в update/delete ('Можно
  править только pending-заявки'). `app/actions/approval.ts`
  (~440 строк) — approveRow/rejectRow с transfer-pair atomic,
  approveBatch/rejectBatch с partial-success counts,
  withdrawRow/withdrawBatch (author-only hard-delete). Все
  gated на `(status='pending' AND updated_at = expected)` для
  FR-028 optimistic concurrency; rowcount=0 → `{stale: true}`.
  Read-side: `lib/approval-queries.ts` —
  getPendingCount / getPendingBatches / getBatchById +
  getRecentDMActionSummary / markDMActionsSeen. Pure helpers
  `lib/approval.ts` — `groupRowsByBatch` / `summarizeBatch` /
  `validateBatchRowInputs` / `isStaleError` (~40 unit-тестов).
  UI: `transaction-row.tsx` status-aware (amber border-left +
  «⏳ Ждёт DM» pending; gray + strike + «✗ Отклонено» rejected
  с inline rejection_comment chip); `<AccountingSubNav>` (Лента
  / Очередь + secondary actions с usePathname highlight); page
  `/c/[slug]/accounting/queue` + `<QueueList>` server +
  `<QueueBatchCard>` client (collapsed/expanded, summary-line,
  status-чипы, per-row + batch DM/player actions, inline
  reject-comment, useTransition + router.refresh, stale
  handling); count badge на «Бухгалтерия» tab в `nav-tabs.tsx`
  (DM-only, > 0); `<DMActionToast>` для player на /accounting
  с auto-dismiss 8с. Multi-row form: `<BatchTransactionForm>`
  + sheet (~440 строк суммарно) — отдельный focused компонент
  рядом с существующей 770-строчной `<TransactionForm>` (не
  трогается, чтобы не сломать stash-pinned mode / edit /
  shortfall prompt). Кнопка «📋 Подать пачку» в
  `<LedgerActorBar>` видна только player'у. `dedupTransferPairs`
  defensive: group key теперь `(transfer_group_id, status)`.
  SQL smoke `scripts/check-rls-014.sql` (6 кейсов) +
  `check-approval-constraints-014.sql` (8 кейсов) —
  оба прошли в проде через Supabase Dashboard. Миграция 039: 1 mirror-node infra (encounter node_type +
  encounters.node_id + 3 триггера create/sync/delete) + 1 таблица
  `encounter_loot_drafts` + RLS. T004 (carve-out): извлёк
  `computeAutogenDiff` + `applyAutogenDiff` из spec-012 в
  `lib/autogen-reconcile.ts` — обе спеки используют общий reconcile
  core. Phase 4 pure helpers: `lib/encounter-loot-types.ts`,
  `lib/coin-split.ts` (floor-cp + remainder + greedy denominations,
  14 тестов), `lib/encounter-loot-resolver.ts` (15 тестов),
  `lib/encounter-loot-validation.ts` (35 тестов hand-rolled —
  следует codebase-конвенции, без zod). Phase 5 actions
  (`app/actions/encounter-loot.ts`): `getEncounterLootDraft`
  (lazy-create через upsert), `updateEncounterLootDraft`,
  `setAllToStashShortcut`, `applyEncounterLoot` (полный reconcile с
  bridge encounter-loot → spec-012 DesiredRow shape, two-phase
  confirm, ручная очистка encounter_loot tombstones — RPC хардкодит
  spec-012 keys). Phase 6 UI: `<EncounterLootSummaryReadOnly>` для
  игроков (3 состояния, link на `/accounting?autogen=only&source=...`),
  `<EncounterLootPanel>` server frame (DM-only, hides on active
  status), `<EncounterLootEditor>` client island (consolidated:
  day picker + coin/item rows + recipient picker single-select +
  live split preview + debounced save 300ms + apply + confirm
  dialog + «Всё в общак»). Mounted на encounter page. Phase 7
  filters: encounter mirrors отрезаны из sidebar
  (`lib/sidebar-cache.ts`), catalog grid + chip
  (`app/c/[slug]/catalog/page.tsx`), edge-creation typeahead
  (`components/create-edge-form.tsx`). T023: `encounter_loot:
  'Лут энкаунтера'` добавлен в оба `Record<WizardKey, string>`
  map'а. SQL smoke-скрипты `check-rls-013.sql` +
  `check-encounter-mirror-triggers.sql` (5+5 проверок каждый,
  обёрнуты в BEGIN...ROLLBACK) — запускаются через Supabase
  Dashboard. 199/199 vitest, lint 0/0, next build clean.
- **Excel-like grid энкаунтера**: рестайл на design tokens, AC+death saves, PillEditor
- **Markdown + Летопись**: миграции `011`, `015`-`017`
- **Факультативы**: миграция `029`
- **PC roster v2**: миграция `030`
- **Shared world editing + perf**: миграция `031`, React `cache()`, `Promise.all`
- **TECH-003**: убрано 21 `any` из join-ответов, утилита `lib/supabase/joins.ts`
- **Ultrareview-полишинг (chat 28)**: BUG-014, TECH-001, TECH-002,
  TECH-004, UX-001, UX-002
- **BUG-015 (chat 29)**: удаление ноды → router.back() с fallback
- **TECH-005 (chat 29)**: `middleware.ts` → `proxy.ts` (Next 16)
- **DEBT-003 (chat 30)**: SRD seed в `lib/seeds/dnd5e-srd.ts` +
  server action + CLI
- **BUG-016 + TECH-006 (chat 31)**: аудит invalidate сайдбара
- **TECH-007 (chat 32)**: invalidate-from-CLI endpoint
- **spec-015 Item catalog Phases 1–6 (chat 55–63)** — _в проде наполовину_.
  Миграция `043_item_catalog.sql` применена. Item-нода = «Образец»,
  side table `item_attributes` (category/rarity/price/weight/slot/source/
  availability), `transactions.item_node_id` nullable FK с `ON DELETE
  SET NULL` (FR-032), CHECK блочит link для не-item kind'ов. Categories
  scope расширен до 5 (`transaction`, `item`, `item-slot`, `item-source`,
  `item-availability`); 4 value-list дефолта засеяны. Routes:
  `/c/[slug]/items` (каталог), `/items/new`, `/items/[id]`,
  `/items/[id]/edit`. `<ItemFilterBar>` — collapsed-by-default,
  active-filter chips, URL single source of truth. `<ItemCatalogGrid>` —
  group-by × 6 axes (category/rarity/slot/priceBand/source/availability),
  sort × 4 keys, collapsible sections, пустое-состояние. `<ItemFormPage>`
  shared между create/edit, FR-030 chip с linked-tx count, inline
  delete confirmation. Item permalink с «Историей» (read-only таблица).
  `<ItemTypeahead>` шарится между transaction-form и batch-form
  (debounced 200ms search, «образец» badge, DM-only «+ Создать»
  affordance). Server actions (`createTransaction`/`updateTransaction`/
  `createItemTransfer`/`submitBatch`/`stash` wrappers) принимают
  `itemNodeId`, резолвят каноничное имя через `getItemById` (FR-014
  snapshot). Ownership check в `createItemTransfer` использует
  `item_node_id` когда есть, иначе strict free-text path. Pure helpers:
  6 модулей, ~125 vitest тестов (всего 356/356 после правки
  pre-existing арифметического бага в `approval.test.ts`). Phases 7–12
  ещё впереди (см. «Следующий приоритет»).

**Vercel:** https://mother-of-learning.vercel.app/
**GitHub:** https://github.com/Novoandrey/mother-of-learning
**Последняя применённая миграция:** `043_item_catalog.sql` (chat 55,
spec-015 — node_type=item, item_attributes, transactions.item_node_id,
4 value-list seeds)

## Следующий приоритет

**Spec-015 Item catalog integration — Phases 7–12** (середина
имплементации). Phases 1–6 закрыты в chat 55–63:

- Phase 1 — миграция 043 (схема, item_attributes side table, FK на
  `transactions.item_node_id`, scope expansion, default seeds для
  4 списков).
- Phase 2 — 6 pure-helper модулей с ~125 vitest-тестами
  (items-types, items-filters, items-grouping, items-validation,
  inventory-aggregation, inventory-slice). `aggregateStashLegs`
  refactor отложен до Phase 7 (T009 deferred).
- Phase 3 — read-surface (`lib/items.ts`, `lib/inventory.ts`).
  `getItemHistory` делегирует в `getLedgerPage` через новый
  `LedgerFilters.itemNodeId` — все hydration paths общие.
- Phase 4 — каталог UI: `/c/[slug]/items` страница, `<ItemFilterBar>`,
  `<ItemCatalogGrid>` (group-by × 6, sort × 4 keys), `<ItemFormPage>`,
  `app/actions/items.ts` (create/update/delete/getLinkedTxCount).
- Phase 5 — item permalink (`/items/[id]`) + edit (`/items/[id]/edit`).
  «История» секция через `getItemHistory` + read-only таблица
  (компактные строки: «П3 · день 7» / actor → counterparty / signed qty).
  T021 (history pagination) отложен.
- Phase 6 — typeahead retrofit. `<ItemTypeahead>` компонент с
  debounced 200ms search, «образец» badge, DM-only «+ Создать»
  affordance. Wired в `<TransactionForm>`, `<BatchTransactionForm>`,
  `<TransactionFormSheet>`, `<BatchTransactionFormSheet>`. Сервер:
  `CreateTransactionInput`/`UpdateTransactionInput`/`ItemTransferInput`/
  `BatchRowSubmitInput`/`ItemStashInput` все принимают
  `itemNodeId`. Каноничное имя резолвится через `getItemById`
  (FR-014). Ownership check в `createItemTransfer` использует
  `item_node_id` когда есть, иначе `item_name + item_node_id IS NULL`
  (strict free-text path).

**Что осталось (Phase 7+):**
- Phase 7 — `<InventoryTab>` shared component, монтаж на PC page
  (новая вкладка) и stash page (заменяет существующую «Предметы»).
  Day picker URL-driven `?tab=inventory&loop=N&day=M`. Refactor
  `aggregateStashLegs` → делегация в `aggregateItemLegs` (отложенный T009).
- Phase 8 — `/c/[slug]/items/settings` страница: 4 секции,
  переиспользует `<CategorySettings>` для item / item-slot / item-source /
  item-availability scopes. Возможно потребуется параметризация labels
  в существующем компоненте.
- Phase 9 — миграция 044 (SRD seed + backfill). Dataset choice:
  Option B (open5e parser) vs Option C (~50-item hand-curate). Решить
  в самом T032 после быстрого аудита датасета. Backfill через
  `LOWER(TRIM(item_name)) = LOWER(TRIM(title)) OR LOWER(TRIM(item_name)) = LOWER(srd_slug)`.
- Phase 10 — encounter loot retrofit (spec-013) + spec-014 walkthroughs.
  Расширить `LootLine.itemNodeId` в `lib/encounter-loot-types.ts`,
  пробросить в `applyEncounterLoot` → `lib/autogen-reconcile.ts`.
- Phase 11 — sidebar/nav: `«Предметы»` пункт в sidebar (spec-013
  encounter mirror cut-out не задевает item ноды), tab между
  «Каталог» и «Бухгалтерия», redirects `catalog?type=item` →
  `/items`.
- Phase 12 — smoke: `scripts/check-rls-015.sql` (RLS на
  `item_attributes`, FK cascade SET NULL, CHECK на kind-vs-link
  mismatch), manual walkthrough всех 7 user stories на mat-ucheniya.

**Сначала проверить на проде:**
- `/c/<slug>/items` рендерится, каталог пустой, фильтры работают.
- DM создаёт первый предмет через `+ Предмет`, открывает permalink.
- В транзакционной форме item-tab показывает typeahead, при выборе
  предмета появляется бейдж «образец».
- DM редактирует Образец: linked-tx count chip показывает 0 пока
  никто не сослался; после первой связанной транзакции — 1.
- `/c/<slug>/catalog?type=item` пока НЕ редиректит (Phase 11) —
  это OK.


  TECH-011 closes as "keep".
- **SRD seed ~400 items с английским `srd_slug` + русским
  `nodes.title`** (Q3=A).
- **Backfill strict by title OR srd_slug** (Q4=B), zero
  false-positive риска благодаря двум ключам.
- **Slot field** (Q6 user-clarified): ring/cloak/amulet/boots/
  gloves/headwear/belt/body/shield/1-handed/2-handed/versatile/
  ranged. DM-configurable value list per-campaign.
- **DM-configurable value lists per-campaign**: category
  (existing), slot, source, availability — единый паттерн
  (FR-005a/b/c/d) с settings page.
- **URL**: `/c/[slug]/items` primary, `/catalog?type=item` alias
  (Q6=A).
- **Item history**: только linked rows (Q7=A).

**Out of scope (зафиксировано):** location inventory (IDEA-054 —
deprioritised, "не факт что понадобятся"), spell-as-item
(IDEA-029 — отдельная спека), item identification mechanics,
attunement / equipped / charges, marketplace simulation, bulk
relinking, fuzzy backfill.

**Pickup для нового чата (Plan phase):**
1. Свежий клон.
2. Прочитать `.specify/specs/015-item-catalog/spec.md`
   полностью — особенно § Context (5 pinned points), §
   Clarifications (8 Qs), FR-002/004/005a-d/023/030.
3. Инспектировать wallet block в проде: какой default helper
   она использует для day chip → inventory tab дёрнет тот же.
4. Решить placement hot columns (`nodes` vs side table).
5. Спроектировать settings page для 4 value lists.
6. Найти SRD items dataset (en+ru ~400 items) — существующий
   parser для статблоков в `mat-ucheniya/scripts/` ориентир, но
   items — другой dataset.
7. Создать `.specify/specs/015-item-catalog/plan.md`. Дождаться
   ok, потом tasks.md, потом implement.

**Альтернативная очередность (если 015 не в приоритете):**
- **Spec-016 «Сборы»** — spec.md есть, ждёт Clarify.
- **Spec-017 карта мира** — заявлена в backlog (5-7 дней).
- **IDEA-055** — DM rename/delete на encounter page (~30 мин).

### spec-014 хвосты (не блокеры — happy flow подтверждён в проде)

- **UX полишинг** — будет приходить инкрементально по запросу
  пользователя. Все механизмы в порядке: pending/approved/rejected
  rendering, queue tab, badge, toast, multi-row form, withdraw,
  approve/reject, transfer-pair atomic.
- **T038/T039** — manual walkthrough для autogen-не-затронут (DM-
  direct + autogen reapply игнорирует pending) и concurrent edit
  staleness. Не блокеры — happy flow проверен, эти scenarios
  затронут только edge cases.
- **Bulk-actions** — UI showed только per-row + per-batch.
  «Reject several batches» / «Approve everything from PCs X+Y» —
  не в спеке (см. plan.md «Out of scope»). Если возникнет —
  заводить отдельный backlog item.

### Кандидаты после spec-015

Из backlog'а (entries есть, spec.md нет):
- **spec-016 «Сборы»** — spec.md есть, ждёт Clarify.
- **spec-017 карта мира** — фундаментальная (5-7 дней).
- **spec-020 правила/хомрулы** — средняя.
- **spec-018** (encounter rework), **spec-019** (DM sandbox),
  **spec-021** (DM session control), **spec-022** (movement
  timeline), **spec-023** (часы/проекты), **spec-024+**
  (character-sheet/mobile epic).
- **IDEA-055** (DM rename/delete на encounter page, ~30 мин) —
  новая в chat 50.

**Параллельный долг (мелкие):**
- T044 spec-012 manual walkthrough — 10 Acceptance Scenarios.
  Я (Claude) автоматизировать не могу, проверка вручную DM'ом.
- IDEA-055 DM rename/delete кнопки.

### Последняя строка хвостов

- IDEA-043 ✅ (chat 44) — collapsed-transfer-row в /accounting.
- Bulk-edit ещё нет (часть старого IDEA-043) — может всплыть
  отдельно если будет запрос.
- **IDEA-054 PROMOTED (chat 49)** — 🗺️ PC↔Location граф разъехался
  на spec-017 (карта) + spec-021 (DM session control + movement
  events) + spec-022 (timeline view). Историческая запись
  осталась в backlog'е.

### Параллельные кандидаты

- **IDEA-037** [P2] — факультативы → бонусы к статам PC
- **IDEA-041** [P2] — система фидбека внутри приложения
- **Spec-007 этап 4 stage 4** — трекер трат на ход (action/bonus/movement)
- **Encounter race conditions** [P3] — одновременные правки grid'а
- **Мобилка игрока** (Spec-007 этап 5) — большая фича, ждёт решения

### Хвосты spec-010 (не блокеры)

- Session binding в форме: сейчас session подставляется только из
  фронтира, ручное переназначение отложено (см. TECH-009 /
  IDEA-045).
- Ledger totals считаются в памяти (`getLedgerPage` тянет агрегат
  без LIMIT). В плане есть follow-up про materialized view на
  (campaign, loop, pc) — актуально когда mat-ucheniya перевалит
  за ~тысячу транзакций (TECH-008).
- Bulk-edit и collapsed-transfer-row view — отложены (IDEA-043).
- Стартовый капитал из класса/бэкграунда — IDEA-051.
- UI/UX skill для Claude — IDEA-052 (meta).

## Приоритеты текущего этапа

`mat-ucheniya/AGENTS.md` теперь фиксирует порядок: **данные →
десктоп-UX → мобилка**. Мобильная спека придёт отдельно; точечные
мобильные фиксы — только если контрол вообще не кликабелен на
телефоне.

## Отложенные фичи

1. Трансформация факультативов в бонусы к статам PC
2. **Мобилка игрока** — режим игрока (читалка, mobile-first)
3. **Трекер трат на ход в энкаунтере** — action/bonus/reaction
4. **Общая панель реакций/легендарок** — агрегат реакций всех живых
5. **PillEditor v2** — rename pill, выбор цвета
6. IDEA-029 Spells + slots (ждёт auth, большая фича)
7. Импорт из Google Sheets (таблицы персонажей)
8. Лог вне боя (IDEA-026 инкремент 4)

## Стек и окружение

- Next.js 16 (App Router) + Supabase + Tailwind v4
- Рабочая директория в репо: `mat-ucheniya/`
- Тестовая кампания: slug `mat-ucheniya`
- Ключевые зависимости: `lucide-react`, `@fontsource-variable/manrope`,
  `@fontsource-variable/jetbrains-mono`, `vitest` (dev)

## Файлы памяти

- `.specify/memory/constitution.md` — конституция v3.0.0
- `.specify/memory/encounter-tracker-v1-retrospective.md` — ретро v1 трекера
- `.specify/memory/character-sheet-excel-system.md` — система листа персонажа
- `.specify/memory/bookkeeping-roadmap.md` — roadmap 009-015
- `.specify/memory/assets/character-sheet-examples.xlsx` — Excel примеры
- `mat-ucheniya/STYLE.md` — design tokens
- `mat-ucheniya/AGENTS.md` — предупреждение про Next.js 16
- `mat-ucheniya/scripts/README.md` — парсер SRD

## Правила работы

- Язык общения: русский. Код и комментарии: английский.
- Вайбкодинг: пиши код сам, не объясняй как писать.
- СДВГ: одна задача за раз, выбирай лучший вариант сам.
- Файлы миграций: отдавать пользователю через `present_files`.
- Правило переноса: сначала перенеси как есть, потом улучшай.
- Хардкод-аудит: при новом компоненте проверять на строковые константы
  под конкретную кампанию; выносить в функции с TODO-ссылкой на backlog.

## В конце сессии

1. Создать `chatlog/YYYY-MM-DD-chatNN-короткое-название.md` по шаблону из `chatlog/README.md`.
2. Обновить `NEXT.md`: секции «В проде» и «Следующий приоритет».
3. Обновить `backlog.md` если появились новые баги/идеи.
4. Закоммитить и запушить.
