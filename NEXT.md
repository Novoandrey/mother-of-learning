# NEXT — актуальное состояние проекта

> Обновляется в конце каждой сессии. ТОЛЬКО текущее состояние.
> История решений: `chatlog/`.
> Last updated: 2026-04-25 (chat 52 — spec-014 Phase 3-9 + smoke scripts)

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

**Spec-014 Approval flow — В РАБОТЕ.** Phase 1–9 + smoke scripts
закоммичены (T001–T035, кроме T020/T021). Migration 042 в проде.
Тесты НЕ прогонялись локально (npm install был корраптнут);
проверка через Vercel auto-deploy и smoke SQL.

**Сделано в chat 52:**
- **Phase 3** (T007–T013) — `createTransaction` / `createTransfer`
  / `createItemTransfer` принимают `batchId?`; status выбирается
  по роли (player → pending, иначе approved); audit-поля
  заполняются при auto-approve. Auto-генерация `batch_id` для
  player'а (single-row → batch of 1) — иначе `groupRowsByBatch`
  отбросил бы запись из очереди. `submitBatch` wrapper-action
  для multi-row submission. Status-gate `'Можно править только
  pending-заявки'` в `updateTransaction` / `deleteTransaction`.
  Defensive `.eq('status','approved')` в `loadExistingAutogenRows`.
- **Phase 4** (T014–T016) — `app/actions/approval.ts` (~440 строк):
  `approveRow` / `rejectRow` (transfer-pair atomic via
  `transfer_group_id`), `approveBatch` / `rejectBatch` (per-row
  gated, partial-success counts), `withdrawRow` / `withdrawBatch`
  (author-only, hard-delete с `expected_updated_at` gate).
  Возвращают `{ ok: false, stale: true }` при rowcount=0.
- **Phase 5** (T017–T019) — `lib/approval-queries.ts`:
  `getPendingCount` через `idx_tx_pending`, `getPendingBatches`
  (heads → full rows, role-filtered), `getBatchById`. Exported
  helpers `JOIN_SELECT`, `TxJoinedRow`, `hydrateTxJoinedRows`,
  `hydrateCategoryLabels` / `hydrateAuthors` /
  `hydrateCounterparties` из `lib/transactions.ts` для переиспользования.
  Plus `getRecentDMActionSummary` + `markDMActionsSeen` для FR-027.
- **Phase 7** (T022, T023) — `transaction-row.tsx` status-aware:
  amber border-left + «⏳ Ждёт DM» для pending; gray + strikethrough
  + «✗ Отклонено» + чип с `rejection_comment` для rejected.
  `dedupTransferPairs` теперь группирует по `(transfer_group_id, status)`
  — defensive вне-FR-004 mixed-status pair НЕ коллапсится. Два новых
  vitest теста.
- **Phase 8** (T024–T030) — `<AccountingSubNav>` (Лента / Очередь
  + secondary actions, highlight через `usePathname`); page
  `/c/[slug]/accounting/queue`; `<QueueList>` server +
  `<QueueBatchCard>` client (collapsed/expanded, summary-line,
  status-чипы, per-row + batch actions для DM, withdraw для author,
  inline reject-comment, `useTransition` + `router.refresh()`,
  обработка stale).
- **Phase 9** (T031–T033) — count badge на `Бухгалтерия` tab
  (`nav-tabs.tsx` + layout добавляет `getPendingCount` в Promise.all,
  visible только DM/owner). `<DMActionToast>` для player на
  /accounting (auto-dismiss 8с, mark-as-seen в server-pass).
- **Phase 10** (T034, T035) — `scripts/check-rls-014.sql` (6 RLS
  кейсов) + `scripts/check-approval-constraints-014.sql` (8 CHECK
  кейсов), оба в `BEGIN…ROLLBACK`. Запускать через Supabase
  Dashboard.

**ОТЛОЖЕНО на следующий чат (T020/T021 — multi-row form):**
Существующая `components/transaction-form.tsx` (770 строк, stash-pinned
modes, transfer recipient picker, shortfall prompt) — single-row.
Игрок может подавать только **по одной** заявке через текущий UI,
каждая становится отдельной «пачкой из 1». Это закрывает AS1–AS6,
AS15 (withdraw row), AS16 (partial). НЕ закрывает AS13 (3-row
batch submission в одном клике) и `«Отозвать всю пачку»` имеет
смысл только для batch-of-1.

Минимальная реализация на следующий чат:
- `<PlayerBatchForm>` — отдельный простой компонент (money/item/transfer
  × N rows) на `/accounting`.
- ИЛИ — рефактор `transaction-form.tsx` lifting state в `rows: BatchRowState[]`.

**ОТЛОЖЕНО (proper close-out):**
- T036–T039 — manual walkthrough Acceptance Scenarios (DM only).
- T040 — `npm run lint` + `tsc --noEmit` + vitest. Делать после
  T020/T021 либо параллельно через Vercel CI.
- T041–T044 — close-out final.

**Pickup в следующем чате:**
1. Свежий клон.
2. `cd mat-ucheniya && rm -rf node_modules .next && npm install` — Vercel build уже валидировал.
3. Implement T020/T021 (см. выше — два варианта).
4. После — T036–T044.

Чек-лист в `.specify/specs/014-approval-flow/tasks.md`. Сделано:
T001–T019, T022–T035 (29 из 44). Осталось: T020, T021, T036–T044
(15 задач).

**Ключевые решения spec-014** (для контекста, чтобы не перечитывать
spec.md и plan.md):
- Player → `status='pending'`, DM/owner → `status='approved'` сразу.
- Multi-row форма (player only), submit-as-batch с общим `batch_id`.
- Withdraw = hard-delete (нет нового статуса). Edit-in-place.
- Очередь — таб «Очередь» в `/c/[slug]/accounting`, role-filtered.
- Pending видны всем, не учитываются в балансах. Rejected тоже видны
  всем, навсегда.
- Concurrent edit detection — через `WHERE updated_at = ?` gate.
- DM-бейдж в nav-tabs; player-toast при заходе на /accounting.

**После spec-014** — IDEA-055 (DM rename/delete на encounter page,
~30 мин), потом по бэклогу.

**После spec-013** — IDEA-055 (DM controls на encounter page —
rename + delete кнопки, ~30 минут), потом основные кандидаты:
- **Spec-016 «Сборы»** — spec.md есть, ждёт Clarify.
- **Spec-017 карта мира** — заявлена в backlog, отдельная
  фундаментальная фича (5-7 дней).
- **Spec-020 правила/хомрулы** — заявлена в backlog, средняя
  по размеру.

**Заявлены в backlog (entries есть, spec.md нет):** 017 (карта),
018 (encounter rework), 019 (DM sandbox), 020 (правила/хомрулы),
021 (DM session control), 022 (movement timeline), 023 (часы/
проекты), 024+ (character-sheet/mobile epic). IDEA-055 (DM
encounter controls) — новая в chat 50.

**Параллельный долг (мелкие):**
- T044 manual walkthrough — 10 Acceptance Scenarios из spec-012
  spec.md в проде. Я (Claude) автоматизировать не могу, проверка
  вручную DM'ом.
- IDEA-055 DM rename/delete кнопки (после spec-013).

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
