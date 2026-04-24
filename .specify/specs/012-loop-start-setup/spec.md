# Feature Specification: Loop Start Setup (стартовый сетап петли)

**Feature Branch**: `012-loop-start-setup`
**Created**: 2026-04-24
**Status**: Draft
**Input**: Fourth spec in the Bookkeeping series (see
`.specify/memory/bookkeeping-roadmap.md`). Builds on spec-010's
ledger and spec-011's stash. Introduces a **general autogen
layer** on top of the ledger — a primitive for "a set of
ledger transactions generated from a source and reconcilable
against the current state of that source" — and ships the
first four concrete autogen wizards as the practical feature:
starting money per PC, starting loan, stash seed, starting
items per PC. All four are triggered by an **explicit
"Применить стартовый сетап" action** on a newly created loop
(never automatically on loop creation — see Clarifications/Q3)
and dated to day 1 of that loop. Spec-013 (encounter loot
distribution) is the expected second client of the same
autogen layer — it will generate rows from an encounter's
`loot_draft` and reconcile them on re-distribute, using the
same marker, the same diff-apply logic, and no additional
migration. The credit / starting-money / stash-seed /
starting-items quartet is simply the first batch of wizards
that ships inside this framework. Future specs (mid-loop rent,
recurring income, class-based starter kits, quest rewards,
auto-shopping runs) add new wizards on top of the same
machinery without needing a new architectural layer.

## Context

Spec-010 and spec-011 shipped the ledger and the stash. Opening
a fresh loop today means one of two things:

1. The DM manually writes 29 "+100 gp credit" rows, 29 "+starter
   kit" item rows, and a couple of stash-seed rows. Across a
   campaign with 29 PCs, a loop rollover is ~60 pencilled
   transactions and 10–15 minutes of pure data entry.
2. The DM skips it, and every PC starts loop N with `0 gp` and
   an empty inventory — because spec-011 ships the "new loop =
   empty" rule by design. The party then fumbles at the table
   debating "wait, do we start with coin again?".

Both outcomes are bad. The problem is not that the rule
`new loop = empty` is wrong (it's the correct default from a
wipeable-state perspective, constitution principle I) — the
problem is that **any** non-empty starting state currently
requires the DM to replay it by hand every 30 in-game days.

This spec introduces the concept of an **autogen wizard**: a
piece of code that reads a **source node** (the thing being
autogen'd *from*) and writes a deterministic set of ledger
transactions as its output. The wizard is **reconcilable**: if
the source node changes (the DM edits the starter config, or
re-rolls the encounter loot), re-running the wizard replaces
the prior output with the new output — no duplication, no
orphan rows, no touching of anything outside its own output.
The autogen layer is a generic primitive; spec-012 ships four
concrete wizards that use it:

- **Starting money** per PC — the coin amounts a PC begins
  the loop with. Configured per PC (because different classes
  and backgrounds start with different amounts). Source node:
  the loop.
- **Starting loan** — a campaign-level default amount that every
  participating PC takes as a `credit` row. Each PC has a
  boolean flag "takes starting loan" (default on) — a PC whose
  player has decided their character doesn't borrow (Lex's
  narrative choice in mat-ucheniya) flips it off and skips the
  credit row with no other consequence. Source node: the loop.
- **Stash seed** — the coin and item contents the stash begins
  the loop with. Configured at the campaign level. Default is
  empty, which preserves spec-011's shipped behaviour. Source
  node: the loop.
- **Starting items** per PC — a per-PC list of starter items,
  materialised as `kind='item'` rows with `actor=PC` on day 1.
  Per-PC rather than campaign-wide because a wizard's starting
  spellbook and a fighter's starting longsword have nothing in
  common; flattening them into a campaign default would be
  useless. Source node: the loop.

Starter items are stored today as minimal `{name, qty}` entries
on the PC's starter config, and they materialise as
`kind='item'` transactions with the PC as actor — the actor is
simultaneously the item's **owner** and, implicitly, its
location. This is deliberately bare-bones: a future spec is
expected to add **location and equip metadata** to item
transactions — a "carried / stored / equipped" marker, and
optionally a location-node reference for items that live at
the PC's house or in a world-level location distinct from the
PC's person. When PCs themselves become graph-aware entities
with "I'm at location X on day N" movement (a separate future
spec), items will be able to live at location nodes
independently of characters — locations hold items, characters
walk between locations, and the same wipeable-state rule
(constitution principle I) applies: when a new loop begins,
every wipeable actor — PCs, the stash, location nodes — sees a
fresh-zero view. Spec-012 does not introduce any of this; the
starter-items wizard produces plain `kind='item'` rows that
future migrations will gracefully extend with additional
nullable columns. `plan.md` pins the column layout explicitly
so none of those future additions require rewriting the
wizard, the autogen marker, or the reconcile logic — see
`plan.md § Forward-Compat Column Map`.

Spec-013 (encounter loot distribution) is an **expected second
batch of wizards** of the same shape, with the source node
being an encounter rather than a loop. Spec-012 designs the
autogen layer specifically so that spec-013 adds a new wizard
key and a new UI trigger, nothing else — no schema change, no
new marker, no duplicated reconcile logic. This dual-client
framing is the reason the layer is generic rather than a
single-purpose "loop-start" module.

**Three architectural points are pinned at the spec level**
because they shape every later decision — every later wizard
added on top of this layer has to respect them:

1. **Autogen wizards produce ordinary ledger transactions, not
   a parallel shadow ledger.** Every row generated by a wizard
   is a normal spec-010 transaction — it shows up in the
   ledger, it counts towards wallet aggregates, it is
   filterable, editable, and deletable under the same rules as
   any other row. The only distinguishing feature is an
   **autogen marker** that records which wizard generated the
   row and from which source node, so the system can detect
   reruns and avoid double-application. This marker is an
   **orthogonal property** of a transaction (like `session_id`
   is in spec-010) — it does not define a new `kind` and does
   not create a parallel table. The exact shape of the marker
   is a `plan.md` decision; the spec-level guarantee is "a row
   knows which wizard produced it from which source, if any,
   and the system can identify the set of rows belonging to a
   given (wizard, source) pair".

2. **Autogen wizards are idempotent per (wizard, source,
   actor).** Running the same wizard twice against the same
   source must not produce duplicate rows. The expected
   behaviour on rerun is "replace the prior run's rows with
   what the current source would produce now" — deterministic,
   not additive. This means editing a PC's starting-money
   amount and reapplying the loop-start setup must not leave
   orphan rows from the old amount; it also means editing an
   encounter's `loot_draft` and re-distributing (in spec-013)
   must not leave orphan rows from the prior distribution. The
   exact reconciliation strategy (full delete+reinsert,
   update-in-place, diff-apply) is a `plan.md` decision; the
   spec-level guarantee is "no duplication on rerun, and the
   rerun cannot silently delete rows that aren't recognisably
   part of this (wizard, source) pair's prior output".

3. **The autogen layer must accept new wizards without a
   migration.** Adding a "rent auto-debit on day 15" wizard, a
   "class-based starter kit" wizard, or the spec-013 encounter-
   loot wizard must not require changing the transactions
   schema. The marker introduced in point 1 carries enough
   information to distinguish one wizard from another —
   concretely, a wizard is identified by a short stable key
   (`starting_money`, `starting_loan`, `stash_seed`,
   `starting_items` in spec-012; `encounter_loot` expected in
   spec-013; future keys in later specs) and a source-node
   reference. New wizards in later specs pick new keys and
   point at their own source nodes; the schema does not
   change.

---

## User Scenarios & Testing

### User Story 1 — DM applies the starting setup to a fresh loop with one click (Priority: P1)

At the end of a session the DM decides loop 4 is over; she
creates loop 5 in the catalog. The new loop page opens with an
unmissable banner: **"Стартовый сетап ещё не применён —
[Применить]"**. She clicks Применить. Without any further
action, every PC in the campaign — including the 23 who
weren't at the final session of loop 4 — opens loop 5 with
their starting wallet filled in (e.g. `100 gp` for most PCs, a
different amount for any PC whose starter config was overridden)
and their starting loan row present (for PCs whose "takes
starting loan" flag is on). The stash page also shows its seeded
contents, if any were configured. The banner disappears; the
loop is ready to play.

**Why this priority**: this is the feature's whole point. If the
DM still has to click 58 "generate starting transaction" buttons
after flipping the loop to current, the framework has failed its
goal of "loop rollover is cheap". The explicit apply-click is a
deliberate safety choice (see Clarifications / Q3) — without it,
prepping loops in advance is a minefield; with it, loop rollover
is still ≤ 3 clicks total.

**Independent Test**: with a configured campaign (starting money
per PC, starting loan amount, stash seed), create a new loop,
open it, click "Применить" in the banner. Expect every PC's
Wallet block to display the configured starting money on day 1,
a `credit` row to appear in the ledger for every PC whose flag
is on, and the stash page to reflect the seeded contents — all
from a single DM action.

**Acceptance Scenarios**:

1. **Given** the campaign has 10 PCs, all with starting money
   `100 gp` and "takes starting loan" on, and a campaign-level
   starting loan amount of `200 gp`, **When** the DM creates
   loop 5 and clicks "Применить" in the banner, **Then** 20
   transactions exist for loop 5 on day 1 (10 starting-money
   rows + 10 starting-loan rows), each with its correct actor,
   amount, category, and autogen marker, and the banner
   disappears.
2. **Given** the same campaign but with Lex's "takes starting
   loan" flag flipped off, **When** the DM applies the setup,
   **Then** 9 `credit` rows exist for loop 5 (not 10), Lex's
   wallet on day 1 still shows his starting money, and no
   `credit` row exists for Lex.
3. **Given** the campaign has a stash seed of `50 gp + 5
   arrows`, **When** the DM applies the setup, **Then** the
   stash page for loop 5 shows a Wallet of `50 gp` and an item
   grid with a single `arrows, qty: 5` row — all on day 1.
4. **Given** the campaign has no starter config filled in
   (every PC's starting money is blank, stash seed is empty,
   starting loan is 0), **When** the DM clicks "Применить",
   **Then** zero transactions are generated, every wallet shows
   `0 gp` on day 1, and the banner disappears (an explicit
   "applied empty config" still counts as applied). No error
   or warning.
5. **Given** the DM creates loop 5 but does **not** click
   "Применить" (she's prepping in advance, loop 4 is still
   current), **When** she or a player navigates to loop 5's
   page, **Then** no transactions have been generated, loop 5's
   ledger is empty, and the DM still sees the banner. Players
   see loop 5 as-is with no banner and no setup UI (FR-005b).
6. **Given** the DM misclicks "New loop" in the catalog,
   **When** she deletes the accidentally created loop within
   seconds, **Then** zero ledger rows exist for the deleted
   loop and the catalog returns to its prior state. "Silent
   150-row insert on misclick" is structurally impossible.

---

### User Story 2 — Player's PC has no loan and starts the loop with only their starting money (Priority: P1)

Lex's player has decided, narratively, that Lex is not the kind
of person who takes money from the academy's credit pool. Before
loop 5 begins, the DM opens Lex's PC starter config and flips
the **"берёт кредит в начале петли"** checkbox off. Lex's
starting money (`150 gp` in his case — his background is
wealthy) is kept on. When loop 5 is created, Lex's wallet on
day 1 shows `150 gp`; no `credit` row appears for Lex in loop 5.

**Why this priority**: this is the single concrete per-PC
override the mat-ucheniya campaign actually needs, and it's also
the canonical example of the broader principle "a PC can opt out
of a wizard". Without it the autogen layer is a one-size-fits-
all sledgehammer, and Lex's player has to manually delete a row
every single loop.

**Independent Test**: in Lex's starter config, turn off the
"takes starting loan" flag. Create a new loop. Expect Lex's
day-1 ledger to show **one** row (his starting money), not two,
while every other PC with the flag on shows two rows.

**Acceptance Scenarios**:

1. **Given** Lex's "takes starting loan" flag is off and his
   starting money is `150 gp`, **When** loop 5 is created,
   **Then** exactly one transaction exists for Lex on day 1 of
   loop 5 — a `+150 gp` row with the autogen marker for
   starting money.
2. **Given** Lex's starting money is also set to `0` (he starts
   loop 5 with nothing), **When** loop 5 is created, **Then**
   no transactions are generated for Lex at all. Lex's Wallet
   block on the PC page for loop 5 shows `0 gp` with no error.
3. **Given** the DM later flips Lex's flag back on mid-loop (loop
   5 is already running), **When** she re-runs the setup for
   loop 5 (see US3), **Then** a `credit` row appears for Lex in
   loop 5 dated day 1. Lex's current-loop wallet includes the
   credit. No other rows in loop 5 are disturbed.

---

### User Story 3 — DM edits a starter config and reapplies it to an existing loop (Priority: P1)

Mid-loop, the DM realises the starting loan should have been
`250 gp` instead of `200 gp`. She opens the campaign's starter
config, changes the loan amount, and clicks **"Reapply to loop
5"**. Every PC's `credit` row in loop 5 updates from `200 gp`
to `250 gp` (wallets shift accordingly), and **no other rows
change** — the reapplication doesn't touch starting-money rows,
doesn't touch regular gameplay transactions, doesn't re-seed
the stash.

**Why this priority**: the DM will inevitably get the config
wrong on the first try, or want to tune it after playtesting a
loop. Without a "reapply" affordance the DM has to either
(a) live with the wrong values for the rest of the loop, or
(b) manually edit 29 rows. Neither is acceptable.

**Independent Test**: with loop 5 already created and populated,
change the campaign's starting loan from `200` to `250`, click
"Reapply to loop 5", and verify that every `credit` row in
loop 5 now shows `250 gp`. Verify starting-money rows are
untouched. Verify no regular gameplay transactions (e.g. a
`-5 gp potion` row) are touched.

**Acceptance Scenarios**:

1. **Given** loop 5 exists with 10 `credit` rows at `200 gp`
   each, **When** the DM changes the loan to `250 gp` and
   clicks "Reapply to loop 5", **Then** each of those 10
   `credit` rows is now `250 gp` (or the old row is replaced
   by a new one at `250 gp` — the spec-level guarantee is "only
   the amounts differ", not the implementation strategy). Every
   wallet shifts by `+50 gp`.
2. **Given** the DM made a gameplay transaction (`-5 gp potion`
   on Marcus, day 7 of loop 5) and then reapplies the setup,
   **When** the rerun completes, **Then** the `-5 gp potion`
   row is untouched — reapplication only touches rows tagged
   with an autogen marker matching the rerun.
3. **Given** Lex's "takes starting loan" flag was on during the
   first run and is off when the DM reapplies, **When** the
   rerun completes, **Then** Lex's old `credit` row is deleted,
   no new one is created in its place, and no other rows are
   affected. His wallet drops by the old credit amount.
4. **Given** the DM reapplies while no config has changed, **When**
   the rerun completes, **Then** the final set of rows is
   identical to the pre-rerun set (modulo the wizard
   marker's internal bookkeeping). No spurious diff appears in
   the ledger.
5. **Given** the DM manually deleted Marcus's starting-money
   row for loop 5 before the reapply, **When** she clicks
   "Пересобрать сетап", **Then** a confirmation dialog opens
   listing exactly one row: "Marcus, стартовые деньги, было:
   удалено вручную, станет: +100 gp". On confirm, the row is
   regenerated and the hand-touched flag on it is reset. On
   cancel, the rerun aborts — the row stays deleted, no other
   rows change.
6. **Given** the DM attempts to reapply the setup for loop 5,
   **When** she has not changed anything but wants to force a
   refresh (e.g. a PC was added after loop 5 was created; see
   US4), **Then** the system runs the full reconciliation
   pipeline — missing rows are generated, obsolete rows are
   removed, matching rows stay — and since no rows were
   hand-touched, the run proceeds without a confirmation
   dialog.
7. **Given** the DM hand-edited Marcus's starting-loan row
   yesterday (changed the amount from `+200 gp` to `+150 gp`
   because of a one-off narrative event), and today she clicks
   "Пересобрать сетап" for an unrelated reason (a PC was
   added — US4), **When** the reapply runs, **Then** a
   confirmation dialog lists the hand-edited row: "Marcus,
   стартовый кредит, вручную: +150 gp, из конфига: +200 gp".
   The DM can confirm (row snaps back to +200) or cancel (the
   entire run aborts; the new PC is not added either). There
   is no "confirm just some of the rows" option — it's
   all-or-nothing for the run.
8. **Given** the confirmation dialog listed five hand-touched
   rows, **When** the DM confirms and the run completes,
   **Then** all five rows now match the config AND their
   hand-touched flags are reset. A subsequent reapply with no
   further hand-edits runs without a dialog.

---

### User Story 4 — A PC added mid-campaign gets caught up on the current loop's setup (Priority: P2)

A new player joins in the middle of loop 5. The DM creates a
new PC node, fills in the PC's starter config (starting money,
loan flag), and wants the new PC to be "present" in loop 5 from
day 1 — same treatment as everyone else, no rigged
disadvantage. She clicks **"Reapply to loop 5"** (same
affordance as US3). The new PC's starting-money and loan rows
are generated for loop 5; no other PC is affected.

**Why this priority**: new PCs mid-campaign are common in
mat-ucheniya (drop-ins, new players joining). Without this flow
the new PC has to either (a) wait until the next loop, or
(b) get their setup manually pencilled. "Reapply to loop N" is
the same affordance as US3; this story just confirms it also
catches up newcomers.

**Independent Test**: add a new PC to a campaign mid-loop (loop
5 already exists). Fill in starter config. Click "Reapply to
loop 5". Expect the new PC to have their setup rows for loop 5
on day 1.

**Acceptance Scenarios**:

1. **Given** loop 5 has 10 PCs with setup rows and a fresh PC
   is added to the campaign at in-game day 12 of loop 5,
   **When** the DM reapplies the setup, **Then** the new PC
   gets a full set of starter rows dated day 1 of loop 5 — as
   if they had been there from the start. No other PC is
   touched.
2. **Given** the new PC's player does not want the starting
   loan, **When** the DM reapplies, **Then** the loan flag
   being off is respected — only the starting-money row is
   generated.
3. **Given** a PC is removed from the campaign after loop 5 is
   created (e.g. the PC node is deleted), **When** the DM
   reapplies, **Then** the deleted PC's old setup rows remain
   in loop 5's history and are **not** removed by the rerun —
   they are orphaned but historically accurate. (Spec-010
   FR-024 already handles "deleted PC" references gracefully
   everywhere else.)

---

### User Story 5 — Starting items ship alongside starting money (Priority: P1)

A Fighter's starter kit includes a longsword and 20 arrows.
A Wizard's starter kit includes a spellbook and 3 scrolls. Each
PC's starter config can list starting items (name + qty).
When a loop is created, each item in each PC's starter list
produces a `kind='item'` transaction on day 1 with that PC as
the actor — no transfer pair, since nothing is moving from
elsewhere; it's just "this PC begins the loop holding this
item". The stash seed uses the same mechanism on the stash node.

**Why this priority**: ships in the same release as money/loan
because the mat-ucheniya campaign uses starter kits and they
are as tedious to replay by hand as the money rows. Also, items
being part of the same framework is what makes the framework
worth having — if items were out, the DM would be pencilling
items every loop and the wizard would only cover half the
work. Per spec-011, items in the stash are free-text rows; the
same rule applies here — starter items are free-text strings
with integer qty, no item catalog (spec-015 will change that
globally).

**Independent Test**: fill in a PC's starter items list with
`longsword, qty 1` and `arrows, qty 20`. Create a new loop.
Expect two `kind='item'` rows in the new loop for that PC on
day 1 — one per starter item — with the correct names and
quantities.

**Acceptance Scenarios**:

1. **Given** a Fighter PC has starter items `{longsword: 1,
   arrows: 20}`, **When** a new loop is created, **Then** two
   `kind='item'` transactions land on day 1 for that PC — one
   with `item_name=longsword, qty=1`, one with
   `item_name=arrows, qty=20`. Each carries the wizard
   marker for starting items.
2. **Given** the stash seed is `{healing potion: 2, rope: 1}`,
   **When** a new loop is created, **Then** two `kind='item'`
   rows land on day 1 with the stash as actor.
3. **Given** a PC has no starter items list (empty), **When**
   a new loop is created, **Then** no item rows are generated
   for that PC. Money and loan rows are unaffected — an empty
   item list is not an error.
4. **Given** the DM edits a PC's starter item list (adds a
   "torch, qty 2") and reapplies, **When** the rerun completes,
   **Then** a new `kind='item'` row appears for that PC with
   `item_name=torch, qty=2`. The pre-existing starter item
   rows for that PC remain correct for the other items.
5. **Given** the DM removes `arrows` from a PC's starter items
   list and reapplies, **When** the rerun completes, **Then**
   the `arrows` row dated day 1 of that loop is gone for that
   PC. Any other row — including a manual `+arrows` row the PC
   picked up mid-session — is untouched.
6. **Given** the DM hand-edits a starter item row mid-loop (e.g.
   changes `arrows, qty 20` to `arrows, qty 25` because of a
   house rule retroactively applied), **When** she does not
   reapply, **Then** the edit stands as a normal row edit. If
   she later reapplies, **Then** the row snaps back to the
   config value. This is the same "reruns are authoritative
   over autogen rows" rule as US3.

---

### User Story 6 — Autogen rows look different in the ledger (Priority: P2)

When a player or DM browses the ledger, a row generated by a
starting-setup wizard is visibly distinguishable from a
row they typed in themselves — a small badge ("стартовый
сетап" / "авто") or a subtly different tint. Clicking the badge
opens a hint explaining which wizard produced the row and
on which loop. The author of the row is the system (or the DM
who created the loop; exact attribution is in Clarify).

**Why this priority**: without this, the ledger's "who typed
what" narrative breaks. A player scrolling the ledger sees
`+200 gp credit` with no context and has no way to know whether
they themselves typed it, whether the DM pencilled it in, or
whether the system auto-generated it at loop start. Marking
the row is cheap and prevents ongoing "wait, did I enter that?"
confusion.

**Independent Test**: after loop 5 is created, open the ledger
page. Expect every starter row to show an "auto" badge or
equivalent affordance. Expect every non-starter row to look
identical to spec-010 / spec-011 rows.

**Acceptance Scenarios**:

1. **Given** loop 5 has been set up, **When** the user opens
   `/accounting`, **Then** every starter row is visibly tagged
   (badge / icon / tint) and every non-starter row is untagged.
2. **Given** the user clicks the tag on a starter row, **When**
   the hint opens, **Then** the hint says which wizard
   produced the row ("starting money", "starting loan",
   "stash seed", "starting items") and on which loop — no
   more detail needed at this level.
3. **Given** filter bar is on the ledger page, **When** the
   user filters by "only show automated rows" or the
   equivalent, **Then** the ledger shows only autogen-tagged
   rows. (Or the equivalent negated filter "hide automated
   rows" — exact filter UX is `plan.md`.)

---

### User Story 7 — DM deletes a loop and all its setup rows go with it (Priority: P2)

The DM created loop 6 by accident and wants to delete it before
any sessions happen. She deletes loop 6. Every autogen row
generated for loop 6 — starter money, starter loans, starter
items, stash seed — disappears with it. No orphaned day-1 rows
linger in the ledger.

**Why this priority**: without this, deleting a mis-created loop
leaves 60+ orphaned rows in the ledger dangling against a loop
number that no longer exists. This compounds fast if the DM
miscreates a loop a few times. Cleanup is a one-time action
and should not be a manual chore.

**Independent Test**: create loop 6. Delete loop 6. Open the
ledger. Expect no transactions with `loop_number=6`.

**Acceptance Scenarios**:

1. **Given** loop 6 has been set up with 60 autogen rows,
   **When** the DM deletes loop 6, **Then** those 60 rows are
   removed alongside the loop. Gameplay rows (if any) in loop
   6 — *which shouldn't exist yet, but hypothetically* — are
   governed by the same loop-delete cascade that spec-009 /
   spec-010 established; this story does not change that rule,
   only confirms autogen rows follow it.
2. **Given** loop 6 has been set up and a gameplay transaction
   was logged (e.g. `-5 gp potion` on Marcus, day 3 of loop 6),
   **When** the DM tries to delete loop 6, **Then** the system
   warns that there are player-entered transactions in loop 6
   and asks for confirmation — exact confirmation UX is
   `plan.md`. If confirmed, everything goes; if cancelled,
   nothing changes. (This rule predates spec-012 for gameplay
   rows; spec-012 just confirms autogen rows don't add a
   new warning layer — they are cascaded silently.)

---

## Requirements

### Functional Requirements

**Configuration surface**

- **FR-001**: A campaign MUST have a **campaign-level starter
  config** with at least these fields: starting loan amount
  (default 0), stash seed coins (default empty), stash seed
  items (default empty list of `{name, qty}` pairs). Absence of
  the config or an empty config MUST be a valid state — it just
  means "no wizard applies at the campaign level".
- **FR-002**: Every PC MUST have a **PC-level starter config**
  with at least these fields: starting money coins (default
  empty), "takes starting loan" boolean flag (default true),
  starting items list (default empty list of `{name, qty}`
  pairs). Absence or emptiness MUST be a valid state — the PC
  simply contributes no rows to the setup.
- **FR-003**: The DM MUST be able to edit every field in both
  the campaign-level and PC-level starter configs. A player
  MUST be able to flip the **"takes starting loan"** boolean on
  PCs they own (owner-writable), directly from their PC page;
  every other PC-level field (starting money coins, starter
  items list) and every campaign-level field (loan amount,
  stash seed) MUST remain DM-only. The flag is the one
  narrative choice owned by the character's author — "my
  character doesn't borrow" — and the spec explicitly frames
  it as player-owned to avoid per-loop ping-the-DM friction.
  All other fields are balance-adjacent decisions owned by
  the DM.
- **FR-003a**: A flag edit by a player takes effect only on
  the **next reapply** (FR-011) for loops where autogen rows
  already exist. Spec-012 does NOT auto-propagate a flag flip
  retroactively into already-applied loops. The DM reapplies
  (or the player asks them to) when they want the change to
  materialise. For loops where the setup has not yet been
  applied at all (FR-005 / FR-005a), the new flag value is
  simply read during the upcoming first apply.
- **FR-004**: The starter configs MUST persist as part of the
  campaign / PC data model. They MUST NOT be hidden in a JSONB
  dump on an unrelated row; their semantic location is "next
  to the campaign config / the PC config", reachable by the
  graph. (Exact schema shape — `plan.md`.)

**Autogen trigger: explicit DM action with "unapplied" banner**

- **FR-005**: Creating a new loop node MUST NOT automatically
  generate any spec-012 autogen rows. Loop creation is a pure
  structural act (node appears in the catalog, loop_number is
  assigned, `day_from/day_to` inherit defaults from spec-009);
  the ledger is not touched. Rationale: prepping a loop in
  advance of play — creating loop 6 while loop 5 is still
  running, to schedule sessions — is a common mat-ucheniya
  workflow. Pre-seeding the ledger for an unplayed loop causes
  wallet confusion and looks like a bug; misclicks on the
  catalog should not have silent 150-row side effects.
- **FR-005a**: A loop page in DM mode MUST display a
  persistent, unmissable banner ("Стартовый сетап ещё не
  применён — [Применить]") for every loop that has **zero**
  spec-012 autogen rows. The banner is the primary entrypoint
  to the first apply. It disappears automatically the moment
  at least one spec-012 autogen row exists for that loop. This
  is the "DM can't forget to apply setup" safety net — without
  it, option-C ("explicit apply") would regress to "party plays
  session 1 of loop 6 with empty wallets because nobody
  remembered".
- **FR-005b**: Players MUST NOT see the banner or the apply
  affordance. The apply action is a DM responsibility; a
  player landing on the loop page during prep phase sees the
  loop as-is (no banner, no setup UI, no generated rows yet).
- **FR-006**: If the starter configs are empty (nothing to
  generate), apply / reapply MUST succeed with zero generated
  rows and the banner MUST still clear (FR-005a) — "applied
  with empty output" is a valid outcome, not an error.
- **FR-007**: Rows produced by the wizards MUST be normal
  spec-010 transactions — with a `loop_number` equal to the new
  loop, `day_in_loop=1`, `session_id=NULL`, `status='approved'`,
  and the appropriate `category` (`credit` for loans — consistent
  with roadmap; a category slug for starting money and starting
  items — exact slug is `plan.md`, but it MUST be a category
  the campaign has either seeded or will auto-seed via
  spec-010's category machinery).

**Autogen marker**

- **FR-008**: Every row produced by an autogen wizard MUST
  carry an **autogen marker** that identifies (a) a short
  stable **wizard key** — one per wizard (`starting_money`,
  `starting_loan`, `stash_seed`, `starting_items` in spec-012;
  `encounter_loot` expected in spec-013; future keys in later
  specs) — and (b) a **source-node reference** identifying the
  node the row was generated from. For all four spec-012
  wizards, the source node is the **loop**; for spec-013's
  wizard it would be the **encounter**; later wizards point at
  their own source nodes. The marker MUST be an orthogonal
  property of a transaction — it does not replace `kind`,
  `category`, `session_id`, or any existing column, and it does
  not define a new `kind`. Its exact schema shape is `plan.md`
  (one column, two columns, JSONB — all acceptable so long as
  both facts are queryable).
- **FR-008a**: The autogen marker space — the set of legal
  wizard keys — MUST be open-ended. Adding a new wizard in a
  future spec MUST NOT require a schema migration, a CHECK
  constraint update, or any change to the transactions table
  beyond seeding a new category if the wizard introduces one.
  The marker column(s) MUST accept arbitrary stable-string
  wizard keys; validation of "is this a known key" is an
  application-layer concern, not a database concern.
- **FR-008b**: A wizard's entire output for a given
  `(wizard_key, source_node)` pair MUST be discoverable by a
  single indexed query. Concretely, `plan.md` MUST specify an
  index (or indexes) such that "fetch every row tagged with
  wizard X for source Y" is O(output-size), not O(all-
  transactions). This is the primitive spec-013's reconcile
  will depend on.

**Per-PC opt-out for the loan**

- **FR-009**: A PC whose "takes starting loan" flag is `false`
  MUST NOT produce a starting-loan row on apply or reapply
  (FR-011) — the flag's sole effect is to skip that wizard for
  that PC. Their starting money and starting items rows are
  produced as normal.
- **FR-010**: The flag is a simple boolean. There is no
  per-PC loan amount override in this spec — if a PC takes a
  loan, it's the campaign's default amount; if a PC doesn't,
  it's zero. (A future spec that adds "per-PC loan amounts"
  can do so without changing the autogen layer — it's a new
  column on the PC starter config, not a new wizard.)

**Apply / Reapply**

- **FR-011**: The DM MUST have a single loop-page affordance
  that runs spec-012's four wizards against the current loop
  as source. The **same code path** handles both the **first
  apply** (no autogen rows exist yet — banner from FR-005a is
  visible, button label reads "Применить стартовый сетап") and
  every subsequent **reapply** (autogen rows already exist —
  banner is hidden, button lives in the loop's setup-settings
  section, label reads "Пересобрать сетап"). Behaviour is
  identical: reconcile the ledger against the current config,
  add missing rows, remove obsolete rows, update mismatched
  rows. Idempotent per wizard — running with unchanged config
  produces the same final row set. Runs **only the four
  spec-012 wizards** (source = this loop); wizards with
  different source nodes (spec-013 `encounter_loot`, future
  wizards) have their own triggers and reapply UIs.
- **FR-012**: The reapply MUST reconcile against the autogen
  marker (FR-008) and MUST NOT touch rows that were not
  produced by a matching `(wizard_key, source_node)` pair.
  Gameplay rows, manually pencilled rows, rows imported from
  elsewhere, AND rows produced by other wizards (even in the
  same loop) — all untouched.
- **FR-013**: If a config change between the prior run and the
  rerun means some row is no longer needed (e.g. the starting
  loan was set to 0, or a PC's "takes starting loan" was
  flipped off, or a starter item was removed from the list),
  the rerun MUST remove the corresponding autogen-tagged
  row. "Remove" here is a data-level delete — the row is
  gone from the ledger, not soft-hidden. The history of the
  rerun itself is not tracked by spec-012; the DM can recover
  from a mistake by re-adding to the config and reapplying.
- **FR-013a**: Spec-012 MUST track, per autogen row, whether
  that row has been **hand-edited or hand-deleted** after its
  initial generation — i.e. mutated through any path other
  than the apply/reapply action (FR-011). Edits via the normal
  spec-010 transaction-edit form set the "hand-touched" flag;
  deletion via the normal row-delete affordance MUST also be
  detectable by the next reapply (the row is gone, but its
  prior `(wizard_key, source_node)` should be identifiable as
  "was here, got deleted by hand"). The exact storage —
  a boolean column, an `edited_at` timestamp, a tombstone row,
  a per-row version counter — is a `plan.md` decision.
- **FR-013b**: Every apply and reapply run MUST first compute
  the set of hand-touched rows it is about to **overwrite,
  update, or re-create** (re-create applies to rows that were
  hand-deleted). If that set is non-empty, the system MUST
  present the DM with a **confirmation dialog** listing each
  affected row with minimally: actor, current ledger value
  (or "deleted by hand"), config-computed value, and the
  wizard key that owns it. The run MUST NOT proceed until the
  DM explicitly confirms. Cancelling the dialog aborts the
  entire run — no rows are added, removed, or changed. If the
  hand-touched set is empty, apply/reapply runs immediately
  with no dialog.
- **FR-013c**: A successful apply/reapply run MUST clear the
  "hand-touched" flag on every row it produced or updated —
  post-run, every autogen row in the loop is by definition
  "freshly generated" until the next hand-edit flips the flag
  back on. This rule is what makes the confirmation dialog
  non-spammy across repeated reapplies.
- **FR-013d**: Rows produced or updated by apply/reapply
  itself — even when the DM confirmed the overwrite of a
  hand-edit — MUST NOT be flagged as hand-touched on the
  resulting row. Apply is the opposite of a hand-edit.
- **FR-014**: If the prior run's rows include a row tagged
  with a matching `(wizard_key, source_node)` but the current
  config would not generate it (e.g. the actor is no longer in
  the campaign — a deleted PC), the rerun MUST leave the
  orphan row in place. Orphan rows from deleted PCs are a
  spec-010 / spec-011 concern, not a spec-012 concern.

**Visibility**

- **FR-015**: Transactions tagged by an autogen marker MUST be
  **visibly distinct** in any ledger view (PC page, stash
  page, `/accounting`, session page). The exact visual — badge,
  icon, tint, row background — is `plan.md`. The spec-level
  guarantee is "a player scrolling the ledger can immediately
  tell which rows are autogenerated". The visual applies to
  every wizard, not just spec-012's — spec-013's encounter-
  loot rows will inherit the same visual treatment by virtue
  of carrying an autogen marker.
- **FR-016**: The filter bar on the ledger page MUST offer a
  filter for autogen rows — either "show only autogen" or
  "hide autogen", or both. Exact filter UX is `plan.md`. When
  spec-013 lands, the filter MAY be extended to allow
  filtering by wizard key; that refinement is out of scope for
  spec-012, which only needs the binary filter.
- **FR-017**: The autogen badge's hover / tap affordance MUST
  surface the wizard key and the source node. One line of text
  is sufficient (e.g. "starting loan · loop 5"). For spec-013
  it would read "encounter loot · <encounter title>". The
  affordance is wizard-agnostic — it reads the marker, not a
  per-spec lookup.

**Author attribution**

- **FR-018**: The author recorded on an autogen-generated
  row is the user who triggered the run — concretely, the
  user who created the loop (US1) or the user who pressed
  "Reapply" (US3). This keeps spec-010's "every row has an
  author" invariant intact with no new concept. Future wizards
  in later specs follow the same rule with their own triggers
  (e.g. the user who pressed "Distribute loot" in spec-013).
- **FR-019**: On reapply, rows that are regenerated (because
  their config changed) MUST have their author updated to the
  user who pressed "Reapply". Rows that are untouched keep
  their original author. This is the simplest consistent rule
  and matches the intuition "the author is whoever took the
  action that put the row here right now".

**Loop deletion**

- **FR-020**: Deleting a loop MUST cascade-delete every row
  whose source node is that loop — which in spec-012 covers
  every autogen row produced by the four spec-012 wizards.
  The cascade MUST follow whatever rule the project already
  has for deleting a loop; spec-012 does not introduce a new
  confirmation dialog or new cascade behaviour for autogen
  rows specifically. They are ordinary rows from the cascade's
  perspective. When spec-013 lands, rows whose source is an
  encounter do NOT belong to the loop cascade — they follow
  an encounter-delete cascade defined by spec-013.
- **FR-021**: Gameplay rows in a to-be-deleted loop follow the
  existing spec-010 / spec-011 cascade rules and any
  confirmation UX the project already provides; spec-012 does
  not alter those rules.

### Non-Functional / Performance

- **FR-022**: The **first apply** on a newly created loop in
  a campaign with 30 PCs and a fully filled starter config
  (30 starting-money rows + up to 30 starting-loan rows + up
  to ~3 items × 30 PCs + a stash seed of ~5 items) — i.e.
  ~150 generated rows — MUST complete in ≤ 1 s wall-clock on
  the mat-ucheniya production baseline. The generation MUST
  be a single server action, not a client-side loop of 150
  inserts.
- **FR-023**: Reapply MUST also be a single server action with
  the same latency budget. A rerun on the same 150-row loop
  MUST NOT produce more than one round trip per wizard (i.e.
  ≤ 4 round trips total; ideally one).

---

## Key Entities

- **Autogen wizard** (new concept, generic to the layer). A
  piece of code identified by a short stable key (e.g.
  `starting_money`) that reads a source node and deterministi-
  cally produces a set of transactions. Spec-012 ships four
  wizards (`starting_money`, `starting_loan`, `stash_seed`,
  `starting_items`), all with the loop as their source node.
  Spec-013 is expected to ship a fifth wizard
  (`encounter_loot`) with the encounter as its source node.
  Future specs add more keys.
- **Campaign starter config** (new). A set of campaign-scoped
  fields: starting loan amount (scalar), stash seed coins
  (coin set), stash seed items (list of `{name, qty}`).
  Consumed by the `starting_loan` and `stash_seed` wizards.
- **PC starter config** (new). A set of PC-scoped fields:
  starting money coins (coin set), takes-starting-loan flag
  (bool), starting items (list of `{name, qty}`). Consumed by
  the `starting_money`, `starting_loan`, and `starting_items`
  wizards.
- **Autogen marker** (new property on transactions). Records
  the `(wizard_key, source_node)` pair that produced a row.
  Orthogonal to `kind` / `category` / `session_id`. Future
  specs introduce new wizards by picking new keys and new
  source nodes; the schema does not change.
- **Transaction** (unchanged from spec-010 / spec-011). The
  autogen layer produces ordinary transactions that happen to
  carry the marker above.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Spinning up a new loop with a 29-PC campaign
  and a filled starter config is: (1) create loop node in the
  catalog, (2) open the loop page, (3) click "Применить" in
  the banner. Three clicks. The ledger and all wallets
  populate for the new loop. Misclicking "create loop" and
  deleting the node within seconds leaves zero ledger residue
  (FR-005 guarantees no auto-gen on create).
- **SC-002**: Time spent by the DM on "prepping a new loop"
  drops from the current estimate of 10–15 minutes of hand-
  pencilling to under 30 seconds of "create loop, click
  Применить, eyeball generated rows". Qualitative, owner-
  reported, one pilot loop.
- **SC-003**: Reapply on a 29-PC loop with ~150 autogen rows
  and no hand-edits completes in ≤ 1 s wall-clock (no dialog
  shown) and touches zero rows outside the autogen marker
  (verified against a canary gameplay row placed before the
  reapply).
- **SC-004**: Flipping a single PC's "takes starting loan" flag
  off and reapplying removes exactly one row (that PC's
  `credit` row) and no others. Verified by row-count diff.
- **SC-005**: Spec-013 adds its `encounter_loot` wizard by
  introducing **one new wizard key and one new source-node
  type (the encounter)** — no migration, no change to the
  transactions table, no duplication of the reconcile logic
  spec-012 ships. This is the "did the autogen layer actually
  generalise, or is it a single-use module in disguise" check;
  it is only verifiable once spec-013 actually lands, but the
  spec-012 `plan.md` MUST be written such that this claim is
  credible (i.e. the marker is wizard-agnostic, the reconcile
  helper is parameterised on `(wizard_key, source_node)`, and
  no spec-012-specific assumption leaks into either).
- **SC-006**: Zero HTTP 500 on apply / reapply when the
  starter config references a deleted PC node, a deleted
  stash node, or an unreachable campaign — same standard as
  spec-010 SC-005 and spec-011 SC-005.

---

## Assumptions

- **A single campaign has exactly one starter config.** Per-party
  or per-subgroup starter configs (e.g. "party A starts with 200
  gp, party B starts with 150 gp") are out of scope. The current
  campaign uses one default for everyone with a per-PC boolean
  opt-out for the loan — nothing more granular is needed.
- **Per-PC loan amount override is not needed yet.** Lex's case
  is "I don't take the loan at all" (boolean), not "I take a
  smaller loan" (amount). If future campaigns need per-PC
  amounts, a later spec adds a column; the framework does not
  change.
- **Starter items are free-text, just like spec-011 stash
  items.** No item catalog, no `item_node_id` on starter rows.
  Spec-015 will eventually tie item names to item nodes
  globally; when that happens, starter items inherit the
  improvement for free (the wizard produces
  `kind='item'` rows and spec-015 upgrades the grid on both
  sides of the stash ↔ PC symmetry).
- **Starter items can carry any name, including unique
  narrative items.** "Документы на дом", "Медальон отца",
  "Долговая расписка барону" are valid starter-item names,
  distinguished from stackables ("20 arrows") only by being
  `qty = 1` with a distinctive string. Spec-012 adds no
  "is this unique?" flag — the difference is purely in the
  name. Spec-015 will later separate unique item-nodes from
  generic names globally once the item catalog lands.
- **Starter items are DM-edited in spec-012 by choice, not by
  architectural constraint.** The per-PC starter config is
  player-readable; spec-012 locks item writes to the DM for
  operational simplicity. Once spec-014 ships the approval
  flow, a future spec may let a player draft changes to their
  own PC's starter items and submit them for DM approval — the
  underlying data shape does not change, only the write
  permission layer does.
- **Item location and equip state are forward-compat, not
  implemented.** Today the actor column on a `kind='item'` row
  simultaneously answers "who owns it?" and "where is it?".
  Tomorrow that pair of questions will split — a future spec
  will add a location-node reference and a carried/stored/
  equipped marker to item transactions. Spec-012's starter-
  items rows will interpret those future columns as
  `NULL = "lives at the actor"`, which is exactly today's
  behaviour. `plan.md` must not lock in any column layout that
  precludes this extension.
- **Starter transactions are dated day 1 of the loop, period.**
  No configurable "day N of the loop" for setup rows in this
  spec. If a future wizard wants "rent auto-debit on day
  15", it's a different wizard with its own config; the
  starting-setup wizards are always day 1.
- **Starter transactions have `session_id=NULL`.** Starter
  setup is **not** tied to a session — it's part of the
  loop's pre-session state. Consistent with spec-010's
  allowance for off-session transactions (`session_id` is
  nullable by design).
- **Starter transactions are `status='approved'` from the
  moment they are generated.** Spec-014 will later introduce
  approval flow; when it does, the rule "DM-authored rows are
  auto-approved" already covers autogen rows (the "author"
  is the DM triggering the run — FR-018). No spec-014-shaped
  change is needed here.
- **Autogen rows are editable and deletable under the same
  rules as any other row** (spec-010 FR-020). A DM can pencil
  a starter row to a different amount mid-loop without
  reapplying; the edit stands until the next reapply. The
  next reapply will detect the hand-edit, list it in a
  confirmation dialog (FR-013b), and wait for the DM's
  explicit approval before snapping the row back to the
  config. No silent overwrites — hand-edits are treated as
  real signals, not noise to be ignored.
- **No notification / audit trail of wizard runs beyond the
  transactions themselves.** Each rerun produces the new state;
  the history of config changes is not captured by spec-012.
  If a DM wants to know "what did I change last loop?", they
  compare the current config to their memory. If this becomes
  a pain point, a later spec adds config history.
- **No realtime push.** If two DMs coincidentally trigger a
  reapply at the same second, last-write-wins applies (same
  as everywhere else in the project). Expected frequency of
  this collision: effectively zero in a solo-DM-per-campaign
  setup.
- **No wizard framework generalisation beyond what the first
  four wizards demand.** Spec-012 does not ship a "define
  a new wizard in the UI" tool. Future wizards are
  coded in, same as the four shipped here. Generalising to a
  user-configurable wizard DSL is explicitly a future-spec
  concern (if ever).
- **The trigger is the DM's explicit apply action, not loop
  creation or "mark as current".** Loop creation is a pure
  structural act — it adds a node, nothing else. "Mark as
  current" is a view-lens flip (consistent with spec-010 /
  spec-011). Autogen rows appear only after the DM clicks
  "Применить стартовый сетап" on the loop page. The DM can
  prep loop 6 in advance, leave the banner up for days, and
  click Применить only when the first session of loop 6 is
  about to start.
- **Deleting a loop cascades its spec-012 autogen rows.** All
  four spec-012 wizards use the loop as their source node, so
  every autogen row they produce is cascaded through the
  deletion of the loop node. Spec-012 does not introduce a new
  cascade path or new confirmation UI — the cascade follows
  whatever rule the project has for deleting a node and its
  dependent rows. When spec-013 lands, encounter-sourced rows
  cascade through encounter deletion instead, not loop
  deletion — two sources, two cascades, same pattern.

---

## Out of Scope

- **Per-PC starting loan amount.** Only a boolean flag ships;
  a non-uniform loan amount is a future spec if ever needed.
- **Class-based / background-based starter kits** — e.g.
  "Fighter gets longsword+20 arrows automatically because the
  class field says Fighter". The PC's starter items are typed
  in manually per PC in this spec; class-based templating is a
  future wizard.
- **Mid-loop wizards** — rent, upkeep, recurring income,
  downtime shopping. The framework is deliberately built to
  accept these in later specs; none of them ship here.
- **A "preview the diff before reapply" modal.** The reapply
  just runs; if the result is wrong, the DM edits the config
  and reapplies again. Preview is a nice-to-have, not a
  spec-012 requirement.
- **Multi-stash starter configs** — spec-011 ships one stash
  per campaign; multi-stash is its own future spec and will
  carry its own starter-config semantics.
- **History of config changes over time** (audit log).
- **A UI for defining new wizard keys** (wizard DSL /
  plugin system). New wizards are added by future specs at
  the code level.
- **Realtime propagation** of loop create / reapply to other
  browser tabs — polling / page reload is sufficient, same
  everywhere else in the project.
- **Export of the starter config** (CSV/JSON). The project-wide
  ledger export will cover generated rows; the config itself
  is exportable if and when the graph export ships.
- **Campaign-level per-loop overrides** (e.g. "this loop only,
  everyone gets +50 gp as a Christmas bonus"). A DM who wants
  this can manually add a row after generation. If it becomes
  a pattern, a future wizard layer handles it.
- **Item fuzzy matching / autocomplete from prior loops'
  starter items.** Exact strings only, same as spec-011.
- **Per-session starter top-ups** (e.g. "every session, the
  party's stash gets +10 gp").
- **An editor UI for the campaign constitution's "starting
  conditions" narrative text.** The starter config is data; a
  sibling human-readable document is out of scope.
- **Item location and equip state on starter items.** Spec-012
  stores a starter item as "the PC owns this on day 1 of this
  loop", nothing more. Whether it's equipped, in the pack, at
  the PC's house, or at a shared location node is a future-spec
  concern. Spec-012's `plan.md` MUST design the transactions
  column layout such that adding those columns later is a
  single `ALTER TABLE ADD COLUMN ... NULL` away, with no data
  migration and no wizard rewrite.
- **PC movement between location nodes.** Spec-012 does not
  introduce a "PC is at location X on day N" edge, a PC
  position state, or any location-aware logic. Characters are
  still just ledger actors. Future specs will add the graph
  model for PC mobility; spec-012's starter-items transactions
  remain correct without it because `actor_pc_id = PC` means
  "PC owns this on day 1", which is the only requirement
  today.
- **Wipeable location nodes.** The constitution-I rule
  ("every wipeable actor sees a fresh-zero view at loop
  rollover") will extend to location nodes once those become
  first-class ledger actors in a future spec. Spec-012 does
  not introduce that extension — it stays as a documented
  assumption, not a coded feature.

---

## Clarifications

### Round 1 — 2026-04-24

**Q1 (FR-003). Permission split: can a player edit their own
PC's "takes starting loan" flag, or is the entire starter config
DM-only?**
**A**: **Player owns the boolean flag on their own PCs; every-
thing else is DM-only.** A player can flip "takes starting
loan" directly from their PC page for any PC they own. All
other starter-config fields — starting money coins, starter
items list, the campaign-level starting loan amount, the stash
seed — stay DM-only. Rationale: the flag is a narrative choice
("my character doesn't borrow") owned by the character's author,
not a balance question owned by the DM. Suppressing per-loop
ping-the-DM friction for Lex's case is worth the extra
permission layer. Flag edits take effect only on the next
reapply (FR-003a) — no retroactive propagation into already-
applied loops.

**Q2 (FR-013, US3.5, Assumptions). What happens to autogen
rows that have been hand-edited or hand-deleted when reapply
runs?**
**A**: **Reapply detects them and shows a confirmation dialog
before overwriting.** Spec-012 tracks a "hand-touched" status
per autogen row (flipped on by any edit/delete outside the
apply/reapply path, reset after a successful apply/reapply).
Before reapply runs, the system computes which hand-touched
rows it's about to overwrite or re-create. If that set is
non-empty, the DM sees a modal listing each row with old vs.
new values and must explicitly confirm; cancelling aborts the
entire run. If the set is empty, the run proceeds silently.
Rationale: the "reapply is authoritative" model is preserved
(final state always matches config), but the DM can't lose a
hand-edit without seeing it. Exact storage of the flag (boolean
column / timestamp / tombstone) is `plan.md`.

**Q3 (FR-005, FR-011). Does loop creation automatically run the
starter setup, or is it an explicit DM action?**
**A**: **Explicit DM action, with an unmissable banner on the
loop page.** Creating a loop node never produces autogen rows
on its own. Any loop with zero spec-012 autogen rows displays
a persistent DM-only banner ("Стартовый сетап ещё не применён —
[Применить]") until the first apply. The apply and reapply
actions share one code path; only the button label differs
based on whether autogen rows already exist for the loop.
Rationale: prepping loops in advance of play is a common
mat-ucheniya workflow, and silently pre-seeding the ledger for
an unplayed loop causes wallet confusion. Misclick-safety is a
bonus. The banner prevents "DM forgot to apply setup" bugs —
without it, option-C would regress to "party plays session 1
with empty wallets".

