# Feature Specification: Transactions Ledger

**Feature Branch**: `010-transactions-ledger`
**Created**: 2026-04-23
**Status**: Draft
**Input**: Second spec in the Bookkeeping series (see
`.specify/memory/bookkeeping-roadmap.md`). Replaces the external
Google Sheets + Telegram "who paid whom what" accounting with an
in-app append-only ledger of money/item/transfer events attached
to the loop/day/session timeline established by spec-009.

## Context

Playing parties of 4–7 out of 29 PCs, the "Mother of Learning"
campaign burns **1–2 hours per session on money and loot
bookkeeping** (constitution principle I — loop-core gameplay is
drowning in spreadsheet tax). Today this data lives outside the
app: a mix of Google Sheets, napkin notes, and Telegram replies.
No single place tells you "how much gold does Marcus have right
now, and where did the last 50gp go".

This spec ports that spreadsheet into the app **as is** (principle
VII — port before improving). A transaction is a small append-only
record: who, what, how much, **when (loop + day)**, why (category
+ free-text comment). A session link is optional metadata — handy
when it's obvious, invisible when it isn't. The primary temporal
anchor is the in-game **day**, not the session (clarified Q1).
Current balances are derived by replaying transactions (principle
V — event sourcing).

The form has ≤ 3 fields for the common case ("spent 5gp on potion")
and works on a phone at the table. No approval step yet — every
transaction is immediately visible to everyone (this is explicitly
pushed to spec-014). No common stash yet (spec-011). No encounter
loot button yet (spec-013). No starting credit auto-generation yet
(spec-012). No items-as-nodes yet (spec-015).

This spec depends on spec-009 (`day_from`, `day_to`,
`participated_in` edges, character frontier concept) — the
transaction form auto-fills `day_in_loop` from a PC's **character
frontier** (`max(day_to)` of sessions the PC participated in
within the current loop), or from a session's `day_from` when the
form is opened from a session page.

---

## User Scenarios & Testing

### User Story 1 — Player records a money transaction on the phone during play (Priority: P1)

At the table, a player buys a potion for 5gp. They open their PC's
page on the phone, tap a big "+ Transaction" button, enter the
amount (`5gp`) and a one-line comment (`potion`), and save. The
transaction is stored with the player as actor, the current
**in-game day** auto-filled (the PC's character frontier — the
latest day the PC has played to in the current loop), and is
immediately visible to everyone. The session link is **not**
required — it's filled in if the player chose to open the form
from a session page, otherwise left empty.

**Why this priority**: this is the primary use case, the thing that
must work before anything else. If this flow is slower than writing
"–5gp potion" in a Google Sheet, the feature has failed its goal.

**Independent Test**: from a PC page on a phone, with a current
loop active, a player completes a money transaction in ≤ 3 taps
plus typing, and the transaction appears in the ledger with
correct actor, loop, and day auto-filled from the PC's frontier.

**Acceptance Scenarios**:

1. **Given** player Marcus is viewing his PC page on a campaign
   that has a current loop (loop 4), and Marcus last played up to
   day 9 in that loop, **When** he taps "+ Transaction", enters
   `-5gp` and comment "potion", and taps "Save", **Then** a new
   transaction is saved with `actor=Marcus`, `amount=-5gp`,
   `loop_number=4`, `day_in_loop=9`, `session_id=NULL`, and it
   appears in the PC page's recent transactions list within one
   page reload.
2. **Given** Marcus opens the form from a session page for
   session #27 (days 10–12 of loop 4), **When** he submits a
   transaction, **Then** `day_in_loop=10` (the session's
   `day_from`) and `session_id=session_27` are auto-filled; he
   can override the day inline before saving.
3. **Given** the same player enters `+50gp` and comment "quest
   reward", **When** he saves, **Then** his balance for the current
   loop increases by 50gp on the PC page and on the ledger page.
4. **Given** the player has only a comment and no sign on the
   amount (e.g. types just `5gp`), **When** he saves, **Then** the
   form blocks save and asks for an explicit sign (+/−) — the system
   MUST NOT guess income vs. expense.
5. **Given** the player enters `0gp`, **When** he tries to save,
   **Then** the form blocks save with "amount cannot be zero".
6. **Given** the player leaves amount empty and enters only a
   free-text item description (e.g. "bottle of wine, 3sp"),
   **When** he saves, **Then** an *item transaction* is saved
   instead of a money transaction (see US6), and the balance is
   unaffected.
7. **Given** the PC has not played in the current loop at all
   (character frontier = 0), **When** the player opens the form
   from the PC page, **Then** `day_in_loop` is pre-filled to `1`
   with a small caption "PC has not played in this loop yet —
   confirm the day"; the player can edit the day inline before
   saving.

---

### User Story 2 — Player and DM see a PC's current balance and recent transactions on the PC page (Priority: P1)

A PC page ( `/catalog/[id]` for a `character`-typed node) shows a
"Wallet" block with the current loop's balance and the last ~10
transactions by this PC. The balance is displayed in total gp
(aggregate) and in the per-denomination breakdown (`cp`, `sp`, `gp`,
`pp`). Past-loop balances are available on a secondary view but do
not clutter the primary page.

**Why this priority**: without this, the ledger is write-only. The
player needs to know their state without opening a separate page.

**Independent Test**: given a PC with several transactions in the
current loop, the PC page renders a balance equal to the sum of
those transactions (per denomination), and a list of the 10 most
recent transactions with amount, comment, day, session link.

**Acceptance Scenarios**:

1. **Given** PC "Marcus" has transactions `+100gp (starting)`,
   `−5gp (potion)`, `−20gp (armor repair)` all in the current loop,
   **When** the PC page loads, **Then** the Wallet block shows
   `75.00 gp` as the aggregate balance, the per-denom breakdown
   consistent with the transactions, and the three transactions
   ordered newest-first.
2. **Given** PC "Lex" has no transactions in the current loop,
   **When** the PC page loads, **Then** the Wallet block shows
   `0.00 gp` and an empty-state caption "no transactions in this
   loop yet".
3. **Given** the PC has > 10 transactions in the current loop,
   **When** the page loads, **Then** the 10 most recent are shown
   with a "View all" link routing to the ledger page pre-filtered
   by this PC.
4. **Given** no loop in the campaign has `status='current'`,
   **When** the PC page loads, **Then** the Wallet block shows the
   PC's lifetime balance and notes "no current loop — showing all
   transactions".

---

### User Story 3 — Anyone browses the ledger page with filters (Priority: P1)

A dedicated page (`/c/[slug]/ledger`) shows the campaign's
transactions in a reverse-chronological list with filters: by PC,
by loop, by day range, by category, by kind (money / item /
transfer). Filters combine with AND. The page renders a total
summary at the top ("4 PCs, 37 transactions shown, net −120gp").

**Why this priority**: needed so the DM/table can answer "who got
the potion at day 14" and "how much did the party burn this loop"
without scrolling the Google Sheet.

**Independent Test**: open `/c/mat-ucheniya/ledger`, apply a filter
"PC = Marcus, loop = 4", see only Marcus's transactions in loop 4
and a summary matching the sum of those rows.

**Acceptance Scenarios**:

1. **Given** the campaign has 50 transactions across 4 PCs and 2
   loops, **When** the ledger page loads with no filters, **Then**
   50 rows are shown newest-first and the summary shows "4 PCs,
   50 transactions, net [sum]".
2. **Given** the user applies filter "PC = Marcus", **When** the
   filter applies, **Then** only Marcus's transactions show, URL
   carries the filter state (`?pc=<id>`), and the summary updates.
3. **Given** the user applies "loop = 4" and "category = armor",
   **When** both filters apply, **Then** only transactions in
   loop 4 categorised as "armor" are shown; both filters are
   reflected in the URL so the state is shareable/bookmarkable.
4. **Given** filters produce zero rows, **When** the list renders,
   **Then** an empty state with a "clear filters" button is
   visible.
5. **Given** the ledger has > 200 rows after filtering, **When**
   the page loads, **Then** rows are paginated or lazy-loaded —
   the initial response contains ≤ 50 rows and a way to load more.

---

### User Story 4 — Player fixes a mistake: edit or delete their own transaction (Priority: P1)

The player typed `500gp` instead of `5gp`. They open the
transaction in the ledger (or from the PC page), tap "Edit", fix
the amount, and save. Alternatively they tap "Delete" to remove
it. Only the transaction's **author** can edit/delete their own
records; the DM can edit/delete any transaction.

**Why this priority**: the google-sheets replacement must not be
strictly worse than the sheet. In a sheet, a typo is a cell edit.
If our system forces every mistake to be corrected by a manual
reversing transaction, players will go back to the sheet.

**Independent Test**: a player creates a transaction, edits its
amount and comment, saves, and the ledger shows the updated values
and no duplicate row; a different non-DM player cannot see an Edit
button on that transaction.

**Acceptance Scenarios**:

1. **Given** Marcus (player) authored a transaction with
   `amount=500gp`, **When** Marcus edits it to `5gp` and saves,
   **Then** the row's amount updates, its `updated_at` advances,
   and the PC page balance reflects the new amount.
2. **Given** the same transaction, **When** a *different player*
   (Lex) opens the ledger, **Then** the transaction has no Edit or
   Delete controls for Lex.
3. **Given** a DM opens any player's transaction, **When** they
   tap Edit or Delete, **Then** the controls are available and
   the action succeeds.
4. **Given** Marcus deletes his own transaction, **When** the
   deletion applies, **Then** the row disappears from the ledger,
   the PC page balance recomputes, and no orphan data remains.
5. **Given** a transaction is part of a transfer pair (US5),
   **When** its author edits the amount, **Then** *both* legs of
   the transfer are updated consistently — editing one side without
   the other is not allowed.

---

### User Story 5 — Player transfers money to another PC (Priority: P2)

Marcus hands 10gp to Lex at the table. Marcus opens the form in
"transfer" mode, picks Lex as the recipient, enters the amount,
and saves. The system creates two linked records: `-10gp` on
Marcus and `+10gp` on Lex, both marked as part of the same
transfer (same loop + day, same optional session, same transfer
group id). Both balances update.

**Why this priority**: P2 because transfers are a common-enough
mechanic, but money-in / money-out (US1) covers the 80% case —
a transfer can be recorded as two independent transactions if
really needed until this lands. Also: the stash (spec-011) is
built on exactly this primitive, so the data model here must be
future-proof.

**Independent Test**: Marcus issues a transfer of 10gp to Lex;
two transaction rows appear in the ledger, linked via a shared
transfer group id; Marcus's balance drops by 10gp and Lex's
rises by 10gp; editing one leg's amount in the ledger changes
the other atomically.

**Acceptance Scenarios**:

1. **Given** Marcus has 50gp, **When** he creates a transfer of
   10gp to Lex, **Then** two rows appear: `Marcus: -10gp` and
   `Lex: +10gp`, linked via a shared transfer group id, same
   `loop_number` and `day_in_loop`; Marcus's balance is 40gp and
   Lex's is +10gp.
2. **Given** the above transfer exists, **When** Marcus edits
   the amount to 5gp, **Then** both legs update to 5gp (Marcus:
   -5gp, Lex: +5gp); the ledger shows no duplicates.
3. **Given** the above transfer exists, **When** Marcus deletes
   one leg, **Then** both legs are removed together.
4. **Given** Marcus tries to pick himself as the recipient,
   **When** he saves, **Then** the form blocks save with
   "recipient must differ from sender".
5. **Given** a player (not a DM) initiates a transfer, **When**
   the save succeeds, **Then** both legs record that player as
   the author (not the recipient's owner).

---

### User Story 6 — Player records a notable item they received or gave away (Priority: P2)

After an encounter, Marcus loots a silver amulet. He wants a
breadcrumb in the ledger so the party remembers who has it. In
the form he switches kind to "item", types `silver amulet` in
the item-name field, adds a comment `from goblin chief`, and
saves. The transaction is stored with `kind=item`, no coin
counts, and does not affect any balance.

**Why this priority**: P2 because items are breadcrumbs until
spec-015 promotes them to graph nodes. In the meantime this is
just free-text. The core bookkeeping (money) is not blocked by
items being missing.

**Independent Test**: from the form, switching kind to "item",
typing an item name, and saving, produces a row with
`kind=item`, no coin counts, `amount_gp_aggregate=0`, and no
effect on the PC's balance.

**Acceptance Scenarios**:

1. **Given** Marcus opens the form in "item" mode, **When** he
   enters `silver amulet` + comment `from goblin chief` and
   saves, **Then** a row is stored with `kind=item`, item name
   = "silver amulet", no coin counts, and his Wallet balance is
   unchanged.
2. **Given** the ledger has mixed rows, **When** the user
   filters by `kind=item`, **Then** only item rows are shown,
   amounts are hidden or dashed (no sign needed), and the
   summary's "net gp" ignores items.
3. **Given** Marcus gives an item to Lex off-screen, **When**
   he records it, **Then** he may use `kind=item` with a
   comment like "→ Lex" (free-text) — there is no automatic
   "item transfer pair" in this spec; item transfers are
   tracked by a pair of manually entered item rows until
   spec-015.

---

### User Story 7 — DM curates the category taxonomy for the campaign (Priority: P2)

From a campaign settings screen, the DM sees the list of
transaction categories for the campaign, adds new ones (slug
in English + label in any language — Russian for mat-ucheniya),
renames existing labels, and soft-deletes ones that are no
longer useful. Historical transactions that reference a
soft-deleted or renamed category keep showing the original label.

**Why this priority**: P2 because a seeded default set (income,
expense, credit, loot, transfer, other + Russian labels) on
campaign creation covers the MVP day-one use. The DM-editable UI
is needed as soon as the campaign wants a specific homebrew
category ("training", "rent", "bribe") — which will happen in
practice, so this is P2, not P3. The mechanism is shared with
items (spec-015), so getting it right here pays off twice.

**Independent Test**: a DM opens `/c/[slug]/settings/categories`,
adds a category `training` / `Тренировки`, returns to the ledger
form, and sees `Тренировки` in the dropdown.

**Acceptance Scenarios**:

1. **Given** a freshly created campaign, **When** the DM opens
   the categories settings page, **Then** they see the seeded
   defaults: income/Доход, expense/Расход, credit/Кредит,
   loot/Добыча, transfer/Перевод, other/Прочее (concrete seed
   list — in `plan.md`).
2. **Given** the DM adds a category `training` / `Тренировки`,
   **When** a player opens the transaction form, **Then**
   `Тренировки` appears at the bottom of the category dropdown
   and can be selected.
3. **Given** a player tagged a transaction with `training`
   and the DM later renames the label to `Обучение`, **When**
   the player reopens the ledger, **Then** the row shows the
   new label `Обучение` (labels are resolved by slug at display
   time, so renames propagate).
4. **Given** an existing transaction uses category `training`
   and the DM soft-deletes it, **When** a new transaction is
   created, **Then** `Тренировки` is absent from the dropdown;
   **And** the old transaction still renders its label in the
   ledger (not as "[unknown]").
5. **Given** a non-DM user navigates to `/c/[slug]/settings/categories`,
   **When** they land, **Then** they see a "DM only" empty
   state or a 403 — never an edit UI.

---

### Edge Cases

- **Mixed-denomination entry.** A player earns "3gp 5sp". The
  form accepts entry per denomination (cp/sp/gp/pp) OR a single
  gp-equivalent; the stored transaction MUST preserve the exact
  denomination breakdown (important for spending the smallest
  coins first).
- **Spending more than you have.** A player types `-100gp` but
  their balance is only 50gp. The form warns but does NOT block —
  this is a ledger, not a validator; negative balances are
  displayed in red but allowed (mirrors google-sheets behaviour,
  principle VII).
- **Smallest-coin-first deduction, no breaking of larger coins.**
  When the player records "spend 2gp" and holds
  `{cp: 500, sp: 3, gp: 5, pp: 0}`, the system deducts `200 cp`
  (smallest first). If the player holds only
  `{cp: 0, sp: 0, gp: 5, pp: 0}`, the system deducts `2 gp`. A
  `5 gp` coin is **never** split into `50 sp` — the next
  denomination up is tapped whole. If even the larger
  denominations are insufficient, the transaction succeeds and
  the balance goes negative (see the negative-balance rule).
  No change-breaking logic ever runs.
- **Session-less transaction is the default, not a special mode.**
  From a PC page the form auto-fills loop + day without any
  session link. The player does not need to toggle "off-session" —
  that's simply how a PC-page entry works. The player can
  optionally link a session afterwards via an "Link to session…"
  affordance.
- **Backdating a transaction.** The player forgets to record a
  purchase from two days ago. They edit the `day_in_loop` inline
  in the form before saving (default is the PC's frontier; any
  day in `1..loop.length_days` is valid). No special flow is
  required.
- **Loop rollover.** When a new loop starts, the PC's Wallet
  block resets to 0 (no carry-over). Historical transactions
  from past loops stay readable on the ledger. Starting balances
  for the new loop are handled by spec-012; in this spec the new
  loop simply starts empty.
- **Transaction on a deleted PC.** If a PC node is deleted, its
  transactions MUST not crash the ledger page. The row shows
  "[deleted character]" instead of a link.
- **Transaction on a deleted session.** Same as above: the row
  keeps its `loop_number` / `day_in_loop` and shows "[deleted
  session]" in place of the session link.
- **Two players edit the same transaction simultaneously.**
  Last-write-wins (as elsewhere — see constitution / backlog).
  No optimistic locking in this spec.
- **Transfers across loops.** Not allowed. A transfer's two legs
  MUST share the same `loop_number` (validated in the form).
- **Item transactions have no monetary effect.** Recording
  "acquired potion of healing" as an item transaction does NOT
  change the balance. It is a bookkeeping breadcrumb until
  spec-015 promotes significant items to nodes.
- **Soft-deleted category on a historical transaction.** A DM
  renames or soft-deletes a category from the settings. The
  existing transactions that reference the old category MUST
  keep rendering with the old label (stored alongside the row
  OR resolved from a soft-deleted record). The dropdown for
  *new* entries does not show the deleted category. No
  retro-rewrite of historical rows.

---

## Requirements

### Functional Requirements

**Data model (product-level)**

- **FR-001**: A transaction MUST record: an actor (PC), a kind
  (`money` / `item` / `transfer`), a category, a free-text
  comment, a **loop number** (required), a **day within that
  loop** (required), an **optional session link** (metadata
  only, never a required anchor), an author (the user who
  created it), and an approval status (default "approved" in
  this spec; spec-014 will flip the default to "pending" for
  players). The primary temporal anchor is `(loop_number,
  day_in_loop)`; `session_id` exists for cross-linking only.
- **FR-002**: A money transaction MUST carry the exact coin
  breakdown that moved: integer counts per denomination (`cp`,
  `sp`, `gp`, `pp`). The aggregate gp value is derived (`cp*0.01
  + sp*0.1 + gp + pp*10`). **Primary input is a single
  gp-equivalent amount** (with sign); at save, the system
  resolves the per-denom breakdown from the actor's current
  holdings using the simple rule in FR-002a. Per-denom manual
  input is a secondary mode for rare roleplay cases
  ("I specifically pay with platinum").
- **FR-002a**: **Smallest-first, no breaking.** For a spend
  (negative gp-equivalent amount) the system deducts available
  coins starting from the smallest denomination (cp → sp → gp
  → pp), stopping when the required gp-equivalent is met. A
  larger coin is **never** split into smaller coins — if the
  remaining smaller coins are insufficient, the next
  denomination up is tapped whole. If overall holdings cannot
  cover the amount, the transaction still succeeds and the
  balance goes negative (see the negative-balance edge case) —
  the resolver does not block. For an earn (positive amount),
  the gp-equivalent is added to the `gp` pile by default;
  per-denom mode exists for fidelity ("earned 50 silver"). The
  exact algorithm and any rounding corners — in `plan.md`.
- **FR-003**: A sign is mandatory on the amount (+ income / −
  expense). Zero amount is invalid.
- **FR-004**: An item transaction MUST carry a free-text item
  name (plus optional free-text quantity/notes in the comment).
  It MUST NOT carry coin counts.
- **FR-005**: A transfer MUST be modelled as a pair of records
  linked as "the two legs of one transfer", sharing a transfer
  group id, timestamp, loop, day, and coin breakdown (with
  opposite signs). Editing or deleting one leg MUST affect both
  legs atomically.
- **FR-006**: Transactions MUST be append-only in the sense that
  nothing ever silently rewrites history; however, the author and
  the DM MAY edit or delete transactions as a conscious correction
  (see FR-020). No approval queue in this spec.
- **FR-007**: When a transaction has a `session_id`, its
  `loop_number` SHOULD match the session's `loop_number` and its
  `day_in_loop` SHOULD fall within `[session.day_from,
  session.day_to]`. Mismatches are **warnings, not blocks** — a
  small badge appears on the ledger row but the transaction is
  valid (intentional: the session's day range may be edited
  after the transaction is recorded, and principle VII says "port
  as is, don't over-validate"). Inconsistency checks run at
  display time; the row does not silently rewrite itself.
- **FR-008**: Every transaction MUST carry `loop_number` and
  `day_in_loop` regardless of whether a session is linked. The
  day is the primary temporal anchor — the session is optional
  metadata. (A transaction without a session is a normal case,
  not an edge case; see Edge Cases.)

**Input form**

- **FR-009**: The mobile primary form MUST have at most 3 visible
  fields in the default state: **amount (with sign), category,
  comment**. `loop_number` and `day_in_loop` are auto-filled from
  the entry-point context (see FR-010) and shown as a read-only
  caption that expands to an inline editor on tap. `session_id`
  is either auto-linked (from a session-page entry) or hidden
  behind a "Link session…" affordance.
- **FR-010**: The form MUST be reachable from the PC page, the
  ledger page, and a session page. Context auto-fill rules:
  - **From a PC page** (current loop exists): `loop_number` =
    current loop; `day_in_loop` = the PC's **character frontier**
    in that loop (= `max(day_to)` across sessions the PC
    participated in; fallback to `1` if zero); `session_id` =
    NULL.
  - **From a session page**: `loop_number` = session's
    `loop_number`; `day_in_loop` = session's `day_from`;
    `session_id` = that session.
  - **From the ledger page (no context)**: `loop_number` =
    current loop; `day_in_loop` = empty (the player fills it);
    `session_id` = NULL.
  - **No current loop in the campaign**: the "+ Transaction"
    affordance is disabled on PC and ledger pages with a hint
    "mark a loop as current first" (from a session page, the
    session's loop is used and the form is enabled).
- **FR-011**: The form MUST support a **secondary per-denom
  input mode** (cp / sp / gp / pp fields) for the rare roleplay
  cases where coin type matters ("I pay with the platinum").
  The default mode is single gp-equivalent input (FR-002a does
  the rest). The per-denom toggle is a tertiary UI affordance,
  not on the main path.
- **FR-012**: The form MUST support switching kind between
  `money`, `item`, and `transfer`. Switching kind swaps the
  visible fields (coin inputs for money, item name for item,
  recipient picker for transfer).
- **FR-013**: Every auto-filled field (`loop_number`,
  `day_in_loop`, `session_id`) MUST be overridable inline before
  save. The "off-session" concept is not a toggle — it's simply
  the default when no session is linked. A player CAN attach or
  detach a session at any time; the form MUST NOT require one.
- **FR-014**: Category input MUST be a **closed, per-campaign
  dropdown** backed by a taxonomy the DM curates. Each category
  has a stable English slug (identifier, used in URLs and joins)
  and a display label in the campaign's language (Russian for
  mat-ucheniya). Free-text category input is NOT allowed for
  players. If the DM needs a new category, they add it via the
  settings UI (FR-014a) and it becomes available to everyone.
- **FR-014a**: A DM-only settings page MUST let the DM: list the
  campaign's categories, add a new category (slug + label),
  rename an existing category's label, and soft-delete a
  category (the slug stays alive on historical transactions;
  the category just stops appearing in the dropdown for new
  entries). Reordering is optional for MVP.
- **FR-014b**: On campaign creation, the system MUST seed a
  default set of categories (concrete slugs/labels — in
  `plan.md`, but at minimum: income, expense, credit, loot,
  transfer, other with Russian labels for mat-ucheniya).
- **FR-014c**: The category taxonomy is designed to be reused
  by item classification in spec-015 (weapons, armor, potions,
  etc.). The data model MUST NOT hard-code categories as being
  "money-only" — a future item node may reference the same
  `category` identifier. Whether categories are tagged with a
  "kind scope" for UX filtering is a `plan.md` decision; the
  spec-level requirement is that the model not preclude it.

**Ledger and PC integration**

- **FR-015**: The PC page MUST render a Wallet block showing the
  current loop's aggregate gp balance, the per-denom breakdown,
  and the 10 most recent transactions by this PC in that loop.
  If no loop is current, it shows the PC's lifetime aggregate and
  a note explaining the fallback.
- **FR-016**: The ledger page (route determined in `plan.md`)
  MUST list all transactions in the campaign, newest first, with
  filters: PC, loop, day range, category, kind. Filters combine
  with AND and persist in the URL.
- **FR-017**: Each ledger row MUST show: timestamp of game day
  (e.g. "Loop 4, day 8"), PC actor (linked), kind + category,
  amount, comment, session link (if any), and the author.
  Money amount format: **aggregate gp figure with per-denom
  breakdown inline in parentheses** when the breakdown has more
  than one denomination — e.g., `−5 GP (2 g, 20 s, 100 c)`. A
  "pure-gp" transaction collapses to just `−5 GP` (no redundant
  `(5 g)`). Item rows show `—` instead of an amount.
- **FR-018**: The ledger summary header MUST show: count of rows
  after filters, count of distinct PCs, net aggregate gp
  (sum of signed amounts). Summary updates with filters.
- **FR-019**: A row in the ledger MUST deep-link (have a
  stable URL/anchor) so a player can share "look at this
  transaction" in chat.

**Permissions, edit, and audit**

- **FR-020**: Only the **author** of a transaction MAY edit or
  delete it, except DMs who MAY edit/delete any. Editing is a
  destructive in-place update (no version history stored); the
  `updated_at` of the row advances. Deletion is a hard delete
  (no soft-delete in this spec).
- **FR-021**: A player MAY create transactions only with
  themselves as the actor PC or one of the PCs they own
  (`node_pc_owners`, mig. 027). A player MUST NOT create a
  transaction where another player's PC is the sole actor — this
  is a hard block. Transfers are the exception — the initiator
  picks a recipient PC (which they do not own) as the counterpart.
- **FR-022**: DMs MAY create transactions with any PC as actor
  and any combination of counterparts. No per-PC block for DMs.
- **FR-023**: Every transaction MUST record its author (the user
  who created it). Transfers initiated by a player record that
  player as the author of both legs.

**Derived values and performance**

- **FR-024**: The per-PC per-loop aggregate balance MUST be
  computed from transactions — it is NOT stored as a column. This
  is an explicit adherence to event sourcing (principle V).
  Storage-level performance choices (materialised view, index,
  cached aggregate) — in `plan.md`.
- **FR-025**: Opening the PC page MUST NOT run an O(N²) query
  over transactions. A single aggregate query per PC-loop is the
  ceiling.
- **FR-026**: Opening the ledger page with ≤ 500 transactions
  MUST render the first page in ≤ 1s TTFB on Vercel/Supabase
  (mat-ucheniya production baseline).

---

## Key Entities

- **Transaction** (new). One atomic event. Attributes: actor
  (PC node), kind (`money` | `item` | `transfer`), per-denom coin
  counts (for money and transfer; absent for items), item name
  (for items), category, comment, loop number, day in loop,
  optional session (node), optional transfer group id (links two
  legs of a transfer), approval status (default "approved"),
  author (user), created_at, updated_at. Immutable in spirit but
  editable by author/DM.
- **PC** (existing, `type='character'`). Actor of a transaction.
  Balance is derived.
- **Session** (existing, `type='session'`). **Optional metadata**
  on a transaction — a cross-link, not a required anchor. When
  linked, it can seed the form's `day_in_loop` default
  (`session.day_from`). Transactions without a session are
  normal, not exceptional.
- **Loop** (existing, `type='loop'`). Scoping container for
  balance aggregation. A PC's Wallet balance is per-loop.
- **Wallet (derived)**. `{cp, sp, gp, pp}` and aggregate gp for a
  given `(PC, loop)`. Not stored; computed from transactions.
- **Transfer pair (logical)**. Two transaction records linked by
  a common transfer group id, with opposite signed amounts on the
  same denominations, same `(loop_number, day_in_loop)`, and
  different PC actors. A session link on a transfer is optional
  on each leg but, if present, MUST be the same session on both
  legs (the transfer is a single event).
- **Transaction Category** (new). Per-campaign taxonomy row with
  a stable English `slug` (identifier) and a display `label` (in
  the campaign's language). DM-editable from a settings screen.
  Soft-deletable (historical transactions keep rendering the old
  label). Designed to be reused as item classification in
  spec-015 — the model is not money-specific.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: A player records a money transaction from the PC
  page on a phone in ≤ 15 seconds (open PC → tap + Transaction →
  type amount → type comment → save).
- **SC-002**: Time spent on money/loot bookkeeping during a live
  session drops from the current 1–2 hours to ≤ 15 minutes,
  measured over at least one full session with the ledger live
  (qualitative; owner-reported).
- **SC-003**: For a campaign with 100 transactions and 29 PCs,
  the PC page Wallet block renders with TTFB ≤ 500ms on
  mat-ucheniya production.
- **SC-004**: For the same campaign, the ledger page initial
  render (no filters) is ≤ 1s TTFB and shows ≤ 50 rows with a
  "load more" affordance for the rest.
- **SC-005**: Zero HTTP 500 on PC pages and the ledger page when
  transactions reference deleted PCs or deleted sessions — the UI
  gracefully shows "[deleted …]".
- **SC-006**: Balances are arithmetically correct: for every
  `(PC, loop)`, the displayed aggregate gp equals the signed sum
  of coin counts × denomination weights from transactions for
  that `(PC, loop)`. Verified against a hand-computed baseline
  on the "Mother of Learning" loop 4 data.

---

## Assumptions

- **The campaign operates in gp ~98% of the time.** Per-denom
  fidelity exists for (a) accurate balance replay, (b) display
  transparency when small coins are involved, and (c) rare
  roleplay moments where coin type matters. The default mobile
  form input is a single gp-equivalent amount; the system
  resolves which physical coins leave the wallet via
  smallest-first (FR-002a). Players are not forced into
  per-denom input in the common case.
- **Currency model is D&D-5e-like, fixed ratios.** The four coin
  denominations and their ratios to gp (`1 pp = 10 gp`, `1 gp =
  10 sp`, `1 sp = 10 cp`) are hard-coded in this spec. Campaigns
  with homebrew currencies (e.g., mana crystals) are out of scope
  — future hook via `campaign_settings`, tracked in the roadmap.
- **No starting credit in this spec.** The auto-generation of a
  "starting X gp" transaction when a loop begins is spec-012.
  In spec-010, players type a manual `+X gp (credit)` transaction
  at loop start if they want a starting balance. This is
  explicitly the "port as is" step.
- **No common stash in this spec.** Transfers between PCs are in
  scope; the shared party stash (as a node) is spec-011.
- **No encounter loot distribution button in this spec.** Loot
  recorded at the table is entered as normal transactions (one
  per recipient) until spec-013 adds a batch dialog.
- **No item catalog in this spec.** Items live as free-text until
  spec-015.
- **Polling / SSR is sufficient.** No realtime transaction feed.
  Other players see a new transaction on their next page load.
- **The campaign already has a `character` type with PC owners**
  (migrations 024/027). PCs in this spec are exactly the
  owner-linked character nodes.
- **Last-write-wins on concurrent edits** (campaign-wide
  convention). Optimistic locking is out of scope.
- **Author = user, not PC.** A player who owns two PCs can
  record a transaction on either PC; the author is the user
  account, not the PC.

---

## Out of Scope

- Approval flow / batching of player transactions (spec-014).
- Common stash / party hoard as a node (spec-011).
- Auto-generated starting credit per loop (spec-012).
- Encounter-loot distribution dialog (spec-013).
- Items as nodes and `item_node_id` on transactions (spec-015).
- Import of SRD item catalog / external item references.
- Full inventory semantics (weight, encumbrance, slots, equipping)
  — part of the character sheet feature, tracked separately.
- Homebrew currencies beyond the 4 D&D denominations.
- **Gems, luxury items with fixed market value, and bank
  checks as currency-proxies.** In the campaign these
  occasionally act as "liquid valuables" (e.g., a gem
  exchanged at face value). They are out of scope for
  spec-010 — in this spec they are tracked either as item
  transactions (free-text) or as a manual gp-equivalent
  money transaction with a descriptive comment. A proper
  "valuables" concept (non-coin assets exchangeable at a
  stable price) is a future spec not covered by the
  bookkeeping roadmap.
- **Change-breaking / "make change" logic.** The resolver
  deducts smallest-first, whole coins only — it never splits
  a larger coin into smaller coins. "Breaking change" is a
  roleplay-level interaction, not a ledger concern.
- Cross-currency conversion between campaigns or worlds.
- Realtime ledger updates / balance push.
- Mobile player mode ("reader") as a distinct app surface —
  spec-007 stage 5.
- Retrograde detection (⏪ warning) — targeted for a later
  bookkeeping spec once enough transactions exist to make the
  warning meaningful.
- Soft-delete / version history on transactions.
- Export of ledger to CSV / JSON — follow-up ticket.
- Recurring / templated transactions (rent, daily expenses).

---

## Clarifications

### Round 1 — 2026-04-23

**Q1. What determines the "when" of a transaction — a specific
session, or just an in-game day?**
**A**: The in-game day is the primary temporal anchor. A session
link is optional metadata. When the form opens from a PC page, the
default `day_in_loop` is the PC's **character frontier** (from
spec-009: `max(day_to)` across sessions this PC participated in
within the current loop; fallback to `1` if the PC hasn't played).
When the form opens from a session page, the default day is
`session.day_from` and `session_id` is auto-attached. In both
cases, the day is editable inline before save. There is no
"current session" flag — "off-session" is not a special mode, it's
simply the default when no session happens to be linked.
Rationale: with 29 PCs playing in overlapping parties of 4–7,
"which day" answers the question "when did this happen" cleanly,
while "which session" is ambiguous (a given day often spans
multiple sessions) and adds friction to the mobile flow.

**Q2. Category field — closed enum, free-text with autocomplete,
or hybrid?**
**A**: Closed, **DM-editable per campaign**. Each category has a
stable English slug (identifier) + a display label in the
campaign's language (Russian for mat-ucheniya). The DM curates
the list in a campaign settings screen (US7). On campaign
creation, a default seed is inserted (income/Доход,
expense/Расход, credit/Кредит, loot/Добыча, transfer/Перевод,
other/Прочее). Players pick from the dropdown only — no free-text
entry. Soft-delete keeps historical labels rendering correctly.
The same taxonomy is designed to extend to item classification in
spec-015 (weapon, armor, potion, etc.) — the schema is not
money-only. Rationale: a closed list is the "port Google Sheet as
is" form of categories (the sheet has a fixed column-validation
dropdown); DM-edit is the future-proofing that doesn't require a
migration every time the campaign coins a new category.

**Q3. How does spending N gp work when the player holds small
coins (cp/sp)?**
**A**: Simplest possible: **smallest denomination first, whole
coins only, no breaking**. When a player records "spend 5 gp"
and holds `{cp: 500, sp: 3, gp: 5}`, the system deducts
`{cp: 500, sp: 0, gp: 0}` (first 500 cp = 5 gp, exact match). If
the smaller denominations fall short of the required amount, the
next denomination up is tapped *whole* — a 5 gp coin is never
split into 50 sp. If overall holdings are insufficient, the
balance goes negative (consistent with the negative-balance
rule — google-sheets parity). No change-making logic.
Rationale: ~98% of the campaign's money operations happen in gp
already; the small-coin handling is there for fidelity and
transparency, not as a simulation layer. Display format on the
ledger reflects this: the aggregate + coin breakdown inline,
e.g. `−5 GP (2 g, 20 s, 100 c)`. Gems, luxury items with fixed
market value, and bank checks are explicitly out of scope — they
are handled as item transactions or descriptive gp-equivalent
entries until a future "valuables" feature.


