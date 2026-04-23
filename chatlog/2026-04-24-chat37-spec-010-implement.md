# Chat 37 — spec-010 implement, 2026-04-24

## Контекст (откуда пришли)

Chat 36 оставил spec, plan, tasks для spec-010 Transactions ledger
готовыми и закоммиченными в `.specify/specs/010-transactions-ledger/`.
Пользователь попросил проимплементить всю спеку до закрытия.

## Что сделано

Полная имплементация spec-010 — все 14 фаз, включая P2 (transfer,
item, DM-settings), P3 stretch (транзакции на session page) и
close-out.

### Модель данных
- Миграция `034_transactions_ledger.sql`: таблицы `categories`
  (multi-scope: 'transaction'/'item') + `transactions`, 6 CHECK
  констрейнтов, 5 индексов, RLS-политики, trigger `updated_at`,
  seed 6 дефолтных категорий для mat-ucheniya.

### Библиотека
- Types + server queries в `lib/transactions.ts`: `CoinSet`,
  `Transaction`, `TransactionWithRelations`, `Wallet`, `Category`,
  `TransferInput`. Queries: `getWallet`, `getRecentByPc`,
  `getLedgerPage` (keyset-пагинация), `getTransactionById`,
  `getTransferPair`, `getTransactionsBySession`.
- Pure utils: `transaction-resolver.ts` (DENOMINATIONS, GP_WEIGHT,
  resolveSpend smallest-first-no-break в cp-integer math,
  resolveEarn), `transaction-format.ts` (typographic minus, em-dash
  для нуля, breakdown largest→smallest), `transaction-validation.ts`
  (русские сообщения, все правила из плана).
- `lib/categories.ts` + seed helper `lib/seeds/categories.ts`.

### Server actions
- `app/actions/transactions.ts`: createTransaction /
  updateTransaction / deleteTransaction (money + item),
  createTransfer / updateTransfer / deleteTransfer (пара с
  `transfer_group_id`), `loadLedgerPage` wrapper для pagination.
  Ownership — owner/dm/player с проверкой `node_pc_owners` для
  creates и `author_user_id` для updates/deletes. Writes идут
  через admin client после explicit role check.
- `app/actions/categories.ts`: list / create / rename /
  softDelete / restore — create/rename/delete только для DM.

### UI компоненты
- `amount-input.tsx` — mobile-first, gp-mode и per-denom mode,
  +/− toggle с `signLocked` prop.
- `category-dropdown.tsx` — native select, prefetched или
  client-side fetch, scope-based для переиспользования в
  spec-015.
- `wallet-balance.tsx` — pure presentation,
  `75.00 GP` primary + `0 c · 3 s · 75 g · 0 p` caption.
- `transaction-form.tsx` — поддерживает все три kind'а,
  edit-mode seed через `seedAmountFromEditing`. Transfer edit
  локает kind switcher. Auto-caption с expandable loop/day
  editor.
- `transaction-form-sheet.tsx` — bottom sheet `< md`, modal
  `md+`, escape + backdrop close, body scroll lock.
- `transfer-recipient-picker.tsx` — searchable single-select
  через `getCampaignPCs`, exclude sender.
- `wallet-block.tsx` + `wallet-block-client.tsx` — server shell
  (wallet + recent + frontier day) + client wrapper
  («+ Транзакция» + edit/delete affordances).
- `ledger-row.tsx` — responsive (stacked / table-row), kind
  badges, graceful «[удалённый…]» fallbacks.
- `ledger-filters.tsx` — URL-synced через `useSearchParams` +
  `router.push`, chip-multiselect, collapsible на мобиле.
- `ledger-list.tsx` + `ledger-list-client.tsx` — server fetch +
  filter parser + summary, client «Load more» + shared edit sheet.
- `category-settings.tsx` — inline rename, soft-delete, collapsible
  deleted section, «+ Добавить» inline form.

### Pages
- `/c/[slug]/accounting` — главная ledger page.
- `/c/[slug]/accounting/settings/categories` — DM-управление
  категориями.
- Wallet block смонтирован на `/catalog/[id]` для PC-узлов.
- Секция «Транзакции» на session detail page (stretch).

### Infra
- Vitest добавлен как dev-dep, `npm run test` → 47 unit-тестов
  (resolver + format + validation), все зелёные.
- Nav tab «Бухгалтерия» 💰 в `components/nav-tabs.tsx` между
  «Факультативы» и «Участники».
- Categories seed hook в `initializeCampaignFromTemplate` — новые
  кампании получают 6 дефолтов автоматически.

## Миграции

- `034_transactions_ledger.sql` — categories + transactions tables,
  RLS, indexes, trigger, seed для mat-ucheniya.

## Коммиты

- Будет сделан после manual smoke от пользователя.

## Действия пользователю (после чата)

- [x] применить миграцию 034 в Supabase
- [ ] протестировать на prod data (T041):
  - создать money-транзакцию со страницы PC (mobile viewport)
  - проверить wallet block: balance + recent list + edit/delete
  - открыть `/accounting`, проверить фильтры (PC, loop, day, category, kind)
  - отредактировать и удалить собственную транзакцию
  - сделать transfer между двумя PC — проверить что появились обе стороны
  - создать item-транзакцию
  - добавить/переименовать/удалить категорию в /settings/categories
- [ ] задеплоить (авто через main после push)

## Что помнить следующему чату

- Session ручное переназначение в форме не сделано — caption-editor
  показывает note «будет в отдельной итерации». Если появится
  пользовательский запрос — добавить session picker.
- Ledger totals считаются в памяти без LIMIT. Materialized view на
  `(campaign_id, loop_number, actor_pc_id)` — follow-up когда
  данных станет больше. Пометить в backlog как TECH debt.
- Bulk-edit и collapsed-transfer-row view отложены (один row на
  пару вместо двух отдельных записей в ledger) — кандидаты на
  улучшение UX.
- Следующий приоритет — spec-011 Общий стах, переиспользует
  transfer primitive.
