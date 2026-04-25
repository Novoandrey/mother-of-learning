# Feature Specification: Player Transaction Approval Flow

**Feature Branch**: `014-approval-flow`
**Created**: 2026-04-25
**Status**: Draft
**Input**: Sixth spec in the Bookkeeping series (see
`.specify/memory/bookkeeping-roadmap.md`). Schema-side, this is a
zero-migration spec — the `transactions.status` column with values
`pending | approved | rejected` was added in spec-010 (migration
`034`) precisely to keep this change additive. Behaviour-side, this
spec flips the contract for one role (`player`): writes from a
player no longer become live ledger rows, they become approval
requests waiting for the DM.

## Context

Until now the ledger has been a shared text-editor: anyone with
write access to a PC types their own transactions and they go
straight into the wallet, the loop totals, and everybody else's
view. That matched constitution principle VII ("port the Google
Sheet as-is") for the migration period — players already self-served
in the spreadsheet, no apparent reason to add ceremony.

Two pressures have built up since:

1. **Trust asymmetry.** The DM is the sole canonical authority on
   what happened in fiction. A player typing "+100 gp from the
   merchant" can't be wrong about coin counts they actually agreed
   on, but can be wrong about which day it was, which loop the day
   landed in, which session covered it, and whether the DM had
   already booked the same gain from the encounter loot
   (spec-013) — producing duplicates the DM has to chase down
   later.
2. **Audit gap.** Today there is no record of "the player intended
   to claim X but the DM disagrees" — disputed entries get
   silently overwritten or deleted in chat-based debate. Once
   spec-016 (Сборы) lands and money starts flowing into pooled
   pots managed by the DM, this gap stops being theoretical.

The fix is the standard permission split most ledger systems land
on: writes from the unprivileged role go into a queue, the
privileged role drains the queue. The schema already supports it.
The work is the contract, the UI on both sides, and the balance-
calculation discipline that follows.

The wider series (specs 015 items-as-nodes, 016 Сборы) assumes this
flow is in place — Сборы treats player contributions as
DM-authorised pots, and items-as-nodes adds inventory writes that
need the same discipline. Doing 014 now means 015 and 016 don't
each have to invent their own approval bypass.

### What is and is not changing

**Changes (player role):**
- Player-authored transactions are created with `status='pending'`,
  not `status='approved'`.
- Pending rows do not contribute to wallet balances, stash
  aggregates, inventory totals, or autogen reconciliation.
- The player has a way to see their own pending requests, edit
  them while they're still pending, and withdraw them.
- The player's view of the ledger shows their own pending rows
  (clearly marked) alongside the live ledger.

**Changes (DM role):**
- The DM sees a queue of pending player transactions, scoped to
  the campaign.
- The DM can approve, reject, or edit-then-approve individual
  pending rows.
- DM-authored transactions remain `status='approved'` immediately
  (no self-approval ceremony).

**Unchanged:**
- The schema. `transactions.status` already exists with the
  correct CHECK constraint and default.
- Autogen wizards (loop-start setup, encounter loot). The DM is
  the only actor who can apply or reapply a wizard, so wizard-
  generated rows continue to be `approved` on insert.
- The ledger reading model. Approved rows are visible to all
  members of the campaign, exactly as today.
- Categories, denominations, transfer pairs, item rows, the
  temporal model.

## User Stories

### US1 — Player submits a single transaction
**As a player**, when I record a transaction for my PC (an
expense, a gain, an item I picked up between sessions), I want
the entry to be sent to the DM for approval rather than appear in
the live ledger immediately, so the DM can confirm or correct
context (day, loop, category) before it counts toward my balance.

### US2 — Player edits or withdraws a pending request
**As a player**, before the DM has acted on my request, I want to
be able to fix a typo, change the amount, change the category, or
cancel it entirely without leaving a rejected-row scar in the
history, because the request hasn't yet been part of the
canonical ledger.

### US3 — Player sees what is pending vs live
**As a player**, on the accounting page and on my PC's wallet
block, I want my pending requests to be visible to me but
visually separated from approved rows, so I can tell what's
"waiting" and not double-submit. Pending requests must not change
the displayed balance.

### US4 — DM reviews the queue
**As the DM**, I want a single place that lists every player
request currently waiting for approval, ordered most-recent
first, with enough context per row (PC, kind, amount or item,
day, loop, comment, category) to decide without opening the form,
so I can drain the queue at the start of a session in a few
minutes.

### US5 — DM approves, rejects, or edits-and-approves
**As the DM**, on each pending row I want to be able to:
- approve it as-is (it becomes a normal ledger row),
- reject it with an optional reason (it stays in history with
  status `rejected` so the player can see what happened),
- or fix one of the fields (day, category, comment, amount) and
  then approve it, because most disagreements are about context,
  not about whether the event happened.

### US6 — DM batch-approves
**As the DM**, when several rows in the queue are obviously fine
(e.g. a player logged five purchases at the market), I want to
select them and approve in one action, so I don't have to click
through each individually.

### US7 — Player-initiated stash and item transfers
**As a player**, when I drop money or an item into the common
stash from my PC (or take from it), I want the same approval
treatment: the transfer pair (both legs) is created as pending,
and either both approve together or both reject together — never
half-applied — because a half-applied transfer is a phantom
quantity in the stash. Same for an item transfer from my PC to
another player's PC.

### US8 — Audit trail for rejections
**As a player and as the DM**, I want rejected rows to remain in
history (visibly marked rejected, optionally with a DM note),
because "we discussed the rejection two months ago" is a real
audit case. Rejected rows must not contribute to any balance or
aggregate, ever.

### US9 — Backfill of historical rows
**As the DM**, I want every transaction that existed before this
spec went live to remain `status='approved'` and untouched. The
flow change applies only to writes after the cutover.

## Functional Requirements

### Write-side contract

- **FR-001** When a player creates a money/item/transfer
  transaction, the system MUST insert with `status='pending'`,
  not `status='approved'`.
- **FR-002** When the DM (or campaign owner) creates any
  transaction, the system MUST insert with `status='approved'`,
  preserving today's behaviour.
- **FR-003** Autogen-applied rows (loop-start setup wizards,
  encounter loot wizards, any future autogen wizard) MUST be
  `status='approved'` on insert. Autogen runs only via DM-only
  server actions, so this is enforced at the call site, not
  conditionally on actor role.
- **FR-004** When a player creates a transfer (their PC ↔ stash,
  or their PC → another PC), both legs MUST share the same
  status. No transfer is ever half-pending.
- **FR-005** A player MAY edit or delete their own pending
  transaction without DM action. A player MUST NOT edit or
  delete a transaction that has already been approved or
  rejected.
- **FR-006** A player MUST NOT modify another player's pending
  transactions.
- **FR-007** The DM MAY edit any field of a pending transaction
  before approving it. The DM MAY also edit approved
  transactions (existing behaviour, unchanged).
- **FR-008** A player's submission of a multi-row batch MUST be
  atomic at the database level. If any row in the batch fails
  validation or insertion, no row in the batch is persisted —
  the player sees a single error and re-submits.
- **FR-009** A player MAY withdraw an entire pending batch in
  one action (every still-pending row in the batch is removed
  per FR-006/OQ-6 rules). Rows within a batch that have
  already been individually approved or rejected by the DM are
  not affected.

### Read-side contract

- **FR-010** Wallet balances and stash aggregates MUST be
  computed from approved rows only. Pending rows MUST NOT shift
  the displayed balance for any actor.
- **FR-011** Inventory aggregates (item quantity per PC, stash
  item totals) MUST be computed from approved rows only.
- **FR-012** The autogen reconciliation engine (spec-012) MUST
  treat pending rows as if they did not exist — pending rows
  cannot conflict with, satisfy, or be touched by reconcile
  diffs.
- **FR-013** The campaign-wide ledger view MUST show approved
  rows to all members, exactly as today.
- **FR-014** The campaign-wide ledger view MUST show rejected
  rows to all members, marked as rejected. (Audit trail.)
- **FR-015** Pending rows MUST be visible to every member of
  the campaign (author, DM, other players), with a visual
  marker that distinguishes pending from approved. Pending
  rows MUST NOT contribute to any aggregate (per FR-010 /
  FR-011).

### DM queue

- **FR-020** There MUST be a DM-accessible view that lists every
  pending transaction in the active campaign, with enough fields
  per row to decide without opening a detail form.
- **FR-020a** The view (per OQ-8) lives as a tab "Очередь" inside
  `/c/[slug]/accounting`, visible to every campaign member. The
  tab content is role-filtered: the DM sees campaign-wide
  pending; players see their own pending. A sidebar badge
  visible to the DM (FR-026) deep-links into this tab.
- **FR-021** From the queue, the DM MUST be able to approve a
  single row, reject a single row, or edit a single row before
  approving.
- **FR-022** From the queue, the DM MUST be able to approve a
  multi-row selection in one action.
- **FR-023** Rejection MAY include an optional comment from the
  DM, stored on the row.
- **FR-024** The DM queue MUST present pending submissions
  grouped by batch as the default unit. The DM MAY expand a
  batch to act on individual rows. Approve and reject MUST work
  at both the batch level (single click → all still-pending rows
  in the batch transition together) and the row level (one row
  transitions, the rest of the batch stays pending).
- **FR-025** Once every row in a batch has reached a terminal
  state (`approved` or `rejected`), the batch disappears from
  the queue. A batch with mixed-state rows still appears in the
  queue but only the still-pending rows are actionable.
- **FR-026** The DM MUST see an in-app indicator (sidebar badge
  with a count, or equivalent affordance) showing the number
  of pending rows in the active campaign. The indicator MUST
  update without manual reload after submission, withdraw,
  approve, or reject (revalidation or realtime — plan
  decides).
- **FR-027** A player visiting the accounting page MUST see a
  visible signal (banner, toast, or marker on the affected
  row) when the DM has acted on a batch they submitted since
  the player's last visit. The signal MUST distinguish
  approved-count from rejected-count for the affected batch.
- **FR-028** Concurrent edits MUST NOT silently lose work. If
  a pending row's database state changes after the DM loaded
  it into the queue (player edited, player withdrew, or
  another tab approved), the DM's subsequent approve / reject
  / edit attempt MUST be detected as stale and refused with a
  visible "row changed since you opened the queue" signal.
  The mechanism for detecting staleness is a Plan-level
  decision (per OQ-11).

### State transitions

- **FR-030** The legal state transitions for a transaction's
  `status` are: insert → `pending` (player) or `approved` (DM /
  autogen); `pending → approved` (DM action); `pending →
  rejected` (DM action); `pending → deleted` (player withdraws,
  or DM hard-rejects). No other transitions exist. In particular,
  `approved → pending` and `rejected → pending` MUST NOT happen.
- **FR-031** Approval and rejection MUST record who acted
  (user id), when (timestamp), and (for reject) an optional
  comment. The storage shape is a plan-level concern (per
  OQ-7) — column-on-row vs separate audit table — but the
  data MUST be queryable in a way that supports answering
  "who approved this row, when, and was there a comment if
  it was rejected".
- **FR-032** Once a transaction is `rejected`, it is immutable
  except for the DM optionally editing the rejection reason.

### Migration

- **FR-040** Every row that exists in `transactions` at the
  moment this feature ships MUST keep `status='approved'`. No
  data migration needed beyond what already shipped in `034`.

## Acceptance Scenarios

### AS1 — Single player money transaction
- **Given** I am a player on the campaign, my PC's wallet shows
  150 gp,
- **When** I open the wallet form, enter `−20 gp, expense, day 12,
  loop 3, "Bought rope"` and submit,
- **Then** my wallet still shows 150 gp,
- **And** the row appears in my "Pending requests" view marked
  `pending`,
- **And** the row appears in the DM's queue.

### AS2 — DM approves
- **Given** AS1 has run and the row is in the DM's queue,
- **When** the DM approves it,
- **Then** my wallet shows 130 gp,
- **And** the row appears in the campaign ledger as a normal
  expense row,
- **And** the row no longer appears in the DM's queue.

### AS3 — DM rejects with comment
- **Given** the same pending row,
- **When** the DM rejects it with comment "wrong loop, that
  happened in loop 2",
- **Then** my wallet still shows 150 gp,
- **And** the row appears in the campaign ledger marked
  `rejected`, with the DM's comment visible,
- **And** the row no longer appears in the DM's queue.

### AS4 — DM edits then approves
- **Given** the same pending row,
- **When** the DM changes `day_in_loop` from 12 to 11 and
  approves,
- **Then** my wallet shows 130 gp,
- **And** the row's day is 11 in the canonical ledger,
- **And** the row no longer appears in the queue.

### AS5 — Player withdraws before approval
- **Given** the row is pending and the DM has not acted,
- **When** I open my pending requests view and click "Withdraw",
- **Then** the row is gone from the DM's queue,
- **And** the row does not appear in the canonical ledger
  (neither approved nor rejected),
- **And** my wallet is unchanged.

### AS6 — Player edits a pending row
- **Given** the row is pending and the DM has not acted,
- **When** I change the amount from `−20 gp` to `−25 gp` and save,
- **Then** the row in the DM's queue reflects `−25 gp`,
- **And** my pending requests view reflects `−25 gp`,
- **And** my wallet is unchanged.

### AS7 — Player-initiated stash deposit
- **Given** my PC has 50 gp and the stash has 100 gp,
- **When** I press "Drop 30 gp into stash" from my PC's wallet
  block,
- **Then** the system creates a pending transfer pair (sender
  leg: my PC −30, recipient leg: stash +30) sharing one
  `transfer_group_id`,
- **And** my wallet still shows 50 gp,
- **And** the stash still shows 100 gp,
- **And** the DM's queue shows one transfer item (representing
  the pair).
- **When** the DM approves,
- **Then** my wallet shows 20 gp and the stash shows 130 gp.

### AS8 — DM-initiated transactions are still immediate
- **Given** I am the DM,
- **When** I record a 50 gp loot row tagged to a PC,
- **Then** the row is `approved` immediately,
- **And** the PC's wallet updates immediately,
- **And** the row never enters any queue.

### AS9 — Encounter loot apply
- **Given** I am the DM and an encounter has a loot draft,
- **When** I apply the loot,
- **Then** every generated row is `approved` (FR-003), regardless
  of which PCs receive items or coins.

### AS10 — Batch approve
- **Given** the queue contains five pending rows from the same
  player,
- **When** the DM selects all five and clicks "Approve selected",
- **Then** all five become `approved` in one operation,
- **And** the player's wallet reflects the cumulative effect.

### AS11 — Pending counted neither way
- **Given** my PC has 100 gp approved and 50 gp pending income,
- **When** I look at my wallet,
- **Then** the displayed balance is 100 gp (not 150).
- **When** I try to spend 120 gp via a new expense request,
- **Then** the request is created as pending (the system MUST NOT
  pre-validate balances against approved-only state — that's
  the DM's call, see OQ-5), but the wallet still shows 100 gp.

### AS12 — Cascade on PC delete
- **Given** I have pending transactions,
- **When** my PC is deleted,
- **Then** my pending transactions are cleaned up alongside the
  approved ones (existing FK behaviour applies the same way
  regardless of status).

### AS13 — Multi-row batch happy path
- **Given** I am a player with my PC's wallet at 200 gp,
- **When** I open the form, add 3 rows (`−10 gp expense potion`,
  `−25 gp expense rope`, `+50 gp income tutoring`) and click
  "Submit batch",
- **Then** all 3 rows appear in the DM's queue grouped as one
  batch attributed to me at the same timestamp,
- **And** my wallet still shows 200 gp,
- **And** my "Pending requests" view shows the batch with all 3
  rows expanded.
- **When** the DM approves the whole batch in one click,
- **Then** all 3 rows become `approved`,
- **And** my wallet shows 215 gp (200 − 10 − 25 + 50),
- **And** the batch is gone from the queue.

### AS14 — DM partial-approves a batch
- **Given** the same 3-row batch from AS13 is pending,
- **When** the DM expands the batch, approves rows 1 and 3,
  rejects row 2 with comment "rope was free, the merchant gave
  it to you",
- **Then** rows 1 and 3 are `approved`, row 2 is `rejected`,
- **And** my wallet shows 240 gp (200 − 10 + 50, no rope),
- **And** the batch no longer appears in the active queue (every
  row is in a terminal state per FR-025),
- **And** all 3 rows remain visible in the campaign ledger
  (approved as normal rows, rejected with marker + DM comment).

### AS15 — Player withdraws whole batch
- **Given** the same 3-row batch from AS13 is fully pending and
  the DM has not acted,
- **When** I open my pending requests view and click "Withdraw
  batch",
- **Then** all 3 rows are removed (per OQ-6 rules),
- **And** the batch is gone from the DM's queue,
- **And** my wallet is unchanged.

### AS16 — Withdraw mid-progress
- **Given** the DM has already approved row 1 of the 3-row batch
  (rows 2 and 3 still pending),
- **When** I click "Withdraw batch",
- **Then** only rows 2 and 3 are removed,
- **And** row 1 remains `approved` in the canonical ledger,
- **And** my wallet reflects only row 1 (190 gp = 200 − 10).

## Edge Cases

- **EC-1** Player A submits a pending transfer to Player B. Player
  B is later deleted from the campaign before the DM acts on the
  request. The row's recipient leg references a now-orphaned PC.
  → How the queue presents this is decided during Clarify, but
  the system MUST NOT crash and MUST NOT silently apply the
  transfer to a deleted PC.
- **EC-2** Two players concurrently submit transactions involving
  the stash. Both pending. Order of approval matters for stash
  state but not for individual wallets. → Existing behaviour:
  approval is just an UPDATE, no balance side-effects required —
  no special handling needed.
- **EC-3** A pending row's day or loop becomes invalid after
  submission (e.g. session deleted, loop changed). Approval
  attempts a write into the still-valid columns. → System
  surfaces existing CHECK constraints; concrete UX is
  plan-time concern.
- **EC-4** DM-as-player edge case. A campaign owner who is also
  using a PC in that campaign. Are their writes pending or
  approved? → Per FR-002 the role determines the path. A
  DM/owner writing for any PC, including their own NPC, is
  approved immediately. The role is a campaign-level membership
  fact, not a per-PC one.
- **EC-5** Reapply of an autogen wizard (loop-start, encounter
  loot) that touches a row created by a player and approved by
  the DM. → Existing reconcile logic does not look at status
  beyond approved rows (FR-012). No change needed.
- **EC-6** A player who left the campaign has pending transactions
  in the queue. → Membership leave already cascades the right
  way for approved rows; pending rows MUST behave the same.
- **EC-7** The DM tries to approve a row whose author has since
  been kicked. → Allowed; the row is data, not a live
  permission. The author_user_id stays on the row for audit.

## Clarifications

### OQ-1 — Submission UX shape — RESOLVED
**Decision:** Hybrid. The transaction form supports adding
multiple rows before submission ("+ add another row"); on submit
all rows go to the queue together as a single **batch**. After
submission the player can compose another batch the same way.
Single-row submissions are a degenerate case (a batch of 1) — no
extra ceremony for quick entries. One-tap stash buttons (drop X /
take X) likewise produce a batch of 1.

**Implications for the rest of the spec:**
- "Batch" becomes a first-class user-facing concept. The player
  sees "I sent a batch of 3 rows at 14:02"; the DM sees that
  batch as a group in the queue with the option to drill into
  individual rows.
- Approve / reject / withdraw operate at two levels: the whole
  batch in one click, or individual rows inside a batch.
- A transfer pair (2 ledger rows sharing one `transfer_group_id`)
  counts as one logical entry inside a batch — it's atomic for
  approval (per FR-004 both legs share status), but the batch may
  contain other entries alongside it.
- How the batch is stored (a new `batch_id` column on
  `transactions`, or derived from `author_user_id +
  created_at` proximity) is a plan-level decision, not a spec
  one. Spec only requires that the grouping is reliable enough
  for the user-facing operations below.

**Spec deltas from this decision:**
- New FR-008 (batch atomicity at submission): all rows in the
  player's form submit together; partial-submission failures
  reject the whole batch.
- New FR-024 (DM operates on batches and rows): the queue
  presents batches as the primary unit; expanding a batch
  reveals individual rows; both approve and reject work at
  either level.
- New FR-006a: a player can withdraw an entire batch (every
  pending row in it) in one action, in addition to withdrawing
  individual rows (FR-005).
- New AS13 (multi-row batch happy path), AS14 (DM partial-
  approves a batch), AS15 (player withdraws whole batch). Added
  below.

### OQ-3 — Pending visibility to other players — RESOLVED
**Decision:** All campaign members see all pending rows,
visually marked (badge / icon / muted color — design level).
The mark distinguishes pending from approved at a glance.
Pending rows still do not contribute to balances (FR-010).

**Implications:**
- The ledger read query for any campaign member returns
  pending rows alongside approved and rejected — filtering by
  status happens at the rendering layer, not the data layer.
- Wallet aggregates and stash aggregates remain approved-only
  (no change from FR-010 / FR-011).
- A player wanting a clean ledger view can use a "hide pending"
  toggle (UI affordance, plan-level decision; spec only requires
  visibility be possible).

**Spec delta:**
- FR-015 updated below from "OQ-3 open" to the resolved state.

### OQ-9 — Stash one-tap buttons — RESOLVED (implied by OQ-1)
**Decision:** `<StashButtons>` (drop X / take X from PC wallet
or ledger actor bar) remain one-tap. A player tap creates a
batch of 1 (containing the transfer pair as a single atomic
entry). A DM tap creates an approved row immediately as today.
No extra confirm step is added on either side.

### OQ-6 — Withdraw: hard-delete vs soft-mark — RESOLVED
**Decision:** Hard-delete. Withdraw runs `DELETE FROM
transactions WHERE id = ?` (or, for a whole batch, all
still-pending rows in the batch in one statement). No new
status value, no CHECK migration.

**Rationale:** Withdraw means "I changed my mind before anyone
acted". The DM never engaged with the row, so there is no
audit story to preserve. Read-queries stay simple (`status =
'approved'` for live, `status = 'rejected'` for audit, no
third filter to maintain). If a future spec genuinely needs
"history of withdrawn intentions", a `withdrawn` status can
be added then with its own migration — this spec stays cheap.

### OQ-10 — In-app vs out-of-app notifications — RESOLVED
**Decision:** This spec ships **in-app signals** for state
changes; native push notifications and email are out of scope
and deferred to the future mobile spec.

**In-app signals required:**
- The DM sees a sidebar badge indicating queue size whenever
  there are pending rows in the active campaign.
- A player visiting the accounting page sees a banner / toast
  if the DM has acted on their batch since their last visit
  (approved / rejected counts).
- If a player withdraws a batch while the DM has the queue
  open, the queue refreshes (revalidation or realtime — plan
  decides) so the DM doesn't act on a row that no longer
  exists.

**Out of scope (deferred to mobile spec):** native push, email,
SMS, Telegram, Discord webhooks, anything that reaches the
user outside an open browser tab.

**Spec delta:** new FR-026, FR-027 below.

### OQ-2 — Edit-vs-resubmit — RESOLVED
**Decision:** Edit-in-place. When a player edits a pending
row, the row keeps the same `id` and the same
`author_user_id`; the affected fields are updated; the
`updated_at` trigger (already in place from migration `034`)
captures "last touched". No withdraw-and-recreate flow.

**Rationale:** Audit narrative ("submitted at 14:02, last
edited at 14:08") is already representable through
`created_at` + `updated_at` on the existing row. A new
withdraw-and-recreate path would mean two row IDs the DM has
to mentally reconcile, plus the deleted row vanishes (per
OQ-6) so the audit trail is actually worse than edit-in-place.

**Spec delta:** FR-005 already covers edit semantics; no new
FR needed. Implicit: `updated_at` is the canonical "edited"
marker.

### OQ-7 — Approval audit data — RESOLVED (storage = plan)
**Decision:** The system MUST capture, for every approve and
reject action: who acted (`user_id`), when
(`timestamp`), and (for reject) an optional comment. The
**storage shape** — additional columns on `transactions`
(`approved_by_user_id` / `approved_at` /
`rejected_by_user_id` / `rejected_at` / `rejection_comment`)
versus a separate audit table — is a Plan-level decision and
not prescribed by the spec.

**Rationale:** What data is captured is a behavioural
requirement (spec). Where it lives is implementation (plan).

**Spec delta:** new FR-031 below replaces the placeholder
FR-031 currently in the spec.

### OQ-5 — Pre-submission balance check — RESOLVED
**Decision:** Pass everything through. The system MUST NOT
reject a player's submission on the grounds that it would
produce a negative approved balance. Pending = intent, not
transaction; the DM is the single authority for "is this a
legitimate spend?" and decides at approval time.

**Rationale:**
- Pending requests can legitimately overdraft an approved
  balance: the player is recording a debt that will be
  followed by a credit row, a backfill of historical income
  the DM hasn't yet entered, or an item bought on tab from an
  NPC. Pre-validation breaks all of these.
- Pre-validation also requires the form to know the actor's
  current approved balance at the form's chosen `loop_number`
  / `day_in_loop` — extra data dependency for a check the DM
  has to do anyway.
- Approved balances will continue to be displayed in the
  wallet block; a player who submits a clearly impossible row
  is doing so deliberately, and the DM will reject with a
  comment.

**Spec delta:** AS11 already captures this stance (the request
is created as pending, the wallet still shows the
approved-only balance). No new FR needed; the absence of a
balance-check FR is the decision.

### OQ-8 — DM queue location — RESOLVED
**Decision:** New tab "Очередь / Queue" inside the existing
`/c/[slug]/accounting` page. Tab is visible to every campaign
member: the DM sees the campaign-wide pending list, the
player sees their own pending requests (which doubles as the
"Pending requests" view from US3 / AS5 / AS6 / AS15). The
tab existence is unified across roles; the tab content
filters by role.

**Sidebar badge** (FR-026) is a separate UI element living in
the campaign sidebar. It's visible to the DM only and shows
the count of campaign-wide pending rows. Clicking the badge
deep-links to the Queue tab.

**Rationale:**
- The bookkeeping context already lives at `/accounting`. A
  separate `/accounting/queue` route adds a navigation hop for
  no functional gain — the DM bounces back and forth between
  ledger and queue at session start.
- Tabs are an established pattern in the codebase (StashPageTabs,
  shipped chat 42→43 in spec-011 polish Slice B). Reuse keeps
  the UI surface coherent.
- Player and DM see the same tab title with role-filtered
  content — single mental model, no "where do I find my
  pending?" question.
- A global cross-campaign inbox in the sidebar is overkill
  for current scale (1 active campaign). Out of scope; can be
  added later if multiple campaigns become real.

**Spec delta:**
- New FR-020a below pins the queue's location.
- The Queue tab is the canonical home for FR-020 / FR-021 /
  FR-022 / FR-024 / FR-025 actions.

### OQ-4 — Reject UX — RESOLVED
**Decision:**
- **Visibility (sub-1):** rejected rows stay visible in the
  campaign ledger to every member, marked rejected. This is
  already covered by FR-014; OQ-4's first sub-question is
  ratified, not changed.
- **Comment shape (sub-2):** free text, **optional**. The DM
  can type a reason or leave it blank. Same field shape as the
  existing `transactions.comment` column — no constrained
  picker, no required field.

**Rationale:**
- Tone of the campaign is conversational and in-character (15
  active players in Discord); a constrained reason picker
  ("duplicate", "wrong day", etc.) would clash and produce
  marginal statistical value at this scale.
- Required comment adds ceremony for cases where the rejection
  is obvious to everyone (e.g. "DM already booked this from
  encounter loot"). Optional preserves DM throughput.
- A future spec can layer a reasons picker on top if rejection
  patterns warrant analytics; the MVP doesn't need it.

**Scale context note:** the campaign has 15 active players
(not 4). This makes:
- queue-drain time (Success Metrics) the binding UX constraint —
  FR-022 batch-approve and FR-024 batch-grouping are
  load-bearing, not nice-to-have;
- pending-visibility-to-others (OQ-3) genuinely valuable for
  coordination at this size.

**Spec delta:** AS3 already uses the optional-comment shape;
no FR change.

### OQ-11 — Concurrent edits — RESOLVED
**Decision:** No silent loss of either side's work. If a
player edits a pending row at 14:02 while the DM has the
queue open showing the 14:00 state, and the DM clicks
approve at 14:03, the system MUST detect the staleness and
refuse to commit the approval against an outdated snapshot.
The DM gets a visible "this row was edited; review before
approving" signal, the queue refreshes, the DM re-decides.

**What this does NOT prescribe:** how staleness is detected.
The mechanism — a version column, optimistic concurrency on
`updated_at`, server-side timestamp comparison, or anything
else — is a Plan-level decision. Spec only requires that the
DM is never able to approve a row whose displayed content
diverges from the row's current database state.

**Rationale:**
- At 15 active players the race is inevitable, not theoretical.
  Approving a stale state silently overwrites a player's edit
  and produces "I changed it to −27 but it shows −25" support
  cases that are slow to debug.
- Last-write-wins without detection is the worst option: it
  picks a winner without telling either party.

**Spec delta:** new FR-028 below.

## Open Questions (still pending Clarify)

- **OQ-1** — RESOLVED above.
- **OQ-2** — RESOLVED above.
- **OQ-3** — RESOLVED above.
- **OQ-4** — RESOLVED above.
- **OQ-5** — RESOLVED above.
- **OQ-6** — RESOLVED above.
- **OQ-7** — RESOLVED above (storage shape deferred to plan).
- **OQ-8** — RESOLVED above.
- **OQ-9** — RESOLVED above.
- **OQ-10** — RESOLVED above (in-app yes; native mobile push
  deferred).
- **OQ-11** — RESOLVED above.

## Out of Scope

- **Anything that changes the schema.** This spec is built on
  top of `transactions.status` as it was shipped in `034`. New
  columns or audit tables, if any, are decided in Clarify (OQ-7)
  and implemented in plan/tasks. The CHECK constraint on
  `status` may need one new value (`withdrawn`) depending on
  OQ-6.
- **Email or push notifications.** The player learns of approval/
  rejection by visiting the app. No background or external
  channels.
- **DM signing-off-as-a-player.** A DM cannot impersonate a
  player to approve their own request. (DM-authored writes are
  auto-approved per FR-002, but a DM with a player PC writes
  through the DM role, not the player role — see EC-4.)
- **Bulk reject.** AS10 covers batch approve. Batch reject is
  not a hot UX path; if needed it can be added later as a
  small follow-up.
- **Versioning / amendment of approved rows.** If the DM
  approves a row and later realises a field is wrong, today's
  edit-approved-row behaviour stays. We are not adding
  approve-then-amend cycles in this spec.
- **Per-category approval policies** (e.g. "auto-approve income
  under 5 gp"). Tempting, but every additional rule has its own
  surface to test. Single global rule: player → pending,
  DM → approved.
- **Approval flow for `categories` writes.** Categories are
  DM/owner only already (RLS). No change.
- **Approval flow for non-transaction nodes** (PCs, sessions,
  encounters, etc.). Out of scope; this spec touches the ledger
  only.

## Dependencies

- **spec-010 transactions ledger** — the `status` column and its
  CHECK constraint exist because of this. Hard dependency.
- **spec-011 stash** — transfer pairs are how stash put/take is
  modelled. Approval flow has to handle pairs as a unit (FR-004,
  AS7).
- **spec-012 autogen** — wizards must continue inserting
  approved rows (FR-003); reconcile must continue ignoring
  pending rows (FR-012).
- **spec-013 encounter loot** — same autogen path; same
  treatment.
- **spec-006 auth roles** — `player` vs `dm`/`owner` is the
  decisive role distinction. Already in place.

## Success Metrics (qualitative)

- After spec-014 ships, a campaign log review six months later
  can answer "what did each player request, when, and what did
  the DM do" — today it cannot answer the request half.
- The DM can drain the queue at session start in under 5 min
  for a normal volume (≤30 pending rows; the campaign has
  15 active players so a busy week's worth of pending is
  within this envelope). UI shape (FR-020, US4, FR-024) is
  judged on this.
- Players adopt without asking "where did my entry go?" — i.e.
  US3 (visibility of own pending) lands clearly enough on first
  contact that no support question is needed.

---

**End of spec.**
Awaiting `ok` to enter Clarify phase (OQ-1 through OQ-11).
