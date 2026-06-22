# Feature Specification: Mobile Ledger — player wallet & bookkeeping (Telegram Mini App)

**Feature Branch**: `044-mobile-ledger`
**Created**: 2026-06-12 (chat 95)
**Status**: Implement — **core done (P0–1c)**: adapter, shell, reads (wallet/feed/общак), writes (record/transfer/free-общак), mig 117. Branch `claude/044-mobile-ledger`, all green (typecheck/eslint/429 vitest). Next: operator staging hand-test (T028/T029) + realtime ops (T020→T019→T023); then P2/P3 (T022,T024–T027) / PR (T030).
**Input**: Andrey (chat 95): «надо сразу сделать отдельную спеку под
мобильный ledger и нашу бухгалтерию, это самый крутой и проработанный слой,
а он не используется. Возможно даже до того, как начнём делать листы —
сразу дадим ценность игрокам».
**Epic**: `.specify/epics/rpg-engine/constitution.md` — parallel track
(R10); governed by E1 (UX-first), E4 (transparency), E6 (cheaper than
paper), E7 (realtime), E10 (mobile first). Engine principles
(E2/E3/E8/E9/E11) do not apply — money is not modules.
**Depends on**: bookkeeping series 009–019 (backend complete), spec-020
data shapes (holdings), design.md 022 (tokens, dark theme), spec-046
(`/tg` Mini App shell + initData→JWT auth).
**Does NOT depend on**: spec-045 engine.

## Context

The bookkeeping layer (specs 009–019) is the deepest, most
constitution-correct part of the product: balances are a replay of
append-only transactions (Constitution V — event sourcing, live), the
общак is an actor, encounter loot distributes with fair-share math,
approvals have a queue, the item catalog holds 844 canon items with
default prices. And per chat 90 live data it is almost unused by players:
2 transactions in 30 days. Every surface is desktop chrome.

The hypothesis (Andrey's, chat 95): the layer is unused because players
have no phone-native way in, not because tracking is unwanted. This spec
is the cheap test of that hypothesis — the backend changes ~nothing,
the spec is a thin mobile UI slice over existing queries and actions.

The bookkeeping roadmap itself listed «мобильная версия игрока» as an
explicit out-of-scope «отдельная большая фича» — this is that feature.

**Strategic role (R10): realtime pathfinder.** (The original "PWA
pathfinder" role is superseded by C-00 — 044 rides the `/tg` Mini App
shell from 046, it builds no PWA.) 044 is the natural **first realtime
consumer** (E7): transactions are append-only events, the friendliest
possible shape for broadcast — no LWW conflicts by construction. The
Realtime service re-enable (DEBT-011) lands in this spec's Plan if 044
ships first. It also de-risks the per-PC app-launcher frame (FR-001) that
spec-022's sheet later plugs into.

One honest counter-reading of the chat 90 data, recorded so the bet is
explicit: «2 транзакции» may mean players don't want bookkeeping at all,
not that desktop was the barrier. The bet is still asymmetric — the UI
slice is thin, and the PWA shell work transfers to 022 in full even if
ledger usage stays low. SC-007 below makes the outcome measurable.

## Scope

**In (P1):** the character list inside `/tg` reshaped to all campaign PCs
(own PCs on top, everyone else below; view any, edit own — C-02/list);
a per-PC bottom app launcher with the Ledger app as a money-bag icon
(C-04); my wallet (balance + denominations) and my transaction feed;
record an operation in seconds (expense / income, category, free-text,
correct loop-day defaults); transfers PC → PC and PC ↔ общак; **общак
put/take free for the player** (auto-approved, not queued — C-05); общак
view (balance + recent moves); realtime propagation of new transactions
to open viewers (E7). (The list + launcher are the shell frame 044 owns
now that 046 ships minimal — see C-04.)

**In (P2):** approvals on mobile — submit a request, track status (queue
exists, spec-014); all-PCs balances view (E4 transparency; data shapes
from spec-020).

**In (P3):** starter equipment — a tucked-away one-time screen where the
player pre-fills a batch of items + money and submits it for DM approval,
reusing the **existing `submitBatch`** path and the **existing approval
queue** (C-03; zero new approval machinery). Homebrew items the catalog
lacks («Костюм чирлидерши», «Счастливый носок») ride along as free-text
item rows; the DM may later materialize them via the DM-only
`createItemAction`, but that stays outside the player flow.

**Out:** any bookkeeping logic changes (backend is done); character sheet
(022); items full inventory/equipping (explicitly out per bookkeeping
roadmap); DM desktop dashboards (spec-020 stays a separate desktop spec);
loot distribution UI (DM-side, exists); offline writes (reads may cache;
writes require connection, per the PWA model in design.md 022).

## User Scenarios & Testing

### User Story 1 — My wallet and feed (Priority: P1)

A player opens the PWA and sees their PC's money — total + by
denominations — and a feed of their recent transactions (what, when,
which loop-day, who initiated).

**Why this priority**: «сколько у меня денег» is the single most common
bookkeeping question at the table; today it requires desktop.

**Independent Test**: open `/m` as a player bound to a PC → wallet renders
with the same numbers as the desktop `/catalog/<pcId>` WalletBlock; feed
matches the desktop TransactionRow list.

**Acceptance Scenarios**:

1. **Given** a player with one linked PC, **When** they open the ledger
   tab, **Then** wallet and feed render without choosing a PC.
2. **Given** a player with multiple linked PCs (Andrey has 3), **When**
   they open the ledger, **Then** a PC switcher is one tap away and the
   choice persists.

---

### User Story 2 — Record an operation in seconds (Priority: P1)

A player records an expense or income from the phone: amount, category,
optional free text («вино для Ильзы») — faster than writing it on paper
(E6). Loop-day defaults follow the existing temporal rules (the actor's
current session day; retrograde detection stays server-side).

**Independent Test**: record «−5 зм, еда, вино» → appears in feed and in
desktop ledger; balance updates; loop-day stamped per existing rules.

**Acceptance Scenarios**:

1. **Given** the wallet screen, **When** the player taps «+» and submits
   amount+category, **Then** the transaction is recorded with no mandatory
   fields beyond amount and direction, and the balance updates optimistically
   with server confirmation.
2. **Given** a recording attempt that violates a rule the backend enforces
   (e.g. overdraft policy), **Then** the error is shown honestly and
   nothing is silently dropped.

---

### User Story 3 — Transfers (Priority: P1)

A player moves money to another PC or to/from the общак (within existing
permission rules).

**Independent Test**: transfer 10 зм PC→общак → both balances move; both
feeds show the linked pair; recipient's open screen updates without
reload (E7).

---

### User Story 4 — Общак (Priority: P1)

Anyone opens the общак: balance + recent movements (the stash page
pattern, mobile).

---

### User Story 5 — Approvals on mobile (Priority: P2)

A player submits a request to the DM (purchase, withdrawal — whatever the
existing approval flow covers) and tracks its status; DM decision
reflects in the feed.

---

### User Story 6 — Everyone's balances (Priority: P2)

Any campaign member sees the all-PCs balances list (E4; same
transparency precedent as spec-020's holdings page, mobile-shaped).

---

### User Story 7 — My significant items (Priority: P2)

Read-only list of the PC's catalogued items (significant items are nodes;
junk is free-text in transactions — bookkeeping roadmap canon). Item rows
open the existing item card.

---

### Edge Cases

- Player not linked to any PC → friendly empty state pointing to the DM
  (no dead ends).
- Player linked to several PCs → switcher (US1), per-PC feeds isolated.
- Concurrent recording by DM and player → append-only transactions, both
  land; balances are derived — no lost updates by construction.
- Connection lost mid-record → honest failure, no phantom optimistic
  balance (rollback toast).
- Огромная лента (сотни транзакций) → pagination per existing server
  clamps (~1000-row PostgREST cap — known gotcha, paginate).

## Requirements

### Surfaces

- **FR-001**: Surfaces live inside the existing `/tg` Telegram Mini App
  (spec-046), not a new shell. The character list shows all campaign PCs —
  own PCs first, everyone else below; any PC is viewable, only own PCs are
  editable (reuses `isPcOwner` / `canEditNode`). Each PC screen carries a
  per-PC bottom app launcher; the Ledger is one app (money-bag icon).
  No global tab bar — the launcher grows as later apps (sheet, …) land.
- **FR-002**: Wallet screen: total + denominations (1:10:100:1000
  hardcoded canon), feed below, «+» record action, общак and transfers
  reachable in ≤ 2 taps.
- **FR-003**: Record flow: one continuous action; mandatory fields —
  direction and amount only; category and note optional; loop-day default
  per existing temporal rules with an override control.
- **FR-004**: All reads/writes reuse the existing bookkeeping **core**
  (queries + server actions); the mobile layer adds **no new bookkeeping
  business logic**. Two conscious, bounded backend deltas are authorized
  (chat 2026-06-23) and do **not** count as new business logic:
  (a) **Auth adapter (path B)** — the existing write actions authenticate
  off a GoTrue cookie session (`getCurrentUser`); the Mini App has none, it
  carries a minted JWT. A thin minted-JWT-aware `resolveAuth` lets every
  existing action run unchanged from `/tg`. This is auth plumbing, applies
  to all write paths, and reuses 046's JWT verification
  (`lib/telegram/init-data.ts`). (b) **Free общак** — see FR-005/C-05. Any
  *other* gap found is escalated, not re-implemented mobile-side.
- **FR-005**: Transparency (E4): wallet/feed/общак/balances are readable
  by every campaign member (a player may open any PC's ledger read-only;
  record/transfer controls appear only on own PCs). Writes follow the
  existing role gate (player → pending queue) **with one exception (C-05):
  общак put/take by a player is free — auto-approved, not queued**, for
  money and items, mirrored on desktop (same `putMoneyIntoStash` /
  `takeMoneyFromStash` / `put|takeItemFromStash` actions). Mechanism is a
  Plan concern (likely an `autoApprove` flag set by the stash wrappers).

### PWA shell (SUPERSEDED by C-00 + C-04 — kept for history)

> 044 no longer builds a PWA shell; it lives inside the `/tg` Mini App
> (046). FR-006/007/008 below are obsolete. The shell deliverables 044
> *does* own now are the all-PC list + per-PC app launcher in FR-001.

- **FR-006**: Installable PWA: manifest, icons, theme color (★1 PWA name
  pending from 022's creative slots), works logged-in on iOS/Android
  standalone.
- **FR-007**: Mobile auth/session: login on phone, session persistence in
  standalone mode; logout reachable.
- **FR-008**: Design tokens and dark theme from design.md 022 are
  extracted into the shared shell (single source for 022 to inherit).

### Realtime (E7)

- **FR-009**: New transactions propagate to open viewers (wallet, общак,
  feeds, balances) without user action — target ≤ 2 s. Transactions are
  append-only events: broadcast inserts; balances recompute on receipt.
  Carries the Realtime service re-enable (DEBT-011: container + ws route
  + channel auth) if this spec ships before 045, verified on staging.
- **FR-010**: Revalidate-on-focus/reconnect as the resilience fallback
  (suspended mobile sessions), not the substitute.

### System qualities

- **FR-011**: Auth-gated server actions per AGENTS.md canon (resolveAuth /
  getMembership); RLS respected; no service-role shortcuts client-side.
- **FR-012**: Mobile-first per constitution VI: scroll over clicks,
  reader-like, минимум контролов; every button justified.

## Key Entities

No new entities. Consumes: transactions (append-only ledger), actors
(PCs, общак), approvals queue, item nodes (significant items), campaign
membership. The `/tg` Mini App surfaces are code artifacts, not data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A player records an expense from the phone in ≤ 10 s from
  app open (target; exact budget in design pass).
- **SC-002**: Wallet and общак balances are ≤ 2 taps from app open and
  match desktop values exactly.
- **SC-003**: A transaction recorded on device A appears on device B's
  open wallet/feed in ≤ 2 s without user action.
- **SC-004**: The Ledger opens and runs inside the `/tg` Mini App with a
  working minted-JWT session on at least one real iOS and one real Android
  device from the player pool (no separate install — it rides 046).
- **SC-005**: Approval round-trip works end-to-end on mobile: submit →
  DM decides (desktop) → status updates on the phone.
- **SC-006**: No new bookkeeping business logic merged beyond the two
  authorized deltas (auth adapter + free-общак flag) — review check on the
  PR. The bookkeeping core (coin resolution, status gate, batching, stash
  resolution, item-ownership) stays untouched.
- **SC-007** (the bet, measured ~30 days post-ship): player-initiated
  transactions/month rise from the baseline of 2 to ≥ 20, OR the result
  is written up honestly in the close-out and informs 022's money docking.

## Assumptions

- Bookkeeping backend (009–019) is stable and unchanged; spec-020 stays a
  separate desktop DM spec (relationship noted, no supersede).
- 022's design.md US4 «деньги» is absorbed here; the future sheet keeps a
  wallet pill deep-linking into this ledger (docking point for 022 v3).
- Significant items are nodes, junk is transaction free-text (bookkeeping
  roadmap canon) — unchanged.
- The old roadmap's «polling достаточно» non-goal is superseded by E7.

## Clarifications

- **C-00 (platform — resolved 2026-06-23, chat «telegram-auth»)** — superseded
  by the chat-96 Telegram-first pivot. The Mobile Ledger does **not** build a
  new PWA. All surfaces live inside the existing **Telegram Mini App** (`/tg`,
  spec-046), reusing its initData→JWT auth and session. The P1 "PWA shell"
  scope (manifest, install flow, mobile auth, `/m` nav) is **dropped** — 046
  already provides the shell. 044 narrows to the ledger surfaces themselves
  (wallet, feed, record op, transfers, общак, realtime). This reframes C-04
  (nav IA) to "section/tab inside `/tg`" and removes shell work from P1.
  Andrey: «никаких новых PWA, мы теперь живём в mini app».

- **C-01 (self-recording policy — resolved 2026-06-23)** — surfaced from
  code, not invented. The rule is **purely role-based and uniform**, with
  no per-category carve-outs and no setting that toggles it: any operation
  a **player** records (expense, income, item, PC↔PC transfer) →
  `status='pending'` into the approval queue; **DM/owner** → `approved`
  immediately. Receipt: `app/actions/transactions.ts` (`createTransaction`,
  `createTransfer`, `createItemTransfer` all share
  `auth.role === 'player' ? 'pending' : 'approved'`). `campaigns.settings`
  (mig 021) holds only `hp_method` — no approval setting exists. Nuance the
  status-tracking UX (US5) relies on: a player may edit/delete only their
  **own pending** rows; once approved/rejected the row is frozen to them.

- **C-02 (multi-PC IA — resolved 2026-06-23)** — go from the PC, no
  household. Switching PC = open the other PC; all functionality lives
  inside that PC's screen (the portraits section). Reuses 046's
  master-detail switcher. **No aggregate/household wallet** — balances are
  strictly per-actor; the all-PCs balances view (P2) covers the overview
  need. Per-PC selection persistence is already required by US1 AC2
  (mechanism in Plan).

- **C-03 (items / starter equipment — resolved 2026-06-23)** — not a
  read-list. A tucked-away one-time **starter-equipment** screen where the
  player pre-fills a batch (items + money) and submits it for DM approval,
  **reusing the existing `submitBatch` + approval queue** (zero new
  approval machinery). Catalog gaps are entered as free-text item rows
  («Костюм чирлидерши»); the DM may later materialize them via the DM-only
  `createItemAction` — outside the player flow, so players gain no
  item-creation rights. Lives in 044 as **P3** (not its own spec). Forward
  note: starting "money" rows here conceptually overlap the DM-side
  starting coins/loan of spec-012 — the DM reconciles at batch-approval
  time; no machine merge.

- **C-04 (navigation IA — resolved 2026-06-23)** — supersedes the original
  "tab in `/m` vs standalone route" framing (moot after C-00). The Ledger
  is **one app in a per-PC bottom launcher** (money-bag icon) inside the
  `/tg` PC screen. No global tab bar in P1; the launcher grows as later
  apps (sheet, other-PC viewing) arrive. Inside the Ledger app: wallet →
  feed → «+» record; transfers and общак reachable from there.

- **C-05 (общак access — resolved 2026-06-23)** — **changed** from the
  current code rule. Today a player's stash put/take is `pending` (stash
  wrappers inherit the role gate). Andrey: deposits **and** withdrawals
  from the общак must be **free** for players (auto-approved), money and
  items alike. This is the bounded backend delta recorded in FR-005. The
  future real control is location-gating (the PC must be at the общак's
  location; items will live in per-location stores, not one abstract
  поместье общак) — a forward note, not 044 scope; the design must not
  hardcode a single-общак assumption.

## Open questions → Clarify

All resolved — see `## Clarifications` (C-00…C-05).

## Plan handoff notes (not requirements)

- Design pass per epic constitution §Процесс: design.md (wallet, record
  flow, общак, feed anatomy — reuse 022 tokens) + `design/prompt.md` for
  Claude Design → `design/export/`.
- Realtime transport per D-7 research note: `realtime.broadcast_changes()`
  from an insert trigger on transactions into a per-campaign (or
  per-actor) private channel; RLS on `realtime.messages`; WAL slot lag
  monitoring added to the backup cron. Self-hosted re-enable runbook to
  `infra/`.
- PostgREST ~1000-row clamp: paginate feeds (known gotcha).
- Shell additions 044 owns (046 ships minimal): reshape the `/tg`
  character list to all-PC (own first, others below; view any / edit own)
  and add the per-PC bottom app launcher (Ledger = bag icon). These are
  the **opening tasks** of 044, before the ledger surfaces. Verify in Plan
  that RLS grants member-wide `SELECT` on `transactions` (E4), not own-PC
  only, so read-only viewing of others' ledgers works under the minted JWT.
- Auth adapter (path B, FR-004a): minted-JWT-aware `resolveAuth` so the
  existing write actions run from `/tg`; reuse 046's JWT verification.
  Applies to every write path.
- Free-общак mechanism (C-05 / FR-005): wire stash put/take to
  auto-approve for players (likely an `autoApprove` flag on
  `createTransfer` / `createItemTransfer` set by the stash wrappers);
  remember it changes desktop behavior too.
