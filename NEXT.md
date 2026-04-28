# NEXT — актуальное состояние проекта

> Обновляется в конце каждой сессии. ТОЛЬКО текущее состояние.
> История решений: `chatlog/`.
> Last updated: 2026-04-28 (chat 79 — form draft autosave
> для всех длинно-печатных полей в проде; 0 миграций;
> version unchanged).

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
- **spec-015 Item catalog (chat 55–69)** — _полностью в проде._
  Миграции `043_item_catalog.sql`, `044_srd_items_seed.sql` (50
  hand-curated SRD items + per-campaign backfill), `045_apply_starter_setup_item_node_id.sql`
  (RPC accepts item_node_id; spec-013 tombstones whitelisted)
  применены.

  **Phases 1–6 + UX iter 1 (chat 55–65):** Item-нода = «Образец»,
  side table `item_attributes` (category/rarity/price/weight/slot/
  source/availability), `transactions.item_node_id` nullable FK с
  `ON DELETE SET NULL` (FR-032), CHECK блочит link для не-item
  kind'ов. Categories scope расширен до 5 (`transaction`, `item`,
  `item-slot`, `item-source`, `item-availability`). Routes:
  `/c/[slug]/items` (каталог), `/items/new`, `/items/[id]`,
  `/items/[id]/edit`. `<ItemFilterBar>` (collapsed, active-filter
  chips), `<ItemCatalogGrid>` (group-by × 6, sort × 4),
  `<ItemFormPage>` shared с linked-tx count chip и inline delete
  confirmation. Item permalink с «Историей». `<ItemTypeahead>`
  шарится между transaction-form, batch-form, encounter loot
  editor. Server actions принимают `itemNodeId`, каноничное имя
  резолвится через `getItemById` (FR-014 snapshot). Ownership
  check в `createItemTransfer` использует `item_node_id` когда
  есть. UX iter 1: light-theme + 4-button TransactionActions
  (+ Доход / − Расход / + Предмет / − Предмет вместо single
  «+ Транзакция»). 🎒 nav tab.

  **UX iter 1.5 (chat 66):** Perf — `searchItemsForTypeahead`
  переписан на single-roundtrip nested-select с `!inner` join'ами
  (3 sequential round-trip'а → 1, ~600ms экономии). Counterparty
  picker — опциональный «От кого / Кому» в форме item-in / item-out
  возвращает потерянную семантику transfer без отдельной кнопки.

  **Phase 7 — InventoryTab (chat 67):** новый `<InventoryTab>`
  server component + `<InventoryTabControls>` client island
  (loop/day/group-by URL-driven). `groupInventoryRows` pure helper
  (parallel `groupItems`, free-text bucket в хвосте). Mounted на PC
  page (`?tab=inventory&loop=N&day=M&group=...`) и заменил
  `<InventoryGrid>` в stash page tabs.

  **Phase 8 — Settings page:** `/c/[slug]/items/settings` (DM-only)
  с 4 секциями: Категории / Слоты / Источники / Доступность.
  `<CategorySettings>` обобщён до 5 scope'ов через
  `slugPlaceholder` / `labelPlaceholder` / `addLabel` пропы (старая
  transaction-categories страница не сломана).

  **Phase 9 — SRD seed (chat 67):** Option C, 50 hand-curated items
  (15 weapons, 8 armour, 12 gear/tools, 8 consumables, 7 magic).
  `lib/seeds/items-srd.ts` + `scripts/items-srd-codegen.ts`
  (regenerator) + `044_srd_items_seed.sql` (per-campaign INSERT
  + transactions backfill via name-or-srd-slug match, RAISE NOTICE
  counts, idempotent).

  **Phase 10 — Encounter loot retrofit (chat 68):**
  `lib/encounter-loot-types.ts` `ItemLine.item_node_id` опциональный
  uuid + uuid-валидация (legacy drafts проходят, FR-018). Resolver
  пробрасывает link, merge-key segments linked vs free-text.
  DesiredRow + ExistingAutogenRow + diff equality + reconcile insert/
  update payloads + bridge — везде `item_node_id`. Spec-012 path
  стайт `null` (DM-curate by name as before). RPC обновлён мигом 045.
  `<ItemTypeahead>` подключён в `<EncounterLootEditor>`.

  **Phase 11 — Sidebar/nav (chat 68):** `catalog-sidebar-wrapper`
  short-circuit'ит item-ноды на `/items/[id]` (без bounce через
  redirect). `activeNodeId` regex распознаёт оба роута.
  `/catalog?type=item` → `/items` server-side redirect, preserves
  `?q=`. `/catalog/[id]` → `/items/[id]` для item-нод (рядом с
  существующим session/stash redirect-блоком).

  **Phase 12 — Smoke (chat 69):** `scripts/check-rls-015.sql` (6
  кейсов: outsider RLS, member RLS, CASCADE на attrs, SET NULL на
  transactions, kind/link CHECK, scope CHECK с unknown-rejection).

- **spec-017 Складчина (chat 72)** — _полностью в проде._ Миграция
  047 применена. RLS smoke ✓, pizza-test US1 ✓.

- **spec-016 Default item prices: bulk apply + override (chat 72)** —
  _полностью в проде._ Миграция 048 применена. Расширен в chat 74
  (см. ниже): manual чекбокс «Не использовать стандартную цену»
  убран, `use_default_price` теперь auto-managed.

- **SRD items extended seed batches (chat 74)** — _полностью в проде._
  6 миграций (049–054) добавляют 224 предмета сверх базовых 50.
  Итого 274 предмета в `lib/seeds/items-srd.ts`. Источники: PHB +
  XGE + supplements (DMG/VRGR/IMR/JRC/EGW/RLW). Состав:
  * 049 — 19 ядов (DMG/VRGR/IMR/JRC: simple/contact/inhaled/injury)
  * 050 — 11 наркотиков и веществ (DMG/EGW/RLW/JRC); skip
    «Противоядие» = `antitoxin-vial`
  * 051 — 30 оружий (5 simple melee, 3 simple ranged, 12 martial
    melee, 2 martial ranged, 3 Renaissance firearms, 5 Modern
    firearms — Modern с null price)
  * 052 — 5 PHB armors (padded, hide, breastplate, ring-mail,
    splint) + conditional rename `studded-leather`
  * 053 — 36 tools/instruments/gaming sets (5 standalone kits,
    4 gaming sets, 10 musical instruments, 17 artisan tools)
  * 054 — 82 PHB equipment items (70 standalone gear + 5 arcane
    foci + 3 holy symbols + 4 druidic foci) + conditional rename
    `whetstone` («Точило» → «Точильный камень»)
  Все pattern-conformant: per-campaign DO loop, NOT EXISTS guard
  на `(campaign_id, srd_slug)`, Phase 2 backfill
  `transactions.item_node_id` по name/slug match. Идемпотентны.

- **Attunement + auto-managed price flag (chat 74)** — _полностью
  в проде._ Миграция 055 (small follow-up к spec-016, не отдельная
  спека). Добавляет:
  * `item_attributes.requires_attunement boolean default false` +
    бэкфилл по 17 предметам с «Требует настройки» в описании
    (cloak-of-protection, ring-of-protection, amulet-of-health,
    gauntlets-of-ogre-power, wand-of-web, cloak-of-elvenkind,
    boots-of-speed, boots-of-striding-and-springing, winged-boots,
    slippers-of-spider-climbing, ring-of-jumping, ring-of-warmth,
    ring-of-spell-storing, eyes-of-the-eagle, helm-of-telepathy,
    bracers-of-defense, pearl-of-power)
  * Auto-flag `use_default_price`: для magic+consumable bucket
    сравнение с `campaigns.settings->'item_default_prices'[bucket]
    [rarity]`; для mundane (rarity=null, non-consumable, с
    srd_slug) — с embedded PHB seed baselines (210 tuples).
    Custom items без srd_slug → flag=true (нет baseline).

  UI:
  * Catalog grid: колонка «Н» переименована в «Цр» (✓ когда
    цена изменена руками — отличается от стандартной); новая
    колонка «Н» (purple ✓) для attunement.
  * Item form: убран ручной чекбокс «Не использовать стандартную
    цену» (теперь auto); добавлен чекбокс «Требует настройки»
    под полем Слот. Autofill цены теперь всегда активен (не
    gated на flag).
  * Server actions: helper `computeUseDefaultPrice(payload,
    defaults)` зеркалит SQL-логику бэкфилла; вызывается на
    create/update; `requires_attunement` пробрасывается
    отдельно из payload.

  `ItemPayload` больше не несёт `useDefaultPrice` (auto-computed
  server-side). `ItemNode` оставляет оба поля (для grid display).

  **Future per-location pricing axis** — отдельный layer поверх
  base price (новая таблица типа `item_location_prices(item_id,
  location_node_id, price_gp, availability)` или подобная). Не
  пересекается с use_default_price, который остаётся про базовую
  цену vs кампейн-стандарт.

- **spec-018 dnd.su magic items scraper (chat 75-76)** — _полностью
  в проде._ 50 миграций 056-105 применены. 844 предмета из dnd.su
  (5e14 only) + 274 hand-curated SRD = 1118 в `mat-ucheniya`.

  **Phase 1-3 (chat 75-76):** Python scraper `scripts/scrape_dndsu.py`
  читает `https://dnd.su/piece/items/index-list/` (полный 720KB
  index за один GET), потом по 1 req/s обходит 934 item-страницы с
  HTML→markdown через html2text, SHA1-cache в `scripts/dndsu-cache/`.
  Парсер: `parse_item(md, url) -> list[ItemRecord]` — pure function
  с line-based header parser, регекс на первый-bullet
  type/rarity/attunement, umbrella expansion (один item с
  `редкость варьируется` → N records по rarity tier), SOURCE_BOOKS
  map на 41 книгу, edition gate (5e24 → skip), empty-card detection
  (heading без bullet → skip с INFO log). 18/18 pytest tests на 5
  fixtures.

  **Phase 4-5 (chat 76):** TS codegen `scripts/items-dndsu-codegen.ts`
  читает intermediate `dndsu_items.json` → `lib/seeds/items-dndsu.ts`
  (844 entries, sibling к `items-srd.ts`) + `--emit-migrations` за
  per-book SQL. Дедуп: 2 internal (`staff-of-defense`,
  `spider-staff` — переиздания LMOP↔PBSO, оставляем первое
  вхождение с warn) + 41 collision с hand-curated SRD (SRD wins —
  у них curated `priceGp`).

  **Слаги**: чистый kebab-case URL-slug (`adamantine-armor`,
  `bloodwell-vial-plus-1`). Префикс `dndsu-{id}-` отвергнут после
  ревью. Для umbrella items стрипается `-1-2-3` суффикс из
  URL-slug перед `-plus-N`.

  **Phase 6-7 (chat 76):** UI wire-up. `ItemNode.dndsuUrl` +
  `ItemPayload.dndsuUrl: string | null`, `hydrate()` читает
  `nodes.fields.dndsu_url`, create/update actions пишут
  `fields.dndsu_url` (омит пустых строк). Item form: новое
  `<input type="url">` поле «Ссылка на dnd.su» рядом с «Детали
  источника». Item detail page: ссылка «Открыть на dnd.su» с
  lucide `<ExternalLink>` иконкой (target=_blank, rel=noopener).

  **FR-012 narrowed (T024):** новые per-book source slugs не
  плодятся в `categories(scope='item-source')`. Все imported items
  reuse `source_slug='srd-5e'` bucket; имя книги в
  `nodes.fields.source_detail`. Q8 в `## Clarifications`.

  **Phase 2 backfill `transactions.item_node_id` намеренно
  пропущен** для dnd.su entries — русские названия слишком общие
  («Жезл», «Кольцо», «Свиток...»), backfill по `LOWER(item_name)`
  match налепил бы false positives. DM руками связывает через UI
  каталога. SRD seed (mig 044) backfill остаётся, имена там
  специфичные.

  **Smoke (T019):** `scripts/check-rls-018.sql` (8 кейсов в
  BEGIN/ROLLBACK) — total count, JSONB shape, attrs row + source,
  dndsu_url URL shape, idempotency, FK CASCADE/SET NULL,
  kind/link CHECK. Все ✓ после двух итераций (column names
  `day_in_loop`/`actor_pc_id`/required `category_slug`+
  `author_user_id`; `status='pending'` чтобы обойти
  `transactions_approval_consistency` constraint из mig 042).

  **Bug-fix цикл после применения (chat 76):** три отдельных бага
  обнаружены через user feedback:
  1. **/items падает 500** — `getCatalogItems` шла в два шага
     (nodes → IN-query на attrs). С 1118 UUIDов в IN URL ~42KB,
     PostgREST давится. Переписал на embed `!inner` (тот же
     паттерн что в `searchItemsForTypeahead`).
  2. **Сайдбар показывает 396/822 вместо 1118** — Supabase в
     проекте включён server-side `db-max-rows = 1000` клэмп,
     `.range(0, 9999)` его НЕ обходит. Pagination loop в трёх
     местах (`sidebar-cache`, `getCatalogItems`,
     `applyItemDefaultPrices`): крутимся по страницам 1000 rows,
     hard cap 10k.
  3. **«Применить ко всем» Bad Request** — тот же URL-overflow от
     `.in('node_id', [1118 UUIDов])` в bulk-apply action.
     Чинится тем же embed + pagination переходом.

  Заодно legacy-текст про несуществующую галочку «Не использовать
  стандарт» убран из settings page и confirm dialog —
  `use_default_price` стал auto-managed ещё в chat 74, copy
  отстала.

  **Reproducibility:** `scripts/dndsu_items.json` (2.0 MB,
  887 records) committed. `scripts/dndsu-recon-snapshot.html`
  (720 KB, 934 items) committed. Cache dir
  `scripts/dndsu-cache/` gitignored. Re-scrape: `python3
  scripts/scrape_dndsu.py`, потом `npx tsx
  scripts/items-dndsu-codegen.ts --emit-migrations`.

  **DDHC TODO:** `099_dndsu_unknown-dd-supplement-ddhc_items.sql`
  применилась, 6 items сидят с `source_detail = 'Unknown D&D
  supplement (DDHC)'`. Когда узнаем что за DDHC — обновим строку
  в `SOURCE_BOOKS` и перегенерим миграцию (или пропатчим
  UPDATE'ом).

**Vercel:** https://mother-of-learning.vercel.app/
**GitHub:** https://github.com/Novoandrey/mother-of-learning
**Последняя применённая миграция:** `105_dndsu_xanathars-guide-to-everything_items.sql`
(chat 76). Все миграции 047–105 применены.

- **spec-019 Starter Setup Overview (chat 77)** — _в проде_.
  Pure UI-слой над spec-012, миграций 0. Page
  `/accounting/starter-setup` переписана: apply section сверху
  (primary loop status + кнопка `<ApplyStarterSetupButtonClient>`
  + optional unapplied backlog list) + tabs «Кампания / Персонажи»
  снизу. «Кампания» — три старые карточки (loan amount + stash
  seed coins + stash seed items). «Персонажи» — стопка
  `<PcStarterConfigBlock mode="dm">` × N с RU-collation sort и
  empty state. Tabs local state (паттерн `<StashPageTabs>`),
  default `campaign`. На `/loops` `<LoopStartSetupBanner>`
  снят, заменён на DM-only inline info-line с link'ом на
  Бухгалтерию. Read-side: один новый
  `getCampaignLoopSetupStatuses(campaignId)` (batched IN-query
  по `transactions.autogen_source_node_id`), всё остальное
  реюзит существующие queries/actions/components без правок.
  3 новых файла, 1 удалён, 2 модифицированы. Lint+build не
  гонял локально (FS-issues), юзер проверил на Vercel. Hands-off
  для DM в mat-ucheniya: 29 PC настраиваются с одной страницы
  ~5 мин вместо ~15 мин через 29 переходов на /catalog.
- **Form draft autosave (chat 79)** — localStorage-страховка для
  всех длинно-печатных полей. Новый хук `hooks/use-form-draft.ts`
  (~150 строк) делает дебаунс ~600 мс снапшота формы в
  `localStorage` и при возврате показывает янтарный баннер
  «📝 Найден несохранённый черновик от {time}» с кнопками
  Восстановить / Отбросить. Подключён в трёх местах: основная
  `CreateNodeForm` (все ноды — сессии, локации, NPC, петли;
  ключ `mat-uch:draft:{edit:<id>|new:<campaign>:<slug>}`),
  `MarkdownContent` (контент-блок ноды; ключ `…:md:<nodeId>`),
  `Chronicles` ChronicleForm (записи летописи; ключ
  `…:chr:{edit:<id>|new:<nodeId>}`). Pristine state (совпадает с
  тем, что в БД) трактуется как пусто — не пишет no-op снапшоты.
  Пока баннер «есть черновик» показан — автосохранение на паузе,
  чтобы пустая форма не затёрла то, ради чего юзер вернулся.
  На Save и на Cancel черновик чистится; ребут/краш —
  единственный сценарий, когда баннер сработает. 0 миграций,
  0 серверных изменений.

## Следующий приоритет

**Spec-020 «PC Holdings Overview»** (chat 77 promote) — sibling
к spec-019: одностраничный DM-tool, показывающий **текущее**
состояние всех PC (баланс + инвентарь + collapsed-by-default
история транзакций под катом). 0 миграций ожидается, чистый
UI-слой над существующими read-queries (`getWallet`, inventory
из transactions, `getLedgerPage`). Реюз `<WalletBlock>`,
`<InventoryGrid>`, `<LedgerList fixedActorNodeId={pcId}>`. Lazy
load транзакций — query летит только при раскрытии аккордеона
(иначе 29 ledger-запросов на page-load). Spec пишется в этом же
чате после close-out spec-019.

**Spec-021 «Карта мира»** (была spec-019, потом spec-020,
теперь spec-021) — фундаментальная фича, ~5–7 рабочих дней.
План в `backlog.md` (промоутирована из IDEA-054 в chat 49,
перенумерована трижды: chat 75 → 019, chat 77 → 021).

Грубый скоп: canvas → пины (PCs/locations) → travel edges → фильтры
по сессиям/петлям. Schema impact: новая таблица `map_pins` (или
`nodes.fields.map_position`?) — решается в Specify.

**Что было сделано в spec-018** (для контекста, если понадобится):
50 миграций, 844 предмета, three-layer pipeline (Python scraper →
JSON intermediate → TS codegen). Detail в chatlog/2026-04-27-chat76-spec018-implement.md.

### После spec-021

В порядке приоритета:
1. **spec-022+** «Квесты» — после реворка энкаунтеров (encounter
   rework был в backlog'е, перенумерован), т.к. quest =
   nodeType родственный encounter, проектировать отдельно от
   него рискованно.

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

### Кандидаты после следующих 2-3 спек

Из backlog'а (entries есть, spec.md нет). Номера каждой
сдвинулись на +1 после chat 77 (spec-019 starter-overview занял
019, spec-020 holdings — 020, карта — 021). Финализируем номер
когда берём в работу:

- **encounter rework**
- **DM sandbox** (черновики энкаунтеров/локаций)
- **DM session control + movement events**
- **movement timeline view**
- **часы/проекты**
- **character-sheet/mobile epic** (большая, серия спек)
- **IDEA-055** (DM rename/delete на encounter page, ~30 мин)
- **IDEA-056** (Phase B structured abilities extraction для
  encounter assistant — ждёт consumer'а)

**Параллельный долг (мелкие):**
- T044 spec-012 manual walkthrough — 10 Acceptance Scenarios.
  Я (Claude) автоматизировать не могу, проверка вручную DM'ом.
- IDEA-055 DM rename/delete кнопки.

### Хвосты spec-018 (не блокеры)

- **DDHC source name** — мигр 099 села с `source_detail = 'Unknown
  D&D supplement (DDHC)'` для 6 items. Когда юзер узнает что за
  книга — заменить строку в `SOURCE_BOOKS` и перезапустить
  codegen (или просто `UPDATE` поверху).
- **Pagination hard cap 10k нод** — если кампания вырастет за
  10000 нод (не близко: сейчас ~1200), три pagination-loop'а
  упрутся. Тогда нужно: (a) count-only sidebar с on-demand
  title fetching per group, (b) infinite-scroll или page param
  на `/items`, (c) embed-side фильтрация attrs до клиента.

### Последняя строка хвостов

- IDEA-043 ✅ (chat 44) — collapsed-transfer-row в /accounting.
- Bulk-edit ещё нет (часть старого IDEA-043) — может всплыть
  отдельно если будет запрос.
- **IDEA-054 PROMOTED (chat 49)** — 🗺️ PC↔Location граф разъехался
  на spec-019 (карта, был spec-018) + spec-024 (DM session control
  + movement events, был spec-022) + spec-025 (timeline view, был
  spec-023). Историческая запись осталась в backlog'е.

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
