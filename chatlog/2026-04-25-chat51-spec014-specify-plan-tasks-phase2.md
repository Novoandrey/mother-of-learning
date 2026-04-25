# Chat 51 — spec-014 Specify/Plan/Tasks + Migration 042 + Phase 2

**Date**: 2026-04-25
**Spec**: 014-approval-flow
**Phases done**: Specify → Clarify → Plan → Tasks → Implement (T001–T006)
**Status**: Mid-Implement (6 of 44 tasks done; pure-helpers verified by
inspection only — tests not run due to env issue)

## What happened

Spec-014 (player transaction approval flow) opened. Roadmap context:
this is the sixth bookkeeping spec, schema-side it's zero-migration
(`status` column on `transactions` was shipped in `034`), behaviour-
side it's a hard contract change for the `player` role — writes
become pending requests, DM drains the queue.

### Clarify — 11 OQs resolved

| OQ | Decision |
|---|---|
| 1 Submission shape | A+B hybrid: multi-row form, submit-as-batch, batch is first-class |
| 2 Edit-vs-resubmit | Edit-in-place, same id, `updated_at` = edit marker |
| 3 Visibility to other players | Visible to all members, marked, no balance impact |
| 4 Reject UX | Free text, optional comment; rejected rows visible to all |
| 5 Pre-validate balance | No — pass everything, DM resolves |
| 6 Withdraw | Hard-delete |
| 7 Audit data | Captured (actor + ts + comment); column-vs-table → Plan |
| 8 Queue location | Tab inside `/c/[slug]/accounting`, role-filtered |
| 9 Stash one-tap | Keep one-tap; tap = batch of 1 |
| 10 Notifications | In-app yes (badge/toast); native push deferred to mobile |
| 11 Concurrent edits | No silent loss; staleness mechanism → Plan |

User clarified mid-stream: 15 active players (not 4 as I assumed).
Updated success metrics: queue-drain ≤30 rows / <5 min binding;
batch-grouping load-bearing not nice-to-have.

### Plan — 600 lines

- Migration `042_approval_flow.sql`: 6 columns (`batch_id` + 5 audit),
  3 partial indexes, CHECK constraint on status↔audit consistency,
  backfill of historical approved rows, `accounting_player_state`
  table for FR-027 toast.
- 6 server actions in new `app/actions/approval.ts` (approve/reject/
  withdraw × row+batch).
- New `submitBatch` wrapper + status-decision-by-role on existing
  `createTransaction`/`createTransfer`/`createItemTransfer`.
- Optimistic concurrency via existing `updated_at` (no new column).
- Routing: `/c/[slug]/accounting/queue` as sibling of `/stash`,
  shared `<AccountingSubNav>` on both.
- Read-side: wallet/stash already filter `status='approved'` — no
  change. `getLedgerPage` returns all statuses, rendering
  distinguishes (FR-014/015).

### Tasks — 44 items, 12 phases

P1 = 35; P2 = 7; P3 = 2. T001 schema → T044 push. Estimated 3–4
days end-to-end.

### Implement — T001 through T006

**T001-T003 (schema):**
- Wrote `042_approval_flow.sql` with idempotent ADD COLUMN, backfill,
  CHECK via DO-block, 3 partial indexes, accounting_player_state
  with self-only RLS.
- Handed via `present_files` → user applied to prod successfully.

**T004 (types):**
- Extended `Transaction` type in `lib/transactions.ts` with `batch_id`,
  `approved_by_user_id`, `approved_at`, `rejected_by_user_id`,
  `rejected_at`, `rejection_comment`.
- Updated `TxRawRow`, `rawToTransaction`, `JOIN_SELECT` to include
  the new columns. Narrow column-list SELECTs (wallet/totals) left
  alone — they don't need them.

**T005 (pure helpers):**
- New `lib/approval.ts`: `groupRowsByBatch`, `summarizeBatch`,
  `validateBatchRowInputs`, `isStaleError`, `activeBatchesOnly`,
  `isBatchFullyResolved`, `STATUS_ORDER` constant.
- Notable: `summarizeBatch` excludes rejected rows from money
  totals (rejected = "didn't happen") and dedupes transfer pairs
  by `transfer_group_id` so a -30/+30 pair sums to -30, not 0.
- `validateBatchRowInputs` covers per-kind rules (money needs
  non-zero coins; item needs name + qty ≥ 1 + zero coins;
  transfer needs distinct sender/recipient + non-zero) plus
  shared rules (category, loop, day range).

**T006 (tests):**
- ~40 cases in `lib/__tests__/approval.test.ts` covering all
  helpers. Edge cases: empty input, null batch_id rows excluded,
  mixed-status batches (AS14), transfer pair dedup, sort order
  (newest-first by earliest row's created_at).

## What didn't happen

- Tests not actually run. Environment hit `ENOTEMPTY` on
  `npm install` after I ran `npx vitest` which tried to install
  vitest 4.x (we use 3.x via package.json) into node_modules —
  state corrupted. `rm -rf node_modules` couldn't drain due to
  busy directory entries. Tool-use budget exhausted before clean
  recovery possible.
- T007–T044 not started.

## Pickup steps for next chat

1. Fresh clone (per AGENTS.md rule).
2. `cd mat-ucheniya && rm -rf node_modules .next && npm install`.
3. `npx vitest run lib/__tests__/approval.test.ts` — fix any
   breakage. Most likely all green; the helpers are simple.
4. Continue at **T007** (`createTransaction` status decision +
   batch_id + audit fields).

## Files touched

**New:**
- `.specify/specs/014-approval-flow/spec.md` (798)
- `.specify/specs/014-approval-flow/plan.md` (600)
- `.specify/specs/014-approval-flow/tasks.md` (372)
- `mat-ucheniya/supabase/migrations/042_approval_flow.sql` (~140)
- `mat-ucheniya/lib/approval.ts` (~290)
- `mat-ucheniya/lib/__tests__/approval.test.ts` (~430)

**Modified:**
- `mat-ucheniya/lib/transactions.ts` — type extensions only.

## Commit

`12770f2 spec-014: spec/plan/tasks + migration 042 + types +
pure helpers`. Pushed to `main`.
