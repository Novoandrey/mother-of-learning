# Tasks: Transactions Ledger

**Input**: `spec.md`, `plan.md` in `specs/010-transactions-ledger/`
**Updated**: 2026-04-23
**Tests**: `vitest` on pure utilities (resolver, formatter,
validator). Everything else = manual against Acceptance Scenarios
in `spec.md` (as in spec-009 — one person project, no CI yet).

## Organization

Phase 1 (migration) blocks every follow-up: tables and seeds must
exist before any query runs.
Phases 2–5 are **P1 foundation**: pure utils, query layer, server
actions, core UI building blocks. All P1 stories (US1–US4) depend
on these being done.
Phases 6–8 are **P1 user stories** (US1 form / US2 wallet block /
US3 ledger). Each is independently demo-able once its phase lands.
Phase 9 adds the "Бухгалтерия" nav entrypoint.
Phases 10–12 are **P2 stories** (US5 transfer / US6 item /
US7 DM category settings) — can ship in the same PR as P1 or as
follow-ups.
Phase 13 is a **P3 stretch**: transactions on the session page.
Phase 14 is close-out (lint/typecheck/docs/commit).

Device contract (from plan `## Device & Mode Contract`):
player-facing components are mobile-first; DM-facing (filter bar,
settings) are desktop-primary and responsive-degraded on mobile.

## Format: `[ID] [P?] [Priority] Description (file: path)`

`[P]` = can run in parallel with other `[P]` tasks in the same
phase (no shared file). Priority: P1 = MVP, P2 = important,
P3 = nice-to-have.

---

## Phase 1: Migration

**Purpose**: Create `categories` (scoped) + `transactions`
tables, indexes, RLS policies, seed defaults for mat-ucheniya.

**⚠️ Idempotent & non-destructive.** New tables only; no
`ALTER` on existing tables. Rollback = `drop table …`.

- [x] **T001** [P1] Write `mat-ucheniya/supabase/migrations/034_transactions_ledger.sql`:
  - `create table categories` with columns per plan `## Data Model` (campaign_id FK, scope CHECK IN ('transaction','item'), slug, label, sort_order, is_deleted, created_at); `unique (campaign_id, scope, slug)`; partial index `(campaign_id, scope) WHERE is_deleted = false`
  - `create table transactions` with all CHECK constraints (`transactions_item_has_no_coins`, `transactions_item_has_name`, `transactions_money_no_item_name`, `transactions_money_nonzero`, `transactions_transfer_has_group`, `transactions_day_range`)
  - Indexes per plan: `idx_tx_campaign_created`, `idx_tx_pc_loop`, `idx_tx_session`, `idx_tx_transfer_group`, `idx_tx_campaign_category`
  - `updated_at` trigger (`touch_transactions_updated_at`)
  - Enable RLS on both tables + policies per plan (`categories_select`, `categories_modify`, `tx_select`, `tx_modify`)
  - Seed the 6 defaults for mat-ucheniya (scope='transaction'): income/Доход/10, expense/Расход/20, credit/Кредит/30, loot/Добыча/40, transfer/Перевод/50, other/Прочее/100 — scoped via `select c.id from campaigns c where c.slug = 'mat-ucheniya'`, `on conflict do nothing`
  - Wrap in `begin; … commit;`
  - **Call `present_files` after writing** (project rule)
- [x] **T002** [P1] User applies migration in Supabase (manual step). Wait for confirmation before Phase 2.

**Checkpoint**: `categories` + `transactions` tables exist with RLS; mat-ucheniya has 6 seeded categories (scope='transaction'); existing data untouched.

---

## Phase 2: Vitest setup + types

**Purpose**: Dev-dep for pure-unit tests + canonical type
definitions used by every follow-up file.

- [x] **T003** [P1] Install vitest and wire `npm run test`:
  - Add `vitest` to `devDependencies` in `mat-ucheniya/package.json`
  - Add `"test": "vitest run"` to `scripts`
  - Create minimal `mat-ucheniya/vitest.config.ts` (Node env, tsconfig-paths for `@/…`)
  - Smoke-check: `npm run test` passes with zero test files
- [x] **T004** [P1] Create type definitions in `mat-ucheniya/lib/transactions.ts` (types only — queries come later):
  - `CoinSet`, `TransactionKind`, `TransactionStatus`
  - `Transaction`, `TransactionWithRelations`, `Wallet`, `Category` (per plan `## Server Layer → Types`)
  - Export everything; no implementations yet

**Checkpoint**: `npm run test` runs; `lib/transactions.ts` exports types.

---

## Phase 3: Pure utilities (parallelizable)

**Purpose**: DENOMINATIONS map, coin resolver, display
formatter, validators. Zero DB dependencies — easy to test and
review in isolation.

- [x] **T005** [P1] [P] Write `mat-ucheniya/lib/transaction-resolver.ts`:
  - Export `DENOMINATIONS: readonly Denom[] = ['cp','sp','gp','pp']`
  - Export `GP_WEIGHT: Record<Denom, number>` with correct ratios
  - `aggregateGp(coins)` — reduce over DENOMINATIONS
  - `resolveSpend(holdings, target_gp): CoinSet` — smallest-first, whole coins only, no breaking; returns negated CoinSet (per plan)
  - `resolveEarn(target_gp): CoinSet` — credits to gp pile
  - `signedCoinsToStored(negate, coins)` — uses DENOMINATIONS
- [x] **T006** [P1] [P] Write `mat-ucheniya/lib/transaction-format.ts`:
  - `formatAmount(coins: CoinSet): string` — e.g. `−5 GP (2 g, 20 s, 100 c)`; collapses to single-denom case (`5 GP`); zero → `—`
  - `DENOM_SHORT: { cp:'c', sp:'s', gp:'g', pp:'p' }`
  - Iterates over DENOMINATIONS from resolver (no hard-coded order)
- [x] **T007** [P1] [P] Write `mat-ucheniya/lib/transaction-validation.ts`:
  - `validateAmountSign(amountGp)` — non-zero, sign required
  - `validateDayInLoop(day, loopLength)` — 1..loopLength
  - `validateTransfer(senderId, recipientId, senderLoop, recipientLoop)` — self-transfer blocked, cross-loop blocked
  - `validateCoinSet(coins)` — integers, at least one non-zero, no negative-zero
- [x] **T008** [P1] [P] Write `mat-ucheniya/lib/__tests__/transaction-resolver.test.ts` covering: exact match (500cp for 5gp), small-only partial (100cp + 1gp for 2gp), no small coins, insufficient holdings (partial return), earn path, cp-precision rounding
- [x] **T009** [P1] [P] Write `mat-ucheniya/lib/__tests__/transaction-format.test.ts` covering: single-denom collapse (`5 GP`, not `5 GP (5 g)`), multi-denom breakdown, negative-sign placement, zero → `—`
- [x] **T010** [P1] [P] Write `mat-ucheniya/lib/__tests__/transaction-validation.test.ts` covering: zero amount rejected, day out-of-range rejected, transfer-to-self rejected, cross-loop transfer rejected

**Checkpoint**: `npm run test` green; utilities importable from other modules.

---

## Phase 4: Seeds + query layer

**Purpose**: Seed helper for new campaigns + read-side queries
for wallets, ledger feed, and categories.

- [x] **T011** [P1] Write `mat-ucheniya/lib/seeds/categories.ts`:
  - `seedCampaignCategories(supabase, campaignId)` inserts the 6 defaults with `scope='transaction'`, `on conflict do nothing`
  - Idempotent, safe to call multiple times
- [x] **T012** [P1] Modify `mat-ucheniya/lib/campaign-actions.ts`:
  - After `seedCampaignSrd(supabase, campaignId)`, call `await seedCampaignCategories(supabase, campaignId)`
  - Add to the returned `InitializeCampaignResult` summary if desired (optional)
- [x] **T013** [P1] Write `mat-ucheniya/lib/categories.ts`:
  - `listCategories(campaignId, scope, { includeDeleted? })` — server-side query
  - Uses `unwrapOne` / `unwrapMany` if joins happen (unlikely here)
- [x] **T014** [P1] Extend `mat-ucheniya/lib/transactions.ts` with query functions (depends on T004 types):
  - `getWallet(pcId, loopNumber): Promise<Wallet>` — `SUM()` aggregate where `actor_pc_id = ? AND loop_number = ? AND status = 'approved'`
  - `getRecentByPc(pcId, loopNumber, limit)` — returns `TransactionWithRelations[]` joined to category + session
  - `getLedgerPage(campaignId, filters, cursor, pageSize): LedgerPage` — cursor-based pagination, filter WHERE clause; includes a summary subquery for `{count, distinctPcs, netAggregateGp}` with the same WHERE
  - `getTransactionById(id)` — for edit view
  - `getTransferPair(groupId)` — returns `[legA, legB]` or null
  - All use `unwrapOne` for joined shapes

**Checkpoint**: Queries compile; `listCategories(matUcheniyaId, 'transaction')` returns 6 rows after migration.

---

## Phase 5: Server actions (money + transfer, but transfer is P2)

**Purpose**: Write-side server actions with explicit ownership
checks. Pattern from `updateSessionParticipants`.

- [x] **T015** [P1] Write `mat-ucheniya/app/actions/transactions.ts` — **money only** (P1 subset):
  - `createTransaction(input: CreateTransactionInput)` — money/item kinds; ownership check (author is PC owner OR DM/owner); uses `resolveSpend`/`resolveEarn`; inserts via admin client
  - `updateTransaction(id, input)` — fetches existing, verifies author OR DM, applies validation, updates via admin client; for transfers → forbid in this action (they go through `updateTransfer`)
  - `deleteTransaction(id)` — fetches, verifies author OR DM, hard-deletes; for transfers → forbid (use `deleteTransfer`)
  - All actions return `{ ok: true, ... } | { ok: false, error: string }` — Russian error messages, matches project pattern
  - No `invalidateSidebar` calls (transactions aren't in the sidebar cache)

**Checkpoint**: A player on mat-ucheniya can create a money transaction via this action against a PC they own; wallet query returns the expected balance.

---

## Phase 6: Core UI building blocks

**Purpose**: Small, composable, mostly-pure client components
that the form and lists will compose.

- [x] **T016** [P1] [P] Write `mat-ucheniya/components/amount-input.tsx` (client, mobile-first):
  - Default mode: single "gp-equivalent" numeric field with +/− toggle
  - "per-coin details…" link expands four numeric inputs (cp/sp/gp/pp); collapses on outside tap
  - Controlled component; `onChange` emits `{ mode: 'gp', amount } | { mode: 'denom', coins }`
  - Uses tokens from STYLE.md (standard input)
- [x] **T017** [P1] [P] Write `mat-ucheniya/components/category-dropdown.tsx` (client, mobile-first):
  - Props: `campaignId`, `scope: 'transaction' | 'item'`, `value`, `onChange`
  - Fetches categories client-side via a server action (or accepts a prefetched list)
  - Renders a native `<select>` on mobile for OS-native picker UX; on `md+` can upgrade to a custom dropdown (MVP: native select everywhere)
  - Reusable in spec-015 by flipping `scope='item'`
- [x] **T018** [P1] [P] Write `mat-ucheniya/components/wallet-balance.tsx` (client, pure presentation):
  - Props: `wallet: Wallet`
  - Renders aggregate gp primary (`75.00 GP`), per-denom caption (`0 c · 3 s · 75 g · 0 p`)
  - Reuses `aggregateGp` + `formatAmount` from pure utils

**Checkpoint**: All three components render in isolation in the Next dev server (we don't have Storybook — just drop them into a throwaway page to eyeball).

---

## Phase 7: Transaction form + sheet (US1, P1)

**Purpose**: The ≤ 3-field mobile flow at the table.

- [x] **T019** [P1] Write `mat-ucheniya/components/transaction-form.tsx` (client, mobile-first):
  - **P1 scope: `kind = 'money'` only.** Kind switcher is visible but `item` / `transfer` tabs are disabled in this phase (enabled in P2 phases 10/11).
  - Fields: `<AmountInput>` (slot 1), `<CategoryDropdown>` (slot 2), comment text input (slot 3)
  - Auto-filled caption below: `Петля N · день D · нет сессии` (or session title if linked). Caption expands into inline editors on tap (loop / day / session selectors)
  - Props: `campaignId`, `actorPcId`, `defaultLoopNumber`, `defaultDayInLoop`, `defaultSessionId`, `editing?`
  - On submit, calls `createTransaction` or `updateTransaction` action
  - Error handling: inline red-50 banner with Russian message from action response
- [x] **T020** [P1] Write `mat-ucheniya/components/transaction-form-sheet.tsx` (client, responsive wrapper):
  - Bottom sheet on small viewports (`max-width: md`); centered modal on `md+`
  - Mounts `<TransactionForm>` with passed-through props
  - Handles open/close state; dismisses on successful save

**Checkpoint**: US1 acceptance scenarios 1, 3, 4, 5, 7 pass via manual walkthrough from a scratch test page (scenarios 2 and 6 need phases 10/11).

---

## Phase 8: Wallet block + PC catalog integration (US2, P1)

**Purpose**: The player's home screen shows balance and recent activity.

- [x] **T021** [P1] Write `mat-ucheniya/components/wallet-block.tsx` (server, mobile-first):
  - Props: `pcId`, `campaignId`
  - Fetches `getWallet(pcId, currentLoopNumber)` + `getRecentByPc(pcId, currentLoopNumber, 10)` in `Promise.all`
  - Renders `<WalletBalance>` + a compact list of 10 recent rows + "View all →" link to `/c/[slug]/accounting?pc=<id>`
  - "+ Transaction" button mounts `<TransactionFormSheet>` (client sub-component wrapping the button + sheet state)
  - Edit/delete affordances on each row: visible when `author_user_id === currentUserId` OR user is owner/dm
  - Empty state: "В этой петле пока нет транзакций" + the "+ Transaction" CTA
  - Fallback when no current loop exists: render lifetime aggregate + a caption explaining the fallback (per FR-015)
- [x] **T022** [P1] Modify `mat-ucheniya/app/c/[slug]/catalog/[id]/page.tsx`:
  - If the loaded node is `type='character'`, render `<WalletBlock pcId={node.id} campaignId={campaign.id} />` above the existing detail UI (near the character-frontier card from spec-009)
  - No-op for other node types (no regression on NPC / location pages)

**Checkpoint**: US2 acceptance scenarios 1–4 pass on mat-ucheniya production data; wallet balance matches hand-computed SUM.

---

## Phase 9: Ledger page + nav (US3, P1 + US4 wiring)

**Purpose**: The full "Бухгалтерия" app surface. Also wires
edit/delete from the ledger (completes US4 acceptance scenarios
1–4).

- [x] **T023** [P1] Write `mat-ucheniya/components/ledger-row.tsx` (server, responsive):
  - Single-column stacked layout on mobile; table-like row on `md+`
  - Columns (desktop): `Loop N · Day D`, PC actor (link), kind + category, amount (via `formatAmount`), comment, session link, author
  - Edit/delete buttons rendered when `canEdit = isDmOrOwner || row.author_user_id === currentUserId`; buttons open `<TransactionFormSheet>` in edit mode or trigger `deleteTransaction`
  - Graceful "[deleted character]" / "[deleted session]" when joined rows are null
- [x] **T024** [P1] Write `mat-ucheniya/components/ledger-filters.tsx` (client, desktop-primary):
  - Controls: PC multi-select, loop multi-select, day-from / day-to numeric inputs, category multi-select, kind checkboxes, "Clear filters" button
  - URL-synced via `useSearchParams` + `router.push` with merged query
  - On mobile: the bar collapses into a single "Фильтры" button that opens a bottom sheet hosting the same controls (per device contract)
- [x] **T025** [P1] Write `mat-ucheniya/components/ledger-list.tsx` (server + thin client wrapper):
  - Server part: reads URL params, calls `getLedgerPage` with filters, renders summary header (`N транзакций · M игроков · net ±X GP`) + first page of rows + `<LedgerFilters>`
  - Client part: "Load more" button that requests the next page via a `loadMoreAction` (server action) and appends rows
- [x] **T026** [P1] Write `mat-ucheniya/app/c/[slug]/accounting/page.tsx`:
  - `export const dynamic = 'force-dynamic'`
  - Auth gate: `requireAuth()` + `getMembership(campaign.id)` (players allowed; members only)
  - Mounts `<LedgerList campaignId={campaign.id} />`; passes initial URL-sync'd filters
  - `generateMetadata`: `Бухгалтерия — ${campaign.name}`
- [x] **T027** [P1] Modify `mat-ucheniya/app/c/[slug]/layout.tsx`:
  - Add a "Бухгалтерия" link to the top-level campaign nav, pointing at `/c/[slug]/accounting`
  - Visible to every member (no role gate at the link level)

**Checkpoint**: US3 acceptance scenarios 1–5 pass; US4 scenarios 1–4 pass via the ledger page.

---

## Phase 10: Transfer (US5, P2)

**Purpose**: Two-legged atomic-ish transfer. Unblocks spec-011 (стах) since that spec uses the same primitive.

- [x] **T028** [P2] [P] Write `mat-ucheniya/components/transfer-recipient-picker.tsx`:
  - Searchable single-select of campaign PCs, excluding sender
  - Reuses `getCampaignPCs` action (already in `app/actions/characters.ts` from spec-009)
- [x] **T029** [P2] Extend `mat-ucheniya/components/transaction-form.tsx` with transfer mode:
  - Enable the "Перевод" tab in the kind switcher
  - When kind='transfer', replace amount sign toggle with a fixed outflow sign, show `<TransferRecipientPicker>` below the amount
  - Client-side pre-validation: sender ≠ recipient (uses `validateTransfer`)
- [x] **T030** [P2] Extend `mat-ucheniya/app/actions/transactions.ts` with `createTransfer` / `updateTransfer` / `deleteTransfer`:
  - `createTransfer(input)` — validates; `transfer_group_id = crypto.randomUUID()`; resolves sender outflow via `resolveSpend`; inserts two rows in one `.insert([legA, legB])` call
  - `updateTransfer(groupId, input)` — fetches both legs via `getTransferPair`, applies updates to both (two UPDATEs, last-write-wins)
  - `deleteTransfer(groupId)` — deletes both legs in one DELETE with `where transfer_group_id = $1`
  - Block player from recipient-side edits: a player can initiate a transfer (they're the author on both legs), but a *different* player who owns the recipient PC cannot independently edit "their" leg — the author-check handles this.

**Checkpoint**: US5 acceptance scenarios 1–5 pass.

---

## Phase 11: Item transactions (US6, P2)

**Purpose**: Free-text item breadcrumbs until spec-015.

- [x] **T031** [P2] Extend `mat-ucheniya/components/transaction-form.tsx` with item mode:
  - Enable the "Предмет" tab in the kind switcher
  - When kind='item', swap `<AmountInput>` for a single-line item-name text input; coin-level fields are hidden; comment slot stays
  - Client-side validation: `item_name` required and non-empty when kind='item'
- [x] **T032** [P2] Extend `mat-ucheniya/app/actions/transactions.ts` with item handling in `createTransaction`:
  - When input kind='item', enforce `item_name` presence, zero all coin columns, skip resolver
  - Item rows have no monetary effect — existing wallet query already excludes them via `amount_*` columns being zero
- [x] **T033** [P2] Update `mat-ucheniya/components/ledger-row.tsx`:
  - Item rows show the item name in the amount slot, `—` for aggregate, and the summary net-gp excludes them
- [x] **T034** [P2] Update `mat-ucheniya/components/ledger-filters.tsx`:
  - When `kind` filter includes only `item`, the summary's "net gp" is labelled as "—" (item-only view has no monetary sum)

**Checkpoint**: US6 acceptance scenarios 1–3 pass; US1 scenario 6 (item shortcut in the default form) passes.

---

## Phase 12: DM category settings (US7, P2)

**Purpose**: DM curates the taxonomy from inside the accounting section.

- [x] **T035** [P2] Write `mat-ucheniya/app/actions/categories.ts`:
  - `listCategoriesAction(campaignId, scope, includeDeleted?)`
  - `createCategoryAction(campaignId, scope, slug, label)` — slug validation (lowercase ASCII `a-z 0-9 _ -`), gates on `is_dm_or_owner`
  - `renameCategoryAction(campaignId, scope, slug, newLabel)`
  - `softDeleteCategoryAction(campaignId, scope, slug)`
  - All return `{ ok: true, ... } | { ok: false, error: string }`
- [x] **T036** [P2] Write `mat-ucheniya/components/category-settings.tsx` (client, desktop-primary):
  - Props: `campaignId`, `scope`, `canEdit`
  - Lists active categories with inline rename + soft-delete buttons
  - Collapsible "soft-deleted" section below
  - "+ Add" inline form (slug + label)
  - Takes `scope` prop — re-usable by spec-015 at an item-categories route
- [x] **T037** [P2] Write `mat-ucheniya/app/c/[slug]/accounting/settings/categories/page.tsx`:
  - `export const dynamic = 'force-dynamic'`
  - `requireAuth()` + membership check; `canEdit = role in ('owner','dm')`
  - Mounts `<CategorySettings campaignId={campaign.id} scope="transaction" canEdit={canEdit} />`
  - `generateMetadata`: `Категории транзакций — ${campaign.name}`
  - Back link to `/c/[slug]/accounting`

**Checkpoint**: US7 acceptance scenarios 1–5 pass; non-DM users get a read-only or 403 view.

---

## Phase 13: Stretch — session page transactions (P3)

- [x] **T038** [P3] [P] Modify `mat-ucheniya/app/c/[slug]/sessions/[id]/page.tsx`:
  - Add a "Транзакции" section below the existing header/participants rows
  - Compact list of transactions where `session_id = <this session>` (reuse `<LedgerRow>` if the layout fits)
  - Empty state: "На этой сессии транзакций нет"

**Checkpoint**: Optional. Can ship later.

---

## Phase 14: Close-out

- [x] **T039** [P1] Run lint + typecheck: `cd mat-ucheniya && npm run lint && npx tsc --noEmit`. Fix any errors.
- [x] **T040** [P1] Run tests: `cd mat-ucheniya && npm run test`. All pure-util tests green.
- [ ] **T041** [P1] Manual smoke walkthrough on mat-ucheniya production data:
  - Create a money transaction from a PC page (mobile viewport in DevTools) — US1
  - Verify wallet block on PC page — US2
  - Open `/c/<slug>/accounting` and filter by PC and loop — US3
  - Edit and delete own transaction — US4
  - (If P2 done) issue a transfer between two PCs — US5
  - (If P2 done) record an item — US6
  - (If P2 done) add a category from settings — US7
- [x] **T042** [P1] Mark all `[ ]` → `[x]` in this `tasks.md` as they complete
- [ ] **T043** [P1] Update `NEXT.md`:
  - Move "spec-010 Transactions ledger" from "Следующий приоритет" into "В проде сейчас"
  - Set next priority to spec-011 Common stash
  - Bump last applied migration to `034_transactions_ledger.sql`
- [ ] **T044** [P1] Add a `chatlog/YYYY-MM-DD-chatNN-spec-010-transactions-ledger.md` entry per `chatlog/README.md` template
- [ ] **T045** [P1] Update `backlog.md` if anything new surfaced during implement (e.g. materialized-view follow-up, bulk-edit follow-up, collapsed-transfer-row view)
- [ ] **T046** [P1] Git commit + push:
  - Conventional-style message: `feat(spec-010): transactions ledger`
  - Push to `main`, Vercel auto-deploys

**Checkpoint**: Feature in prod, docs synced, ready for spec-011 in a new chat.

---

## Dependency Graph (abbreviated)

```
T001 → T002 → T003 ─┬─ T004 ─┐
                    │         ├─→ T005,T006,T007 [P] ─┐
                    │         │    T008,T009,T010 [P] ─┤
                    │         │                         │
                    │         ├─→ T011 → T012            │
                    │         │         T013             │
                    │         │         T014 ────────────┤
                    │         │                         ↓
                    │         │              T015 (server action, P1)
                    │         │                         ↓
                    │         └─→ T016,T017,T018 [P] ──→ T019 → T020
                    │                                    ↓
                    │                                  T021 → T022  (US2)
                    │
                    │                                  T023,T024 [P] → T025 → T026 → T027  (US3 + nav)
                    │
                    └─→ P2 phases (10/11/12) parallel with each other after P1 lands

T039 … T046 at the end
```

`[P]` tasks within a phase can run in parallel:
- Phase 3: T005/T006/T007/T008/T009/T010 are all independent files
- Phase 6: T016/T017/T018 are independent files
- Phase 9: T023/T024 are independent files
- Phases 10, 11, 12 can interleave once P1 MVP is green
