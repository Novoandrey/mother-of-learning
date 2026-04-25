# NEXT — актуальное состояние проекта

> Обновляется в конце каждой сессии. ТОЛЬКО текущее состояние.
> История решений: `chatlog/`.
> Last updated: 2026-04-25 (chat 53 — spec-014 close-out, smoke-script
> fixes; spec-014 в проде happy-flow подтверждён)

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

**Vercel:** https://mother-of-learning.vercel.app/
**GitHub:** https://github.com/Novoandrey/mother-of-learning
**Последняя применённая миграция:** `042_approval_flow.sql` (chat 51)

## Следующий приоритет

**Spec-015 Item catalog integration** — старт. Spec/plan/tasks ещё
нет, нужен phase **Specify**.

Контекст из `bookkeeping-roadmap.md`:
- Предмет как нода типа `item`. `transactions.item_node_id`
  (nullable). Таймлайн владения = query по transactions с этим
  `item_node_id`.
- Каталог предметов как app-слой поверх нод-данных. Поля: цена в
  GP, вес в фунтах, описание, ссылка на источник (book / page /
  URL), категория (weapon/armor/consumable/magic-item/wondrous/
  tool/...), редкость (для магических). DM-only на запись, всем
  на чтение.
- Каталог покрывает и обычные предметы (longsword, rope, rations),
  не только магические — для дедупа (typeahead вместо ноды-дублей
  «Longsword» / «long sword» / «Длинный меч»).
- SRD-импорт как первичный сид: ~300 предметов из SRD 5e + ~100
  магических. (Раньше было заявлено как опциональный spec-016 —
  теперь часть spec-015.)
- Связь с spec-013 (encounter loot): после spec-015 item-поля в
  loot draft получают опциональный `item_node_id`; backfill
  существующих item-транзакций по name → item_node_id —
  post-spec-015 миграция.

**Pickup для нового чата:**
1. Свежий клон.
2. Прочитать `.specify/memory/bookkeeping-roadmap.md` → секцию
   spec-015.
3. Прочитать backlog'и TECH-011 (категории keep/kill — связано
   с item-классификацией) и TECH про `actor_pc_id`→`actor_node_id`.
4. Запустить **Specify** phase: `.specify/specs/015-*/spec.md`
   (название кампании в slug-папке: пример выше — `015-item-
   catalog-integration` или короче). Прислать spec.md, дождаться
   ok.

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
