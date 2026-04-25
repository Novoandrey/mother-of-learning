# Chat 52 — spec-014 Phase 3-9 + smoke scripts, 2026-04-25

## Контекст (откуда пришли)

Chat 51 закрыл Specify/Plan/Tasks для spec-014 + накатил миграцию
042 в прод + закоммитил Phase 2 (T004–T006: типы, pure helpers,
~40 тестов). Тесты не прогонялись локально — `npm install`
корраптнул node_modules в конце сессии.

Пользователь: «дальше spec014». На вопрос про локальный запуск:
«У тебя скорее не получится установить и запустить локально,
делай в прод. Делай по несколько фаз за раз насколько позволяет
лимит чата».

## Что сделано

Закрыты Phases 3–10 (T007–T035) кроме T020/T021. 29 задач из 44.

### Phase 3 — Write-side server actions

- `app/actions/transactions.ts`:
  - `CreateTransactionInput` / `TransferInput` / `ItemTransferInput`
    получили опциональный `batchId?: string`.
  - `createTransaction` / `createTransfer` / `createItemTransfer`:
    `status` = 'pending' для player, 'approved' иначе. Audit-поля
    (`approved_by_user_id`, `approved_at`) заполняются при
    auto-approve.
  - **Auto-batch_id для player**: одиночные submission'ы получают
    свежий `crypto.randomUUID()` если caller не передал свой.
    Без этого `groupRowsByBatch` отбрасывал бы single-row pending
    из очереди (FR violation). DM/owner direct writes по-прежнему
    оставляют batch_id = null.
  - Status-gate в `updateTransaction` / `deleteTransaction`:
    `auth.role === 'player' && row.status !== 'pending'` →
    «Можно править только pending-заявки» (FR-005).
  - `submitBatch({rows, campaignId})` — wrapper-action: один
    batch_id, sequential dispatch, best-effort rollback через
    `delete().eq('batch_id', batchId)` при первой ошибке.
- `lib/autogen-reconcile.ts` — defensive `.eq('status', 'approved')`
  в `loadExistingAutogenRows`. Autogen всегда создаёт approved,
  но фильтр явный — defense in depth.
- `crypto` импорт поднят в начало файла (был дублирован ниже).

### Phase 4 — Approval server actions

`app/actions/approval.ts` (новый, ~440 строк):

- `approveRow({rowId, expectedUpdatedAt})` — DM-only. Single UPDATE
  gated на `(status='pending' AND updated_at = expected)`. Для
  transfer'ов гейт по обеим ногам атомарно через
  `transfer_group_id` (read both → check both pending + sender
  updated_at match → UPDATE через `eq('transfer_group_id', g)`).
- `rejectRow` — то же + `rejection_comment`.
- `approveBatch` / `rejectBatch` — итеративные. Per-row gate'ы.
  Возвращают `{processed, stale}` — partial success.
  Hard-error short-circuit'ит и возвращается из batch.
- `withdrawRow` / `withdrawBatch` — author-only, hard-DELETE с
  `expected_updated_at` гейтом. Для transfer'ов удаляет обе ноги
  через `transfer_group_id`. `withdrawBatch` дедупит уже-удалённые
  пары (вторая нога не считается отдельным processed).
- `revalidatePath` для `/c/[slug]/accounting` + `.../queue` после
  каждого успешного действия.

### Phase 5 — Read-side queries

`lib/approval-queries.ts` (новый):

- `getPendingCount` — cheap COUNT через `idx_tx_pending`.
  Non-fatal: на ошибке возвращает 0 (badge скрывается).
- `getPendingBatches(campaignId, role, userId)` — две запроса:
  (1) heads — distinct `batch_id` среди pending в кампании
  (player → дополнительно `author_user_id = userId`); (2) full
  rows для всех найденных batch_id'ов (любой статус — для
  partial-action visibility AS14). Hydrate через
  `hydrateTxJoinedRows`. Group через `groupRowsByBatch`.
- `getBatchById(batchId, campaignId)` — single batch lookup.
- `getRecentDMActionSummary(userId, campaignId)` — для FR-027
  toast'а. Читает `accounting_player_state.last_seen_acted_at`,
  считает approved+rejected с `>= lastSeen`, возвращает
  `{approved, rejected, cutoff}` или null.
- `markDMActionsSeen` — idempotent upsert.

В `lib/transactions.ts` экспортированы: `JOIN_SELECT`, тип
`TxJoinedRow`, `hydrateCategoryLabels` / `hydrateAuthors` /
`hydrateCounterparties`, новый `hydrateTxJoinedRows`.

### Phase 7 — pending/rejected rendering

- `transaction-row.tsx`:
  - pending → amber border-left + amber background tint + чип
    «⏳ Ждёт DM».
  - rejected → gray bg + opacity-75 + чип «✗ Отклонено» +
    inline-чип с `rejection_comment` если есть. Amount
    line-through.
  - approved → unchanged.
- `lib/transaction-dedup.ts` — group key теперь
  `${transfer_group_id}|${status}`. FR-004 говорит обе ноги
  делят status, но defensive: mismatched pair НЕ коллапсится.
  Два новых vitest теста.

### Phase 8 — Queue page + sub-nav

- `components/accounting-sub-nav.tsx` — клиент-компонент с двумя
  табами (Лента / Очередь с count badge) + secondary actions
  (Общак / Стартовый сетап для DM / Категории). Active highlight
  через `usePathname`.
- `app/c/[slug]/accounting/queue/page.tsx` — server page,
  `getPendingBatches` + `<AccountingSubNav>` + `<QueueList>`.
- `components/queue-list.tsx` — server, empty state с ссылкой
  обратно в ленту.
- `components/queue-batch-card.tsx` (~430 строк, client):
  - Collapsed header: автор + время + N рядов + summary-line
    (`summarizeBatch` → монеты со знаком, кол-во предметов,
    список получателей) + status-чипы (одобрено/отклонено/в-очереди).
  - Expanded body: per-row `<TransactionRow>` + action-buttons.
  - DM actions: «✓ Одобрить» / «✗ Отклонить» per row + batch-wide
    «Одобрить всё» / «Отклонить всё». Reject открывает inline
    text input для комментария.
  - Player actions (only for own batches): «↶ Отозвать» per row +
    «↶ Отозвать всю пачку» с `confirm()`. Push-back для AS17:
    «Править» — пока no-op (нужен T020/T021).
  - `useTransition` + `router.refresh()` после действий.
  - Stale handling: ошибка показывается inline + `router.refresh()`.
  - Mounted на `/accounting` через `<AccountingSubNav>` route.

### Phase 9 — In-app signals

- `nav-tabs.tsx` принимает `accountingPendingCount` +
  `showAccountingBadge`. Badge на «Бухгалтерия» — только DM/owner
  и только когда count > 0.
- `app/c/[slug]/layout.tsx` — `getPendingCount` добавлен в
  `Promise.all` с `getMembership` + `getSidebarData`. Передаёт
  badge props.
- `components/dm-action-toast.tsx` — client. Auto-dismiss 8с +
  manual close. Ссылка «Открыть очередь».
- Mount на `/accounting`: для player'а сначала `getRecentDMActionSummary`,
  если есть — рендерим toast и сразу `markDMActionsSeen(cutoff)`
  чтобы повторный визит не показывал то же самое (idempotent
  upsert).

### Phase 10 — Smoke SQL scripts

- `scripts/check-rls-014.sql` (6 кейсов в BEGIN…ROLLBACK):
  outsider не видит транзакций, player A видит свои pending,
  player A видит pending B (FR-015 unified visibility), DM видит
  все pending, wallet-style фильтр `status='approved'` исключает
  pending, `accounting_player_state` self-only RLS блокирует
  кросс-юзер чтение.
- `scripts/check-approval-constraints-014.sql` (8 кейсов): CHECK
  ловит approved без `approved_by`, approved без `approved_at`,
  rejected без `rejected_at`, pending с audit-полями, dual-set
  audit. Принимает корректные approved/pending/rejected рядки.

## Не сделано

### T020/T021 — multi-row form (отложено сознательно)

`components/transaction-form.tsx` — 770 строк, stash-pinned modes,
transfer recipient picker, shortfall prompt. Полный refactor
(плановый ~300 строк диффа) не помещается в чат. Сейчас игрок
подаёт **по одной заявке через каждый wallet/stash button** —
каждая заявка становится batch-of-1 и появляется в очереди.

Закрыты этим: AS1–AS6 (single-row player flow), AS15 (withdraw row).
Не закрыты: AS13 (3-row batch в одном клике), AS16 (withdraw partial
batch имеет смысл только для true batch).

Вариант на следующий чат:
- A) Новый `<PlayerBatchForm>` (упрощённый, money/item/transfer × N)
  на `/accounting`, отдельный entry-point.
- B) Lift state в существующей форме в `rows: BatchRowState[]` с
  «+ Добавить ряд». Спека просит B.

### T036–T039 (manual walkthrough) + T040 (lint/build/test)

Manual walkthrough — DM-only. Lint/test — Vercel CI валидирует на
push, локально не пробовал по запросу пользователя.

## Миграции

Никаких новых миграций — 042 уже накачена в chat 51.

## Коммиты

(будет один коммит после этой записи)

## Действия пользователю (после чата)

- [ ] Прогнать `scripts/check-rls-014.sql` через Supabase Dashboard
      → ожидать «✓ All PASS (6 tests)».
- [ ] Прогнать `scripts/check-approval-constraints-014.sql` →
      ожидать «✓ All PASS (8 tests)».
- [ ] Проверить Vercel build — если упал, скинуть ошибку.
- [ ] Manual walkthrough AS1–AS6 (см. spec.md):
      - Войти как player, сделать «+ Транзакция» из wallet PC →
        запись попадает в очередь со значком «⏳ Ждёт DM», в
        баланс не учитывается.
      - DM зайти на /accounting → видит badge «1» на табе
        «Бухгалтерия», в табе «Очередь» — карточка батча.
      - DM кликает «✓ Одобрить» → строка пропадает из очереди,
        появляется в ленте как обычная зелёная.
      - Перезалогиниться как player → toast «Мастер одобрил 1…».
- [ ] Решить про T020/T021 (новый чат): A или B.

## Что помнить следующему чату

- T020/T021 — single biggest deliverable left. Без них spec-014
  закрыт на ~95% функционально, но AS13/AS16 формально не
  закрыты.
- `transaction-form.tsx` имеет stash-pinned mode (`spec-011`). При
  любом refactor'е сохранить.
- `groupRowsByBatch` отбрасывает `batch_id=null` rows. Это
  намеренно — pending всегда имеет batch_id (auto-generated).
  Если случайно появится pending row с null batch_id — баг,
  он не покажется в очереди.
- `revalidatePath` — Next 16 принимает строку с `[slug]` или с
  конкретным slug'ом. Везде использован конкретный.
- Tests: `lib/__tests__/approval.test.ts` (chat 51) +
  `lib/__tests__/transaction-dedup.test.ts` (+2 новых для
  status-defensive). Локально не прогонял.
