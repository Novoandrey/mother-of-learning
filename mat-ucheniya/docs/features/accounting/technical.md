# Бухгалтерия — под капотом

> Детали реализации транзакционного слоя: чистые хелперы, CHECK-констрейнты,
> transfer-пара, autogen-reconcile. Для разработчиков.

---

## Слой чистых хелперов

Вся нетривиальная бизнес-логика вынесена в pure-функции без I/O:

- **`lib/transaction-dedup.ts`** — схлопывание transfer-пар в sender leg для
  глобальной ленты. `isSenderLeg()` определяет, какая нога является
  отправляющей (отрицательная сумма для money, отрицательный `item_qty` для
  item). `dedupTransferPairs<T>()` — идемпотентна, группирует по
  `(transfer_group_id, status)`: смешанные по статусу пары (data corruption)
  не схлопываются. `countDistinctEvents()` — считает события без двойного
  счёта transfer-пар.

- **`lib/approval.ts`** — группировка ленты в `PendingBatch[]` и агрегация
  сводки батча (`BatchSummary`). `groupRowsByBatch()` сортирует пачки
  «новейшая сверху» по `submittedAt` (минимальному `created_at` в батче).
  Строки с `batch_id = null` (DM-записи, autogen) из очереди исключаются.
  `isStaleError()` — narrow-helper для обработки FR-028 staleness на клиенте.

- **`lib/approval-policy.ts`** — единственное место, где живёт правило
  «DM/owner → `approved`, player → `pending`». Исключение — stash put/take
  с `autoApprove = true` проходят напрямую даже для игрока (C-05 спеки 011).

- **`lib/autogen-reconcile.ts`** — переиспользуемые примитивы autogen-цикла:
  `computeAutogenDiff()` загружает существующие autogen-строки + tombstones,
  выполняет diff, применяет FR-014 orphan-фильтр (строки PC, которого уже
  нет в кампании, не удаляются), гидрирует названия акторов для
  confirm-диалога. `applyAutogenDiff()` вызывает Postgres RPC
  `apply_loop_start_setup` с тремя payload-ами (`toInsert`, `toUpdate`,
  `toDeleteIds`). Несмотря на название, RPC параметрически обобщённый:
  spec-013 (encounter loot) использует ту же функцию с другим
  `sourceNodeId`.

---

## CHECK-констрейнты

Две миграции устанавливают финансовые инварианты на уровне Postgres:

**Миграция 034** — согласованность `kind` с полями:
- `transactions_item_has_no_coins` — `kind='item'` ⇒ все монеты = 0.
- `transactions_item_has_name` — `kind='item'` ⇒ `item_name` непуст.
- `transactions_money_no_item_name` — `kind≠'item'` ⇒ `item_name IS NULL`.
- `transactions_money_nonzero` — `kind≠'item'` ⇒ хотя бы одна монета ≠ 0.
- `transactions_transfer_has_group` — `kind='transfer'` ⇒ `transfer_group_id IS NOT NULL`.

**Миграция 042** — констрейнт `transactions_approval_consistency`:
- `status='approved'` ⇒ `approved_at IS NOT NULL`, все rejected-поля null.
- `status='rejected'` ⇒ `rejected_at IS NOT NULL`, все approved-поля null.
- `status='pending'` ⇒ все audit-поля null.

`user_id`-колонки допускают `NULL` (политика ON DELETE SET NULL на
`auth.users`) — история сохраняется даже если аккаунт удалён.

---

## Transfer-пара: атомарность

Server action `createTransfer` (в `app/actions/transactions.ts`)
вставляет **обе ноги** одним `supabase.insert([leg1, leg2])` внутри
транзакции через `adminClient`. Если insert падает — обе строки
откатываются. Нет частично созданных transfer-пар.

Редактировать одну ногу `kind='transfer'` через `updateTransaction` нельзя —
action явно проверяет `kind` и возвращает ошибку. Удаление тоже атомарное:
`deleteTransfer` удаляет обе строки по `transfer_group_id`.

---

## Item ownership guard

`createItemTransfer` (перевод предмета между акторами) перед insert
агрегирует текущий инвентарь отправителя: `getInventoryAt(actorPcId, loop, day)`.
Если qty предмета на момент операции недостаточно — action возвращает ошибку.
Это защита от отрицательного инвентаря на уровне приложения; DB не блокирует
отрицательный `SUM(item_qty)` — инвариант держится в коде.

---

## Server actions: auth gate

Все write-actions в `app/actions/transactions.ts` следуют одному паттерну:
1. `resolveAuth(campaignId)` — получает `{userId, role}`, падает если нет
   сессии или membership.
2. Для `player` — проверка `isPcOwner(actorPcId, userId)` через
   `node_pc_owners`.
3. `isAutoApproved(role, autoApprove?)` определяет `status`.
4. Запись идёт через `createAdminClient()` — RLS не блокирует, логика
   гейтинга полностью на уровне приложения.

Telegram Mini App (`/tg`, spec-044/046) проходит те же server actions — нет
отдельного пути для tg. GoTrue cookie сессия устанавливается через
`/api/tg/auth` при первом заходе.

---

## Тесты

Чистые хелперы покрыты vitest в `lib/__tests__/`:

| Файл теста | Что тестирует |
|---|---|
| `approval.test.ts` | `groupRowsByBatch`, `summariseBatch`, `isStaleError` |
| `transaction-dedup.test.ts` | `dedupTransferPairs`, `isSenderLeg`, `countDistinctEvents` |
| `starter-setup-resolver.test.ts` | `resolveDesiredRowSet`, `canonicalKey` |
| `starter-setup-diff.test.ts` | `diffRowSets` — diff desired vs existing |
| `starter-setup-affected.test.ts` | `identifyAffectedRows` — hand-touched detection |
| `apply-default-prices.test.ts` | `computeApplyPlan` — skip conditions |

Весь тест-сьют (~410 тестов суммарно по всему `lib/__tests__/`) прогоняется
в CI как `vitest run` без DB. SQL-smoke скрипты (ручные):
`scripts/check-approval-constraints-014.sql`, `scripts/check-rls-014.sql`.

---

> См. также: [`README.md`](README.md) — общий обзор;
> [`approval-queue.md`](approval-queue.md) — UX очереди;
> [`starter-setup.md`](starter-setup.md) — autogen-транзакции;
> [`../../concepts/event-sourcing.md`](../../concepts/event-sourcing.md) — append-only лог.
