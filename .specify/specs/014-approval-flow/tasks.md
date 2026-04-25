# Tasks: Player Transaction Approval Flow

**Spec**: `.specify/specs/014-approval-flow/spec.md`
**Plan**: `.specify/specs/014-approval-flow/plan.md`
**Created**: 2026-04-25
**Status**: Draft (Implement phase pending)

> Working mode: pick the first unchecked `[ ]`, do it, mark `[x]`,
> stop, wait for confirmation. `[P]` = parallelisable with sibling
> `[P]` tasks. Priorities: P1 = MVP, P2 = important, P3 = polish.

---

## Phase 1 — Schema

- [x] **T001 [P1]** Write migration `042_approval_flow.sql` per
  `plan.md` § Data model. Include: 6 new columns on `transactions`,
  3 partial indexes, CHECK constraint, backfill of existing
  approved rows, and `accounting_player_state` table with self-
  only RLS. Idempotent (`if not exists` everywhere).
  *(file: `mat-ucheniya/supabase/migrations/042_approval_flow.sql`)*

- [x] **T002 [P1]** Apply migration `042` locally via
  `npx supabase migration up`. Verify with the manual SELECTs at
  the bottom of the migration: every existing row has
  `approved_at IS NOT NULL` and `approved_by_user_id IS NOT NULL`;
  pending count = 0; CHECK constraint passes.
  *(depends on T001)*

- [x] **T003 [P2]** Hand the migration file to the user via
  `present_files` so they can apply to prod via Supabase
  Dashboard. (Standard repo convention — every `.sql` migration
  surfaces this way.)
  *(depends on T001)*

---

## Phase 2 — Types and pure helpers (parallel with Phase 1)

- [x] **T004 [P1] [P]** Extend `Transaction` type in
  `lib/transactions.ts`: add `batch_id`, `approved_by_user_id`,
  `approved_at`, `rejected_by_user_id`, `rejected_at`,
  `rejection_comment` (all nullable). Add new `PendingBatch` type
  per `plan.md` § Type updates. Update `rawToTransaction` mapper
  and `TxJoinedRow` shape if it references those columns.
  *(file: `mat-ucheniya/lib/transactions.ts`)*

- [x] **T005 [P1] [P]** Create `lib/approval.ts` with pure helpers:
  `groupRowsByBatch(rows)`, `summarizeBatch(batch)`,
  `validateBatchRowInputs(rows)`, `isStaleError(result)`. No
  Supabase imports — strictly pure, takes hydrated rows in,
  returns shaped output. Plus types: `BatchRowInput`,
  `BatchSummary`, `ValidationError`, `ApprovalResult`.
  *(file: `mat-ucheniya/lib/approval.ts`)*

- [x] **T006 [P1] [P]** Write vitest tests for `lib/approval.ts`.
  Target: 25–30 cases covering grouping (empty / single batch /
  multi batch / mixed-status batches / transfer-pair sharing
  batch_id / null batch_id excluded / sort order), summarizing
  (multi-denom money totals, item counts, transfer recipients,
  mixed kinds, rejected rows excluded), validation (empty rows,
  transfer with one leg, money row with no amount, valid mixed
  batch), and `isStaleError`.
  *(file: `mat-ucheniya/lib/__tests__/approval.test.ts`)*

---

## Phase 3 — Write-side server actions

- [x] **T007 [P1]** Modify `createTransaction` in
  `app/actions/transactions.ts`: accept optional `batchId?: string`
  param; compute `status` from `auth.role` (player → `pending`,
  else `approved`); when `status === 'approved'`, populate
  `approved_by_user_id = auth.userId` and `approved_at = now()`;
  pass through `batch_id`. No behavioural change for DM path
  beyond the new audit fields.
  *(file: `mat-ucheniya/app/actions/transactions.ts`, depends on T002, T004)*

- [x] **T008 [P1]** Same treatment for `createTransfer`. Both legs
  share `batch_id` and `status` (FR-004). Audit fields apply only
  when status is `approved`.
  *(depends on T007)*

- [x] **T009 [P1]** Same treatment for `createItemTransfer`.
  Includes the same ownership-guard from chat 43 (BUG-fix); no
  change to that logic, only to the status / batch / audit fields.
  *(depends on T008)*

- [x] **T010 [P1]** Add status gate to `updateTransaction` in
  `app/actions/transactions.ts`: if `auth.role === 'player'` and
  `row.status !== 'pending'`, return error
  `'Можно править только pending-заявки'` (FR-005). DM path
  unchanged.
  *(depends on T007)*

- [x] **T011 [P1]** Add equivalent status gate to
  `deleteTransaction`. Player can delete only their own pending.
  *(depends on T010)*

- [x] **T012 [P1]** Add `submitBatch` action to
  `app/actions/transactions.ts`. Generates a single
  `batchId = crypto.randomUUID()`; iterates input rows; dispatches
  to `createTransaction` / `createTransfer` / `createItemTransfer`
  with the shared `batchId`. All inserts in a single Postgres
  transaction (admin client `BEGIN`/`COMMIT` via RPC or sequential
  with explicit rollback on any error). Returns
  `{ ok: true, batchId, rowIds[] }` or `{ ok: false, error }`
  (FR-008 atomicity).
  *(depends on T009)*

- [x] **T013 [P1]** Audit `lib/autogen-reconcile.ts` (and any
  ledger-aggregate helpers in `lib/transactions.ts` /
  `lib/stash.ts`) for explicit `eq('status', 'approved')`. Add
  the filter where missing (FR-012: pending invisible to
  reconcile; spec-010 already filters wallet/stash but
  autogen-reconcile is a newer surface).
  *(file: `mat-ucheniya/lib/autogen-reconcile.ts` + grep, depends on T002)*

---

## Phase 4 — Approval server actions

- [x] **T014 [P1]** Create `app/actions/approval.ts` with
  `approveRow({ rowId, expectedUpdatedAt })` and
  `rejectRow({ rowId, expectedUpdatedAt, comment? })`. Both DM-
  only (`auth.role` check via `resolveAuth`). UPDATE gated on
  `WHERE id = ? AND status = 'pending' AND updated_at = ?`. Zero
  rows updated → return `{ ok: false, error, stale: true }`. On
  success, populate the right audit fields and call
  `revalidatePath` for `/c/[slug]/accounting` and
  `/c/[slug]/accounting/queue`.
  *(file: `mat-ucheniya/app/actions/approval.ts`, depends on T002, T004)*

- [x] **T015 [P1]** Add `approveBatch({ batchId,
  expectedUpdatedAtByRowId })` and `rejectBatch({ batchId,
  expectedUpdatedAtByRowId, comment? })`. Per-row gated UPDATE
  inside a single Postgres transaction. Return aggregate
  `{ ok, approved: N, stale: M }` (does not roll back on partial
  staleness — honest counts). Same `revalidatePath` pattern.
  *(depends on T014)*

- [x] **T016 [P1]** Add `withdrawRow({ rowId, expectedUpdatedAt })`
  and `withdrawBatch({ batchId, expectedUpdatedAtByRowId })`.
  Player-only or row-author; DELETE gated by author + status +
  updated_at. For transfer rows, deletes both legs (lookup by
  `transfer_group_id`). Hard-delete per OQ-6.
  *(depends on T015)*

---

## Phase 5 — Read-side queries

- [x] **T017 [P1] [P]** Add `getPendingCount(campaignId)` to
  `lib/transactions.ts` (or new `lib/approval-queries.ts` —
  decide on file location during implementation). Cheap COUNT on
  the `idx_tx_pending` partial index. Returns number.
  *(depends on T002)*

- [x] **T018 [P1] [P]** Add `getPendingBatches(campaignId, role,
  userId)` returning `PendingBatch[]`. Role-filtered: DM/owner →
  all pending in campaign; player → only batches where
  `author_user_id = userId`. Reuses
  `hydrateCategoryLabels` / `hydrateAuthors` /
  `hydrateCounterparties` from existing `getLedgerPage`. Sorts
  newest-batch-first by earliest row's `created_at`.
  *(depends on T017)*

- [x] **T019 [P2] [P]** Add `getBatchById(batchId, campaignId)`
  returning a single `PendingBatch | null`. Used by player's
  "see what happened to my batch" follow-up after the toast.
  *(depends on T018)*

---

## Phase 6 — Form refit (multi-row submission)

- [x] **T020 [P1]** Refactor `components/transaction-form.tsx`
  state into array shape: `rows: BatchRowState[]` instead of
  flat fields. Existing field state moves into the array
  element. Single-row default for DM path; player path renders
  the same shape but allows growing the array. **Behaviour-
  preserving step** — single-row submission must work identical
  to today after this refactor.
  *(file: `mat-ucheniya/components/transaction-form.tsx`, depends on T012)*

- [x] **T021 [P1]** Add "+ Добавить ряд" affordance below last row
  (player only, hidden for DM); add per-row "× удалить" button
  when `rows.length > 1`. Submit button label switches: DM →
  "Сохранить", player single-row → "Отправить заявку", player
  multi-row → "Отправить N заявок". Submit calls `submitBatch`
  for player, per-kind action for DM.
  *(depends on T020)*

---

## Phase 7 — Pending / rejected rendering

- [x] **T022 [P1]** Modify `components/transaction-row.tsx` to
  render status-aware: `pending` → amber border-left + "⏳ Ждёт
  DM" badge; `rejected` → muted gray-500 text + strikethrough on
  amount + "✗ Отклонено" badge + optional `rejection_comment`
  shown on hover/click; `approved` → existing rendering
  unchanged. Coordinate visually with the autogen badge from
  spec-012 (same slot).
  *(file: `mat-ucheniya/components/transaction-row.tsx`, depends on T004)*

- [x] **T023 [P2]** Verify `dedupTransferPairs` in
  `lib/transaction-dedup.ts` handles mixed-status pairs
  correctly. Per FR-004 both legs share status — but defensive:
  add a unit test that confirms approved+pending pair (which
  shouldn't exist) doesn't collapse. If the helper crosses
  statuses, fix.
  *(depends on T004, T022)*

---

## Phase 8 — Queue tab + sub-nav

- [x] **T024 [P1]** Create `components/accounting-sub-nav.tsx`.
  Lightweight client component, two primary tabs (Лента /
  Очередь) + the existing secondary actions (Стартовый сетап
  for DM, Категории, Общак). Очередь tab shows count badge for
  DM (e.g. "Очередь · 7"). Highlights active route via
  `usePathname`.
  *(file: `mat-ucheniya/components/accounting-sub-nav.tsx`)*

- [x] **T025 [P1]** Mount `<AccountingSubNav>` on
  `/accounting/page.tsx`, replacing the current header's link
  cluster. Verify the existing Стартовый сетап / Категории /
  Общак buttons still work and are role-gated as before.
  *(file: `mat-ucheniya/app/c/[slug]/accounting/page.tsx`, depends on T024)*

- [x] **T026 [P1]** Create `app/c/[slug]/accounting/queue/page.tsx`.
  Server component. Fetches `getPendingBatches(campaignId, role,
  userId)`. Renders `<AccountingSubNav>` + `<QueueList
  batches={...} role={...} />`. Empty state: "Очередь пуста"
  with link back to ledger.
  *(file: `mat-ucheniya/app/c/[slug]/accounting/queue/page.tsx`,
  depends on T018, T024)*

- [x] **T027 [P1]** Create `components/queue-list.tsx` (server).
  Iterates `batches` and renders one `<QueueBatchCard>` per
  batch.
  *(file: `mat-ucheniya/components/queue-list.tsx`, depends on T026)*

- [x] **T028 [P1]** Create `components/queue-batch-card.tsx`
  (client). Collapsed view: author + submittedAt + row count +
  summary line (`summarizeBatch`). Expanded view: per-row
  `<TransactionRow>` list with role-appropriate action buttons.
  Local state for expansion.
  *(file: `mat-ucheniya/components/queue-batch-card.tsx`,
  depends on T027, T022, T005)*

- [x] **T029 [P1]** Wire DM batch-level actions in
  `<QueueBatchCard>`: "Одобрить всё" → calls `approveBatch`;
  "Отклонить всё" → opens comment popover, calls `rejectBatch`.
  Per-row "Одобрить" / "Отклонить" buttons too. On stale error
  → toast + `router.refresh()`.
  *(depends on T028, T015)*

- [x] **T030 [P1]** Wire player-level actions in
  `<QueueBatchCard>`: "Отозвать всю пачку" → `withdrawBatch`;
  per-row "Отозвать" → `withdrawRow`; "Править" → opens
  inline single-row form using the existing
  `<TransactionForm>` in single-row mode, calling
  `updateTransaction` on save.
  *(depends on T029, T016, T021)*

---

## Phase 9 — In-app signals

- [x] **T031 [P2]** Add count badge to `components/nav-tabs.tsx`
  on the "Бухгалтерия" tab. Server-fetch `getPendingCount` per
  campaign; render `· N` suffix when N > 0; visible to DM/owner
  only (FR-026). Cache for short TTL via Next 16 server-side
  caching (`unstable_cache` or revalidation tag) — invalidate
  on every approve/reject/submit/withdraw via `revalidateTag`.
  *(file: `mat-ucheniya/components/nav-tabs.tsx`, depends on T017)*

- [x] **T032 [P2]** Create `components/dm-action-toast.tsx`. On
  /accounting load, server checks: for the current user's
  authored batches, find max(`approved_at`, `rejected_at`) of
  their rows; compare to `accounting_player_state.last_seen_acted_at`
  for (user, campaign). If newer → render toast "DM одобрил X /
  отклонил Y из ваших заявок". Update `last_seen_acted_at` to
  now() in same render path (idempotent upsert).
  *(file: `mat-ucheniya/components/dm-action-toast.tsx`, depends on T002, T018)*

- [x] **T033 [P2]** Mount `<DMActionToast>` on /accounting page
  (player only — gated by role). Hidden for DM (no self-toast).
  *(file: `mat-ucheniya/app/c/[slug]/accounting/page.tsx`, depends on T032)*

---

## Phase 10 — SQL smoke scripts

- [x] **T034 [P3] [P]** Create `scripts/check-rls-014.sql` —
  5 cases wrapped in `BEGIN...ROLLBACK`: (1) player A sees own
  pending; (2) player A does NOT see player B's pending via
  ledger select (per FR-015 they DO see — adjust assertion to
  match resolution); (3) DM sees all pending; (4) `getWallet`
  filter returns approved-only; (5) withdraw deletes only own
  pending.
  *(file: `mat-ucheniya/scripts/check-rls-014.sql`)*

- [x] **T035 [P3] [P]** Create `scripts/check-approval-constraints-014.sql`
  — 5 cases: (1) approved row without `approved_by_user_id` →
  CHECK rejects; (2) rejected row without `rejected_at` → rejects;
  (3) row with both approved+rejected fields → rejects; (4)
  pending row with audit fields populated → rejects; (5) status
  transition `approved → pending` blocked at app layer (FR-030).
  *(file: `mat-ucheniya/scripts/check-approval-constraints-014.sql`)*

---

## Phase 11 — Manual acceptance walkthrough (post-deploy)

- [ ] **T036 [P1]** Walkthrough AS1–AS6 (single-row player flow):
  player submits → wallet unchanged → row in queue with pending
  marker; DM approves → wallet updates; DM rejects with comment
  → row marked rejected with comment visible; DM edits-then-
  approves → updated values land; player withdraws → row gone;
  player edits → updated values reflect.

- [ ] **T037 [P1]** Walkthrough AS7, AS13–AS16 (batch + transfer):
  player drops to stash → pair pending; player submits 3-row
  batch → all 3 in queue grouped; DM partial-approves → mixed
  state, batch shows in queue with only pending row actionable;
  player withdraws full batch → all gone; player withdraws after
  partial approve → only pending rows leave.

- [ ] **T038 [P1]** Walkthrough AS8, AS9 (DM-direct + autogen
  unchanged): DM logs loot directly → approved immediately, no
  queue; DM applies encounter loot wizard → all generated rows
  approved (FR-003 holds); reapply autogen → reconcile ignores
  pending rows (FR-012).

- [ ] **T039 [P2]** Walkthrough FR-028 (concurrent edit): player
  edits pending at 14:02; DM (different browser) approves at
  14:03 with stale snapshot; expect "ряд изменился" error +
  queue refresh; DM re-approves successfully.

---

## Phase 12 — Close-out

- [ ] **T040 [P1]** Run `npm run lint` + `npx tsc --noEmit` +
  `npx vitest run`. Fix any breakage. Expect: lint 0/0,
  vitest passes (existing 199 + 25–30 new from T006), build
  clean.

- [ ] **T041 [P1]** Update `NEXT.md`: move spec-014 to "В проде"
  with a chat-like summary (migrations, key components, test
  count); update "Следующий приоритет" to next item in backlog.

- [ ] **T042 [P1]** Update `backlog.md` only if new bugs / ideas
  surfaced during implementation.

- [ ] **T043 [P1]** Add `chatlog/2026-04-25-chatNN-spec-014-approval-flow.md`
  per `chatlog/README.md` template.

- [ ] **T044 [P1]** Commit + push. Verify Vercel auto-deploy. URL
  for the user.

---

**End of tasks.**

44 tasks total. P1 = 35; P2 = 7; P3 = 2. Estimated 3–4 working
days end-to-end. Awaiting `ok` to enter Implement phase
(T001 first).
