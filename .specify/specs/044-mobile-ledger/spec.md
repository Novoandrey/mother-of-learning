# Feature Specification: Mobile Ledger — player wallet & bookkeeping (PWA)

**Feature Branch**: `044-mobile-ledger`
**Created**: 2026-06-12 (chat 95)
**Status**: Clarify in progress — C-00 resolved (rides the 046 Telegram Mini App, no new PWA); C-01–C-05 open
**Input**: Andrey (chat 95): «надо сразу сделать отдельную спеку под
мобильный ledger и нашу бухгалтерию, это самый крутой и проработанный слой,
а он не используется. Возможно даже до того, как начнём делать листы —
сразу дадим ценность игрокам».
**Epic**: `.specify/epics/rpg-engine/constitution.md` — parallel track
(R10); governed by E1 (UX-first), E4 (transparency), E6 (cheaper than
paper), E7 (realtime), E10 (mobile first). Engine principles
(E2/E3/E8/E9/E11) do not apply — money is not modules.
**Depends on**: bookkeeping series 009–019 (backend complete), spec-020
data shapes (holdings), design.md 022 (tokens, dark theme, PWA model).
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

**Strategic role (R10): PWA pathfinder.** This spec ships the shared PWA
shell first — manifest, install flow, mobile auth/session, `/m` navigation,
design tokens from design.md 022 — so spec-022 (sheet) later rides a
de-risked shell instead of debugging install+auth+layout together with the
engine. It is also the natural **first realtime consumer** (E7):
transactions are append-only events, the friendliest possible shape for
broadcast — no LWW conflicts by construction. The Realtime service
re-enable (DEBT-011) lands in this spec's Plan if 044 ships first.

One honest counter-reading of the chat 90 data, recorded so the bet is
explicit: «2 транзакции» may mean players don't want bookkeeping at all,
not that desktop was the barrier. The bet is still asymmetric — the UI
slice is thin, and the PWA shell work transfers to 022 in full even if
ledger usage stays low. SC-007 below makes the outcome measurable.

## Scope

**In (P1):** PWA shell (manifest, install, mobile auth, `/m` nav, dark
theme tokens); my wallet (balance + denominations) and my transaction
feed; record an operation in seconds (expense / income, category,
free-text, correct loop-day defaults); transfers PC → PC and PC ↔ общак;
общак view (balance + recent moves); realtime propagation of new
transactions to open viewers (E7).

**In (P2):** approvals on mobile — submit a request, track status (queue
exists, spec-014); all-PCs balances view (E4 transparency; data shapes
from spec-020); my significant items — read-only list (inventory slice
exists, spec-015).

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

- **FR-001**: Mobile surfaces live under the shared `/m` shell: bottom
  navigation with a Ledger tab (final IA in the design pass, shared with
  022's planned tabs).
- **FR-002**: Wallet screen: total + denominations (1:10:100:1000
  hardcoded canon), feed below, «+» record action, общак and transfers
  reachable in ≤ 2 taps.
- **FR-003**: Record flow: one continuous action; mandatory fields —
  direction and amount only; category and note optional; loop-day default
  per existing temporal rules with an override control.
- **FR-004**: All reads/writes reuse existing bookkeeping queries and
  server actions — **zero new bookkeeping business logic**; any gap found
  is escalated, not re-implemented mobile-side.
- **FR-005**: Transparency (E4): wallet/feed/общак/balances are readable
  by every campaign member; writes follow existing permission and approval
  rules unchanged.

### PWA shell (pathfinder deliverables, shared with 022)

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
membership. The PWA shell is a code artifact, not data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A player records an expense from the phone in ≤ 10 s from
  app open (target; exact budget in design pass).
- **SC-002**: Wallet and общак balances are ≤ 2 taps from app open and
  match desktop values exactly.
- **SC-003**: A transaction recorded on device A appears on device B's
  open wallet/feed in ≤ 2 s without user action.
- **SC-004**: PWA installs and runs standalone with persistent session on
  at least one real iOS and one real Android device from the player pool.
- **SC-005**: Approval round-trip works end-to-end on mobile: submit →
  DM decides (desktop) → status updates on the phone.
- **SC-006**: Zero new bookkeeping business logic merged (review check on
  the PR).
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

## Open questions → Clarify

- **C-01**: Self-recording policy — which operations may a player record
  directly vs must go through the approval queue? (Existing settings/flow
  define something here — confirm and surface the rule, don't invent.)
- **C-02**: Multi-PC players — per-PC tabs vs switcher; does a shared
  «household» view make sense for owners of several PCs?
- **C-03**: Items read-list (US7) — ship here in P2 or leave wholly to
  022 US5? (Recommendation: thin read-list here; equipping/inventory
  stays 022+.)
- **C-04**: Navigation IA — Ledger as a tab in the shared `/m` shell from
  day one (recommendation) vs standalone route until 022 lands.
- **C-05**: Does the общак allow player-initiated deposits without
  approval today? Mirror the existing rule, but confirm which it is.

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
- PWA shell extraction: tokens/theme from design.md into shared layout;
  022 inherits — coordinate file layout with 022's Plan when it exists.
