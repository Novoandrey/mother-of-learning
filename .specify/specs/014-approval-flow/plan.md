# Implementation Plan: Player Transaction Approval Flow

**Spec**: `.specify/specs/014-approval-flow/spec.md`
**Created**: 2026-04-25
**Status**: Draft
**Estimated effort**: 3–4 days (1 schema migration, ~6 server actions,
1 new page + tab structure, multi-row form refit, queue UI, badge,
toast, ~80 unit tests).

---

## Architecture overview

This is a behavioural spec layered on top of an existing column
(`transactions.status`, shipped in `034`). Three new architectural
seams:

1. **Batch grouping** — a new `batch_id` column on `transactions`,
   indexed for queue queries. Grouping is now a database fact, not a
   UI heuristic. Player submissions write multiple rows under one
   `batch_id`; DM-authored and autogen rows leave it null.
2. **Approval audit columns** — `approved_by_user_id` / `approved_at`
   / `rejected_by_user_id` / `rejected_at` / `rejection_comment`
   denormalised onto each row. Justified by FR-030's terminal-state
   contract (a row gets exactly one terminal action, never amended)
   so no separate audit table is warranted.
3. **Optimistic concurrency on `updated_at`** — already maintained by
   the existing `trg_transactions_updated_at` trigger from `034`.
   Approve / reject / edit actions accept an `expected_updated_at`
   and gate the UPDATE with `WHERE id = ? AND updated_at = ?`. Zero
   rows updated → stale, surface to the caller.

Read-side discipline:
- Wallet aggregates (`getWallet`) and stash aggregates already filter
  `eq('status', 'approved')` per spec-010. **No change needed.**
- Ledger feed (`getLedgerPage`) currently does **not** filter status
  (it returns every row, but pre-014 every row was approved). After
  014: keep returning every status so the rendering layer can
  distinguish `approved` / `pending` / `rejected`. Visibility differs
  by role only at the very edges (none today; we keep the unified
  read model).
- Autogen reconcile (`lib/autogen-reconcile.ts`) ignores
  `pending`/`rejected` rows. A grep of `'approved'` filters in
  `getStasherDesired` / similar will confirm.

Write-side discipline:
- `createTransaction` / `createTransfer` / `createItemTransfer` get a
  per-call status decision: player → `pending` + `batch_id`; DM/owner
  → `approved` + `batch_id = null`. The role split already exists at
  the start of each action.
- `updateTransaction` / `deleteTransaction` add a `pending-only` gate
  for player role.

Routing:
- `/c/[slug]/accounting` keeps the ledger view at root.
- `/c/[slug]/accounting/queue` is the new Queue tab page.
- A `<AccountingSubNav>` component on both pages renders primary
  links (Лента / Очередь) plus the existing secondary actions
  (Стартовый сетап / Категории / Общак).
- Stash page (`/accounting/stash`) is a sibling, not under the
  Лента/Очередь split. Its own tab structure (StashPageTabs) is
  unchanged.

---

## Data model

### Migration `042_approval_flow.sql`

```sql
-- 042: Spec-014 approval flow infrastructure.
--
-- Adds batch grouping for player-authored multi-row submissions,
-- plus per-row audit columns for approve/reject actions. No new
-- table; this is a pure ALTER on `transactions`.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS.
-- Rollback: DROP COLUMN batch_id, approved_by_user_id, ...

begin;

alter table transactions
  add column if not exists batch_id uuid,
  add column if not exists approved_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by_user_id uuid
    references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_comment text;

-- Queue read path: filter by campaign + status='pending', newest-first.
-- Partial index keeps it lean — pending is a tiny fraction of total.
create index if not exists idx_tx_pending
  on transactions (campaign_id, created_at desc)
  where status = 'pending';

-- Batch read path: "all rows in this batch", "all rows still pending
-- in this batch". Group queue display, mass approve/reject.
create index if not exists idx_tx_batch
  on transactions (batch_id)
  where batch_id is not null;

-- Player's own pending: "show me my pending stuff" on the Queue tab.
create index if not exists idx_tx_author_pending
  on transactions (author_user_id, campaign_id, created_at desc)
  where status = 'pending';

-- Sanity: a row cannot be both approved and rejected. Enforced via
-- two separate xor checks rather than one big constraint to keep
-- error messages readable.
alter table transactions
  add constraint transactions_approval_consistency
    check (
      (status = 'approved'
        and approved_by_user_id is not null
        and approved_at is not null
        and rejected_by_user_id is null
        and rejected_at is null
        and rejection_comment is null)
      or
      (status = 'rejected'
        and rejected_by_user_id is not null
        and rejected_at is not null
        and approved_by_user_id is null
        and approved_at is null)
      or
      (status = 'pending'
        and approved_by_user_id is null
        and approved_at is null
        and rejected_by_user_id is null
        and rejected_at is null
        and rejection_comment is null)
    );

-- Backfill existing rows: every existing transaction is approved
-- (per FR-040), so audit columns get a "system approval" stamp.
-- We use NULL for actor since these rows pre-date the spec — the
-- CHECK constraint above forbids that, so we set approved_by_user_id
-- to the row's author_user_id (best-available signal) and
-- approved_at to created_at.
update transactions
   set approved_by_user_id = author_user_id,
       approved_at = created_at
 where status = 'approved'
   and approved_by_user_id is null;

commit;

-- Verify (manual):
--   select status, count(*) from transactions group by status;
--   select count(*) from transactions
--    where status='approved' and approved_at is null;
--   -- expect 0 after migration.
```

**Why this shape:**
- One migration, additive only. Existing rows backfill cleanly via
  `author_user_id` / `created_at` because spec-010 always recorded
  the author and we trust those values.
- The CHECK constraint pairs status with the right audit columns —
  catches code bugs at write-time. The shape mirrors what we had
  to build for transfer-pair consistency in `034`.
- Three partial indexes are cheap and selective: pending rows are
  the entire queue's read path; the rest of the table is dominated
  by approved.
- No `withdrawn` status (per OQ-6). Withdraw = `DELETE`.

### Type updates

`lib/transactions.ts`:

```ts
// Existing type stays — extend it.
export type Transaction = {
  // ... existing fields ...
  status: TransactionStatus;
  // NEW:
  batch_id: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
  rejected_by_user_id: string | null;
  rejected_at: string | null;
  rejection_comment: string | null;
};

// New aggregate: a batch + all its rows + cohort actor display info.
export type PendingBatch = {
  batchId: string;          // uuid
  authorUserId: string;
  authorDisplayName: string | null;
  submittedAt: string;       // created_at of earliest row
  campaignId: string;
  rows: TransactionWithRelations[];   // all rows still in any state
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
};
```

---

## Server actions

All in `app/actions/approval.ts` (new file). Each returns
`ApprovalResult = { ok: true } | { ok: false, error: string, stale?: true }`.

### `approveRow(input: { rowId, expectedUpdatedAt })`
DM-only. Single-row UPDATE gated on `WHERE id = ? AND status = 'pending'
AND updated_at = ?`. On success: status='approved', approved_by_user_id=
auth.userId, approved_at=now(). Zero rows updated → return
`{ ok: false, error: 'Ряд изменился, обновите очередь', stale: true }`.

### `rejectRow(input: { rowId, expectedUpdatedAt, comment? })`
Same shape. UPDATE sets status='rejected', rejected_by_user_id, rejected_at,
rejection_comment. Comment is optional; null-safe.

### `approveBatch(input: { batchId, expectedUpdatedAtByRowId })`
One UPDATE per pending row in the batch, gated as above per row.
Returns aggregate `{ ok, approved: N, stale: M }`. Does not roll back
on partial staleness — returning honest counts is more useful than
all-or-nothing here. Wraps in a single Postgres transaction via the
admin client; if one fails non-staleness, rolls back.

### `rejectBatch(input: { batchId, expectedUpdatedAtByRowId, comment? })`
Mirror of approveBatch. Comment applies to every row in the batch
(simplification — per-row comments would explode the UX surface and
the spec doesn't ask for it).

### `withdrawRow(input: { rowId, expectedUpdatedAt })`
Player-only (or author). DELETE gated on `WHERE id = ? AND status = 'pending'
AND author_user_id = auth.userId AND updated_at = ?`. Hard-delete per OQ-6.
For transfer rows, deletes both legs sharing the `transfer_group_id`
(server-side ensures both go).

### `withdrawBatch(input: { batchId, expectedUpdatedAtByRowId })`
DELETE every still-pending row in the batch where
author_user_id = auth.userId. Already-approved/rejected rows in the
batch are left alone (per AS16). Aggregates result as
`{ ok, withdrawn: N, skipped: M }`.

### Modifications to `app/actions/transactions.ts`

Three existing actions (`createTransaction`, `createTransfer`,
`createItemTransfer`) gain:

1. **Batch shape input.** New parameter `batchId?: string` — server
   action accepts a pre-generated UUID from the form. (Form generates
   one batch_id per submit, passes to every row in the batch.)
2. **Status decision per role.** Already split via `auth.role` checks;
   add: `const status = auth.role === 'player' ? 'pending' : 'approved'`.
3. **Audit on auto-approval.** When `status === 'approved'` (DM/owner
   or autogen path), populate `approved_by_user_id = auth.userId`,
   `approved_at = now()`. Required by the new CHECK.

Two existing actions (`updateTransaction`, `deleteTransaction`)
gain a status gate:

```ts
if (auth.role === 'player' && row.status !== 'pending') {
  return { ok: false, error: 'Можно править только pending-заявки' }
}
```

(FR-005: player MAY edit pending only.)

### NEW: `submitBatch(input: { rows: BatchRowInput[], campaignId })`
Wrapper action that the multi-row form calls. Server-side:
1. `auth.resolveAuth(campaignId)`.
2. Generate one `batchId = crypto.randomUUID()`.
3. For each input row, dispatch to the right legacy action
   (`createTransaction` / `createTransfer` / `createItemTransfer`)
   with `batchId`.
4. Wrap in a single `admin.from('transactions').insert([...])` if all
   rows are simple; otherwise sequential calls inside a single
   server-side transaction (the admin client's RPC path).
5. Return `{ ok: true, batchId, rowIds: [...] }` or
   `{ ok: false, error }` (FR-008 atomicity).

**Implementation detail:** mixed-kind batches (a money row + a
transfer + an item) make a single bulk INSERT trickier because each
kind has its own insertion shape. Plan: do them sequentially inside
an explicit `BEGIN`/`COMMIT` block via `admin.rpc` or a small
server-side helper. If any insert fails, ROLLBACK and return the
error. Tested in T013.

---

## Pure helpers (`lib/approval.ts`)

All testable in vitest, no Supabase:

- `groupRowsByBatch(rows: TransactionWithRelations[]): PendingBatch[]`
  — given a flat list (already filtered by status if needed), group
  into batches. Rows with `batch_id = null` (DM-auto-approved or
  autogen) are excluded — they don't belong in queue grouping.
  Sort batches by `submittedAt` (earliest row) descending.
- `summarizeBatch(batch: PendingBatch): BatchSummary` — produces
  human-readable strings: total coin amount, item count, list of
  recipients, kinds present. For the queue collapsed view.
- `isStaleError(error: ApprovalResult): boolean` — narrow helper for
  the client to distinguish staleness from other errors.
- `validateBatchRowInputs(rows: BatchRowInput[]): ValidationError[]`
  — per-row + cross-row checks (e.g. transfer rows have both legs).

Tests: `lib/__tests__/approval.test.ts` — 25–30 cases covering
grouping, sorting, mixed-state batches, transfer-pair handling
inside batches.

---

## UI components

### Modified — `components/transaction-form.tsx`

Currently single-row form with three modes (money / item / transfer).
Refit:

- Wrap row state in an array: `rows: BatchRowState[]`. Existing per-
  field state moves into the array element.
- Add "+ Добавить ряд" button below the last row (player only — DM
  doesn't need batching).
- Add per-row "× удалить" affordance once `rows.length > 1`.
- Submit button label: "Сохранить" (DM, single-row) or "Отправить
  N заявок" / "Отправить заявку" (player).
- On submit, call `submitBatch` (player) or the existing per-kind
  action (DM, single-row). DM keeps the existing single-row form
  shape — multi-row is purely a player affordance.

This is the largest single piece of UI work. Estimated ~300 lines
of diff on a 769-line file.

### Modified — `components/transaction-row.tsx`

Add state-aware rendering:
- `pending`: amber border-left, "⏳ Ждёт DM" badge before kind icon.
- `rejected`: gray-500 muted text, strikethrough on the amount, "✗
  Отклонено" badge, optional `rejection_comment` shown on
  hover/click.
- `approved`: existing rendering, unchanged.

Unify with the autogen badge from spec-012 — same visual slot, side-
by-side if both apply.

### Modified — `components/ledger-list-client.tsx`

Today's `dedupTransferPairs` runs on hydrated rows. After 014, that
helper is unchanged but feeds rows of all statuses. Verify the
dedup doesn't accidentally collapse a pending leg with an approved
leg (impossible by FR-004 — both legs share status — but worth one
test).

### NEW — `app/c/[slug]/accounting/queue/page.tsx`

Server component. Fetches:
- `getPendingBatches(campaignId, role, userId)` — DM gets all,
  player gets `where author_user_id = userId`.
- `groupRowsByBatch(rows)` to PendingBatch[].
- Renders `<AccountingSubNav>` + `<QueueList batches={...} />`.

Empty state: a friendly "Очередь пуста" + link back to ledger.

### NEW — `components/queue-list.tsx`

Server component, takes `batches: PendingBatch[]`. Renders one
`<QueueBatchCard>` per batch. Sorted newest-first (already done by
`groupRowsByBatch`).

### NEW — `components/queue-batch-card.tsx`

Client component. Collapsed state: author name + submittedAt + row
count + summary line. Expanded state: full per-row list with
inline approve/reject buttons (DM) or edit/withdraw (player). Keeps
local UI state for expansion. The actual row list reuses
`<TransactionRow>` with the new pending styling.

Action buttons:
- DM, batch-level: "Одобрить всё" / "Отклонить всё" (with optional
  comment popover for reject).
- DM, row-level: same, scoped to one row.
- Player, batch-level: "Отозвать всю пачку".
- Player, row-level: "Править" (inline) / "Отозвать".
- Edit-inline (player): expand the row into the same multi-row form
  shape, single row only, save.

Actions go through `app/actions/approval.ts` server actions; on
success → `revalidatePath('/c/[slug]/accounting')` and
`revalidatePath('/c/[slug]/accounting/queue')`. On stale error →
toast "Ряд изменился, обновляю..." + `router.refresh()`.

### NEW — `components/accounting-sub-nav.tsx`

Lightweight client component, sits at the top of /accounting and
/accounting/queue. Two primary tabs (Лента / Очередь with count
badge for DM, e.g. "Очередь · 7"). Right side: existing secondary
actions (Стартовый сетап for DM, Категории, Общак).

### NEW — `components/dm-queue-badge.tsx` (optional, T026 stretch)

Display in `nav-tabs.tsx` "Бухгалтерия" tab. Server component
fetching `getPendingCount(campaignId)` — `where status='pending'`,
`HEAD: true` for cheap COUNT. Render as a small "•7" suffix on the
tab label. Visible to DM/owner only (FR-026).

This is the cross-page indicator. Without it, the DM doesn't know
about pending unless they're already on /accounting. With it, the
sidebar is the always-on signal.

### NEW — `components/dm-action-toast.tsx` (FR-027)

When player navigates to /accounting or /accounting/queue, page-
level server check:
- For each batch the player authored, look at `max(approved_at,
  rejected_at)` of its rows.
- Compare to a `last_seen_acted_at` per-user-per-campaign value
  (stored in Supabase, table `accounting_player_state` —
  see "Persistence for FR-027" below).
- If any batch has DM-acted rows newer than last_seen → show toast
  "DM одобрил X / отклонил Y из ваших заявок".

Once shown, update `last_seen_acted_at` to now().

### Persistence for FR-027

A small helper table:

```sql
-- Part of migration 042 (additive):
create table if not exists accounting_player_state (
  user_id      uuid not null references auth.users(id) on delete cascade,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  last_seen_acted_at timestamptz not null default '1970-01-01',
  primary key (user_id, campaign_id)
);

alter table accounting_player_state enable row level security;

create policy aps_self on accounting_player_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

Self-only RLS — player reads/writes only their own row. Lazy upsert
on first /accounting visit.

---

## Read-side queries

### `lib/transactions.ts` additions

```ts
// New: count of pending rows for the DM badge.
export async function getPendingCount(campaignId: string): Promise<number>;

// New: list of pending batches, role-filtered.
//   - role='dm'|'owner' → all pending in campaign
//   - role='player'    → only batches where author_user_id = userId
export async function getPendingBatches(
  campaignId: string,
  role: Role,
  userId: string,
): Promise<PendingBatch[]>;

// New: batch + all its rows (any status), for "see what happened to
// my batch" follow-up after DM acted.
export async function getBatchById(
  batchId: string,
  campaignId: string,
): Promise<PendingBatch | null>;
```

`getLedgerPage` change: **no filter change** (already returns all
statuses, was always-approved before; rendering distinguishes).

### Wallet/stash queries

Already filter `eq('status', 'approved')`. Verified via grep — see
`getWallet`, `getWalletForActor`, `getStashAggregate`. **No code
change.** Pending rows naturally excluded from balances.

---

## Constitutional alignment

- **Principle V (event sourcing)**: pending → approved/rejected/
  deleted are events. The `created_at`, `updated_at`, `approved_at`,
  `rejected_at` columns form a per-row event timeline, queryable for
  audit. Aligned.
- **Principle VII (port-as-is, then improve)**: spec-014 deliberately
  steps **past** principle VII for the ledger surface — the Google-
  Sheet copy was the migration phase, and we've now hit the limits
  (trust asymmetry, audit gap). The roadmap explicitly anticipated
  this transition. Documented in `chatlog/2026-04-25-chatNN-spec-014.md`.
- **Принцип VIII (простота стека)**: zero new dependencies. Reuses
  existing Supabase admin client, Next 16 server actions, Tailwind v4.
- **Two-mode design (Игрок / ДМ)**: this spec is a rare case where
  the two modes diverge sharply at the action level. The Queue tab's
  shared title is the only concession to "single mental model"; the
  affordances inside are role-driven.

---

## Test strategy

Unit tests (vitest, pure functions only):
- `lib/__tests__/approval.test.ts` — 25–30 cases:
  - groupRowsByBatch: empty input, single batch single row, multi
    batch, batch with mixed statuses, transfer pair sharing batch_id,
    null batch_id rows excluded, sort order.
  - summarizeBatch: money totals across denoms, item counts,
    transfer recipients, mixed kinds, rejected rows excluded from
    sum.
  - validateBatchRowInputs: empty rows, transfer with one leg,
    money row with no amount, valid mixed batch.
  - isStaleError: positive and negative cases.

Integration: vitest server-action tests deliberately skipped — we've
been doing this consistently since spec-010 (the codebase doesn't
mock Supabase for action tests). Validated via manual walkthrough
post-deploy.

Lint and type-check: ~0 new types of issues expected (writing new
files); modifications to `transactions.ts` and form should pass
existing strict-mode checks.

SQL smoke scripts in `scripts/`:
- `check-rls-014.sql` — verify pending row visibility for player
  vs DM (3 cases), pending row in batch is not counted by getWallet
  (1 case), withdraw deletes only own pending (1 case).
- `check-approval-constraints-014.sql` — verify the new CHECK
  rejects mismatched audit columns (3 cases).

---

## Risk register

| Risk | Mitigation |
|---|---|
| Existing autogen reconcile (spec-012) reads pending rows by accident | Audit `lib/autogen-reconcile.ts` for status filters; add explicit `eq('status', 'approved')` in `getDesiredRows` if missing. T009. |
| Ledger ledger-list-client's dedupTransferPairs collapses approved+pending into one row | Defensive: dedup runs after status grouping, not across statuses. Test in T015. |
| Multi-row form gets gnarly with three kinds × N rows | Keep each row as an independent state object reusing the existing single-row state shape. The "row" component is the existing form, repeated. |
| `submitBatch` partial failure mid-insert | Postgres transaction in admin client, single ROLLBACK on error. T013. |
| FR-027 toast double-fires (player refreshes twice) | `last_seen_acted_at` is updated on first toast render; a second visit with no new DM action shows nothing. |
| 15-player queue grows past one screen | Queue uses pagination (same cursor pattern as `getLedgerPage`). 30 rows per page is fine for MVP. |
| DM acts on row while player is editing it | FR-028 + optimistic concurrency on `updated_at`. Both sides handle the staleness response with a refresh + retry. |

---

## File inventory

**New:**
- `mat-ucheniya/supabase/migrations/042_approval_flow.sql`
- `mat-ucheniya/lib/approval.ts`
- `mat-ucheniya/lib/__tests__/approval.test.ts`
- `mat-ucheniya/app/actions/approval.ts`
- `mat-ucheniya/app/c/[slug]/accounting/queue/page.tsx`
- `mat-ucheniya/components/accounting-sub-nav.tsx`
- `mat-ucheniya/components/queue-list.tsx`
- `mat-ucheniya/components/queue-batch-card.tsx`
- `mat-ucheniya/components/dm-action-toast.tsx`
- `mat-ucheniya/scripts/check-rls-014.sql`
- `mat-ucheniya/scripts/check-approval-constraints-014.sql`

**Modified:**
- `mat-ucheniya/lib/transactions.ts` — type extensions, new
  read helpers (`getPendingCount`, `getPendingBatches`,
  `getBatchById`).
- `mat-ucheniya/app/actions/transactions.ts` — status decision per
  role, batch_id input, audit fields on auto-approve, status gate
  for player edit/delete.
- `mat-ucheniya/components/transaction-form.tsx` — multi-row state
  for player, "+ Добавить ряд" affordance, batch submission via
  `submitBatch`.
- `mat-ucheniya/components/transaction-row.tsx` — pending/rejected
  rendering states.
- `mat-ucheniya/components/nav-tabs.tsx` — count badge on
  "Бухгалтерия" tab for DM.
- `mat-ucheniya/app/c/[slug]/accounting/page.tsx` — adds
  `<AccountingSubNav>` and the `<DMActionToast>` for player.
- `mat-ucheniya/lib/autogen-reconcile.ts` — defensive `status =
  'approved'` filter if absent (T009).

---

## Out of scope (re-stated from spec)

- Schema changes beyond the additive 042 migration.
- Cross-campaign global inbox.
- Email / push notifications (deferred to mobile spec).
- Per-category approval policies.
- Bulk reject UI.
- Reasons-picker UI for rejection.
- Approve-then-amend cycles.

---

**End of plan.**
Awaiting `ok` to enter Tasks phase.
