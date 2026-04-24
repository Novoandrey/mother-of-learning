# Feature Specification: Common Stash (Общак)

**Feature Branch**: `011-common-stash`
**Created**: 2026-04-24
**Status**: Draft
**Input**: Third spec in the Bookkeeping series (see
`.specify/memory/bookkeeping-roadmap.md`). Builds on spec-010's
ledger. Adds a per-campaign shared hoard — called **Общак** in
the mat-ucheniya UI — that holds both money and items. It is
modelled as "yet another PC-shaped node" (same wallet rules,
same transaction semantics) with just enough UX on top to make
the two flows players actually use — **put into stash / take
from stash** and **cover-from-stash when an expense overdraws**
— cheap and one-tap. Item storage surfaces as a small
spreadsheet-style grid on the stash page; that grid is designed
to be the same component that later powers per-PC inventory.

## Context

In "Mother of Learning" (and in every progression-fantasy party
we've seen) there's a shared hoard: pooled gold, loot that
nobody claimed yet, emergency consumables, bribery funds. Today
this hoard lives in a separate Google Sheet tab plus a Telegram
thread called "общак". Editing it means jumping contexts,
manually debiting one PC to credit the pool, and trusting the
thread to stay consistent. During play this is a constant tax.

Spec-010 shipped the per-PC ledger and the `transfer` primitive
(two linked rows with a shared `transfer_group_id`). This spec
does the minimum needed to make the stash feel like a first-class
participant of the ledger:

1. A stash node exists per campaign (one per campaign, visible in
   the catalog alongside PCs, findable by name "Общак").
2. PC ↔ stash money transfers are **one tap** from the PC page
   and from the ledger's actor bar — no generic recipient picker.
3. When an expense would overdraw a PC, the form offers a
   one-tap shortcut: "cover the shortfall from the stash".
4. Items can live in the stash: put-in and take-out are the
   same transfer primitive with an item payload; the stash page
   shows a small grid listing current items.
5. The stash is **wipeable state** (constitution principle I) —
   it resets when a new loop begins. Past-loop stash contents
   remain visible in the ledger as history.

Everything else is intentionally **not** in this spec. There is
no stash-specific approval flow (spec-014 will generalise
approvals), no stash starting setup per loop (spec-012 — spec-011
leaves the fresh stash empty), no automated loot distribution
to the stash (spec-013), and no item-as-node catalog (spec-015 —
items in the stash remain free-text rows, just as in spec-010).
The item grid on the stash page is a UI lens over the same
`kind='item'` transactions; it's designed to be reused as the PC
inventory grid in a later spec, but that PC-side integration is
explicitly out of scope here.

**Two architectural points are pinned at the spec level** because
they shape every later decision:

1. **Wipeable state is a campaign-wide rule, not a stash
   feature** (constitution principle I). When a new loop
   begins, every actor's current-loop view — both the stash
   and every PC — shows fresh-zero contents. Money on PCs
   already follows this rule from spec-010 (the Wallet block
   resets). Items on PCs follow the same rule automatically
   once a PC-inventory grid ships in a future spec, because
   spec-011's grid component is designed generically (see
   Assumptions). No row is ever deleted by loop rollover —
   historical contents remain visible in the ledger, filterable
   by loop. Starting state for a new loop is injected by
   spec-012's setup step; spec-011 ships with "new loop = empty"
   as the only option.

2. **The item grid and its aggregation are designed
   forward-compatible with spec-015** (items as nodes). In
   spec-011 the aggregation key is `item_name` only; in
   spec-015 the key extends to include `item_node_id` so the
   same "silver amulet" string can refer to two distinct item
   instances with different metadata. The grid component, the
   aggregation function, and the schema additions in spec-011
   must not preclude that extension — concretely, the schema
   change for `qty` (FR-013) should leave room for a later
   `item_node_id` column on `transactions` with no rewrite.

---

## User Scenarios & Testing

### User Story 1 — Player puts money into the stash with one tap (Priority: P1)

Marcus has 50 gp in his wallet and wants to drop 20 gp into the
shared hoard. From his PC page he taps **"Положить в Общак"**,
enters `20gp`, optionally a comment, saves. Two ledger rows
appear, sharing a transfer group id — one on Marcus (−20 gp,
transfer) and one on the stash (+20 gp, transfer). Marcus's
wallet drops by 20; the stash's balance rises by 20.

**Why this priority**: this is the feature's whole point. Without
it players keep writing `-20 gp общак` / `+20 gp общак` manually
across two rows and praying the transfer group id stays consistent.

**Independent Test**: from Marcus's PC page, tap "Положить в
Общак", enter 20 gp, save. Expect two linked transactions in the
ledger and the stash's Wallet block showing +20 gp.

**Acceptance Scenarios**:

1. **Given** Marcus's PC page is open and a current loop exists,
   **When** he taps "Положить в Общак", enters `20gp`, and saves,
   **Then** two transactions are stored with a shared transfer
   group id — actor Marcus with −20 gp, actor stash with +20 gp —
   both in the current loop on Marcus's character frontier day;
   Marcus's Wallet block shows −20 gp vs. before, the stash's
   shows +20 gp, and the ledger lists both rows.
2. **Given** the same flow, **When** Marcus enters an amount that
   exceeds his holdings (e.g. he has 15 gp, types `20gp`), **Then**
   the form warns but still saves — Marcus's wallet goes negative
   (same red-text, ledger-not-validator rule as spec-010 FR for
   `transfer`, consistent with the google-sheets baseline).
3. **Given** the form is opened with no current loop in the
   campaign, **When** Marcus tries to put into the stash,
   **Then** the button is disabled with a hint "mark a loop as
   current first" (same rule as spec-010 FR-010).
4. **Given** the form is opened from a session page, **When**
   Marcus saves, **Then** both legs of the transfer carry the
   same `session_id` (the transfer is a single event).

---

### User Story 2 — Player takes money out of the stash with one tap (Priority: P1)

Lex needs 5 gp to pay a gate toll. From his PC page he taps
**"Взять из Общака"**, enters `5gp`, optionally a comment, saves.
Two rows land in the ledger, linked by a transfer group id: the
stash at −5 gp, Lex at +5 gp.

**Why this priority**: the opposite half of US1, equally common.
Lex "borrowing from общак for a potion" is the single most
frequent money event at the table after PC income/expense.

**Independent Test**: from Lex's PC page, tap "Взять из Общака",
enter 5 gp, save. Expect two linked transactions; stash −5 gp,
Lex +5 gp.

**Acceptance Scenarios**:

1. **Given** the stash has 50 gp, **When** Lex withdraws 5 gp,
   **Then** the stash balance drops to 45 gp and Lex's wallet
   rises by 5 gp; two transactions exist with a shared transfer
   group id.
2. **Given** the stash has 0 gp, **When** Lex tries to withdraw
   5 gp, **Then** the form warns that the stash would go
   negative but still saves (same relaxed rule as US1.2 — the
   ledger records what the party decided to do, even if it's
   arithmetically absurd).
3. **Given** Lex is a player who owns two PCs, **When** he
   withdraws into a specific PC, **Then** the form uses the PC
   whose page he started from as the recipient — no disambiguation
   picker on the common path.

---

### User Story 3 — Cover-from-stash shortcut when an expense overdraws (Priority: P1)

Marcus has 3 gp, wants to record a `−5 gp (potion)` expense at
the table. He opens his normal transaction form, enters `−5gp`,
category "expense", comment "potion". The form highlights the
amount in red and offers a single inline shortcut: **"Не хватает
2 gp — добрать из общака?"**. One tap, save. The result is two
linked rows created together:

- a **transfer leg** stash → Marcus for the shortfall amount
  (2 gp), tied by a transfer group id;
- the **normal expense** on Marcus (−5 gp, category "expense",
  comment "potion").

Both rows share the same loop, day, and optional session, and the
form records the **link between them** (they aren't a transfer
pair, but the UI needs to know "these two were created together
as one operation" for edit/delete symmetry — see FR-007).

**Why this priority**: today's Google-Sheets workaround is "dip
into общак when I'm short and write three cells by hand". This
is the feature's highest-leverage UX — it turns a three-row
manual reconciliation into a single confirmation tap. Roadmap
spec-011 calls this out explicitly as "more important than the
buttons".

**Independent Test**: with Marcus holding 3 gp and a stash
balance ≥ 2 gp, record a −5 gp expense, accept the shortfall
shortcut. Expect three ledger rows: (stash −2 gp / Marcus +2 gp,
linked by a transfer group id) and (Marcus −5 gp, expense). Net
effect: Marcus's wallet = 3 + 2 − 5 = 0 gp; stash drops by 2 gp.

**Acceptance Scenarios**:

1. **Given** Marcus has 3 gp and the stash has 50 gp, **When**
   Marcus records a −5 gp expense and accepts the "cover from
   stash" prompt, **Then** three transactions are stored: a
   transfer pair (stash −2 gp, Marcus +2 gp, same transfer group
   id) and a −5 gp expense on Marcus. All three carry the same
   loop/day; the session link, if any, matches on all three.
2. **Given** Marcus's amount fully fits his wallet, **When** he
   saves, **Then** the shortfall prompt does **not** appear — the
   form is exactly the spec-010 expense form.
3. **Given** Marcus is short on denominations, not in aggregate
   (e.g. he holds `{cp: 0, sp: 3, gp: 5, pp: 0}` = 5.3 gp and
   types `−5gp`), **When** he saves, **Then** the form does
   **not** show the shortfall prompt — spec-010's smallest-first
   resolver already handles it (5 gp peeled off the gp pile).
4. **Given** Marcus declines the shortcut, **When** he saves
   anyway, **Then** the form falls back to spec-010 behaviour:
   the transaction is recorded as-is, and Marcus's wallet goes
   negative.
5. **Given** the stash itself is too poor to cover the full
   shortfall (e.g. stash has 1 gp, Marcus needs 2 gp), **When**
   Marcus accepts "cover from stash", **Then** the shortcut
   creates a **partial** transfer pair stash→Marcus for whatever
   the stash actually has (1 gp), the expense still saves for
   the full original amount (−5 gp), and Marcus's wallet goes
   negative for the remaining gap. The form surfaces a warning
   explaining both effects before the user confirms. Rationale:
   the ledger mirrors the google-sheets baseline (overdraws
   are allowed if flagged) and the future spec-014 approval
   flow will be the real gate.
6. **Given** Marcus later edits the expense leg (e.g. fixes the
   amount from `−5 gp` to `−3 gp`), **When** he saves the edit,
   **Then** the linked transfer legs are **not** silently
   rewritten — the shortfall link is not a transfer pair. The
   form warns that the shortfall may no longer be correct and
   offers to delete or re-run the shortcut. The author-only
   edit/delete rule (spec-010 FR-020) still applies.
7. **Given** Marcus deletes the expense leg, **When** the
   deletion applies, **Then** the shortfall transfer pair is
   **not** auto-deleted (they are two separate ledger events
   from the system's perspective); the form warns and offers a
   one-tap "also delete the covering transfer".

---

### User Story 4 — Player drops an item into the stash (Priority: P1)

After an encounter Marcus picks up a silver amulet he can't use.
He wants to leave it in the stash for whoever's interested. On
his PC page he taps **"Положить в Общак"**, switches the form to
"item" mode, enters `silver amulet` as the item name, optional
comment, saves. Two `kind='item'` rows land in the ledger with
a shared transfer group id: one on Marcus (outgoing leg), one on
the stash (incoming leg).

**Why this priority**: item drops and pickups from the stash are
the second-most-common stash operation after money. Without US4
and US5 the item half of the stash is only accessible via
handwritten free-text item rows — that's worse than today's
Telegram thread.

**Independent Test**: from Marcus's PC page, tap "Положить в
Общак", switch to item mode, type "silver amulet", save. The
stash page's item grid then includes a row "silver amulet, 1,
Marcus, day N". Marcus's PC page does not list it any more.

**Acceptance Scenarios**:

1. **Given** Marcus's PC page, **When** he drops a "silver
   amulet" into the stash, **Then** two `kind='item'` transactions
   land with a shared transfer group id — actor Marcus and actor
   stash — same loop/day, same optional session. No coin counts
   on either row; neither wallet balance changes.
2. **Given** Marcus drops the same item name twice in the same
   loop (two separate transfer pairs, qty=1 each), **When** the
   stash page loads, **Then** the item grid shows **one row**
   with `qty: 2` (aggregated by item name), while the ledger
   still lists both transfer events as distinct rows.
3. **Given** Marcus drops "свиток молнии" with `qty: 5` in a
   single transfer, **When** the save succeeds, **Then** both
   legs of the transfer pair carry `qty = 5`, the stash grid
   shows one row with `qty: 5`, and Marcus's PC loses no coin
   balance (items don't affect money).
4. **Given** Marcus mistyped the name, **When** he edits either
   leg, **Then** the other leg's `item_name` updates in lockstep
   (transfer-pair atomicity from spec-010 FR-005 applies);
   editing the qty on one leg also updates the other.
5. **Given** the form is opened with no current loop, **When**
   Marcus tries to drop an item, **Then** the button is disabled
   (same rule as US1).

---

### User Story 5 — Player takes an item from the stash (Priority: P1)

Lex wants the silver amulet. From his PC page he taps **"Взять из
Общака"**, switches to item mode. The form lists the items
currently in the stash (from the item grid — see US6). Lex picks
"silver amulet", optional comment, saves. Two `kind='item'` rows
land: stash (outgoing leg) and Lex (incoming leg), same transfer
group id.

**Why this priority**: symmetric to US4; without it, items can
only be **put in** but never **taken out** without manual free-
text entry.

**Independent Test**: from Lex's PC page, tap "Взять из Общака",
switch to item mode, pick "silver amulet" from the current stash
contents, save. Expect the stash item grid to lose that row and
Lex's personal item history to reflect the pickup.

**Acceptance Scenarios**:

1. **Given** the stash has a "silver amulet" row, **When** Lex
   takes it, **Then** two `kind='item'` transactions land with a
   shared transfer group id (stash outgoing, Lex incoming); the
   stash's current item grid no longer shows the amulet.
2. **Given** the stash has no items, **When** Lex opens the take-
   out form in item mode, **Then** the picker shows an empty
   state "общак пуст" and save is disabled.
3. **Given** the stash has a "silver amulet" row (qty: 3),
   **When** Lex takes qty=1, **Then** the transfer pair carries
   `qty = 1` on both legs and the stash grid now shows the row
   as `qty: 2`. The take-out picker never lets Lex take more
   copies than the grid shows.
4. **Given** Lex types a free-text item name that isn't in the
   stash, **When** he saves, **Then** the form blocks save and
   asks him to pick from the list — we don't want phantom items
   leaving the stash. (Free-text "acquire from nowhere" is a
   spec-010 item-transaction on a single PC, not a stash
   operation.)

---

### User Story 6 — Stash page: money on top, item grid below, rows expand for details (Priority: P1)

Opening the stash node (from the catalog, from the sidebar, or
from the small "Общак" badge on the ledger actor bar) lands the
user on a page laid out like a PC page but for the hoard:

- A **Wallet block** (same component as a PC's wallet) showing
  the stash's current-loop coin holdings and aggregate gp.
- An **Item grid** — a spreadsheet-style table of items
  currently in the stash, one row per distinct item name.
  Columns at minimum: item name, qty, latest-drop loop+day,
  "dropped by" (the author if only one instance, "multiple" if
  the qty comes from several drops), short comment preview.
  Clicking (or tapping) a row **expands it in place** to reveal
  the full per-instance history — one sub-entry per underlying
  transfer, with the full comment text, the leg's author, the
  loop+day, the session link if any. The grid is the first
  appearance of a reusable inventory-grid component that will
  later also power per-PC inventory (future spec, not spec-011).
- A **"+ Транзакция"** button that opens the same transaction
  form spec-010 ships, but with `actor = stash` pre-filled.
- A **Recent transactions** strip identical to the PC page's,
  filtered to transactions touching the stash.

**Why this priority**: the stash is useless if you can't see
what's in it. The wallet block is trivial (reuse). The item grid
is where most of the new UI work for spec-011 lives, and the
expand-for-details is what lets players remember the **story**
behind an object ("кто притащил этот амулет и при каких
обстоятельствах?") without a separate chat thread.

**Independent Test**: open the stash page in the mat-ucheniya
campaign. Expect to see a Wallet block showing whatever money is
currently in the stash, a (possibly empty) table of items, and
the ability to click a row to see its history.

**Acceptance Scenarios**:

1. **Given** the stash holds `{cp: 0, sp: 0, gp: 50, pp: 0}` and
   two items, **When** the page loads, **Then** the Wallet block
   shows `50 gp` aggregate with the per-denom breakdown, and the
   item grid shows two rows with the columns listed above.
2. **Given** the stash is completely empty, **When** the page
   loads, **Then** the Wallet block shows `0 gp` with an empty
   caption, the item grid shows an empty state "общак пуст" with
   a "+ Транзакция" affordance, and no error is raised.
3. **Given** the campaign has no current loop, **When** the page
   loads, **Then** the Wallet block shows the stash's lifetime
   contents with the same "no current loop" fallback notice the
   PC page uses (spec-010 FR-015).
4. **Given** an item in the grid was dropped by a now-deleted PC,
   **When** the page loads, **Then** the "dropped by" cell
   shows "[deleted character]" and no error is raised (same
   rule as spec-010 SC-005).
5. **Given** the grid shows a collapsed row "silver amulet, qty:
   2", **When** the user clicks the row, **Then** it expands to
   show two sub-entries — one per underlying transfer — each
   with its full comment, author, loop+day, and session link.
   Collapsing the row returns it to the one-line summary.

---

### User Story 7 — Loop rollover wipes the current-loop view for every actor (Priority: P1)

The campaign runs loop 4; the stash has 87 gp and five items,
Marcus has 23 gp in his wallet, Lex has 8 gp and one item he
hasn't put in the stash yet. The DM marks loop 5 as current.
Opening the stash page now shows a Wallet of `0 gp` and an
empty item grid. Marcus's PC page shows `0 gp`. Lex's PC page
shows `0 gp`. Historical rows from loop 4 — for the stash and
for every PC — remain visible in the ledger, filterable by
`loop = 4`. No data is deleted. The rule is uniform: each
actor's "current loop view" is simply `loop_number = current`,
and each loop starts empty until spec-012 injects starting
setup.

**Why this priority**: constitution principle I — the loop is
the unit of wipeable state. If the stash carried state across
loops but PC wallets didn't (or vice versa), the party's
fiction would break. The rule has to be consistent for every
actor, whether or not spec-011 directly renders their contents.

**Independent Test**: in a campaign with current loop 4, known
non-empty stash and non-empty PC wallets, mark loop 5 as
current, refresh: the stash page, Marcus's PC page, and Lex's
PC page all show fresh-zero current-loop contents; the
ledger filtered by `loop = 4` still shows everything.

**Acceptance Scenarios**:

1. **Given** the stash has money and items in loop 4, **When**
   loop 5 becomes current, **Then** the stash page's Wallet
   block shows `0 gp` and the item grid is empty.
2. **Given** the same scenario, **When** Marcus opens his PC
   page, **Then** his Wallet block shows `0 gp` (already the
   spec-010 FR-015 behaviour — spec-011 simply restates the
   rule as universal instead of PC-specific).
3. **Given** the same setup, **When** the user opens the ledger
   filtered by `loop = 4` with any actor (stash, Marcus, Lex,
   etc.), **Then** all the loop-4 rows for that actor remain
   visible (no hard-delete, ever).
4. **Given** loop 5 is current and Marcus puts 10 gp into the
   stash, **When** the stash page reloads, **Then** the Wallet
   block shows 10 gp — the wipe is a **view** effect of the
   per-loop aggregation, not a destructive migration.
5. **Given** a PC-inventory grid ships in a future spec,
   **When** that grid renders on the PC page, **Then** it MUST
   follow the same per-loop rule (its items come from
   `kind='item'` transfer legs on that PC in the current loop)
   — the spec-011 grid component is designed so this works
   without modification.

---

### User Story 8 — Ledger lens: filter by "stash involved" (Priority: P2)

From the ledger page, the user can filter by `actor = stash`
(using the existing PC filter dropdown, which now includes the
stash node alongside PCs). This yields every stash row — money
and items, in/out — in reverse-chronological order. Summary and
filters behave exactly as in spec-010 US3.

**Why this priority**: P2 because it's a direct reuse of the
ledger filters from spec-010 — virtually no new UI, just making
sure the stash node shows up in the actor dropdown. Useful for
audits ("what happened to the stash in loop 3") but not a
blocking flow.

**Independent Test**: on `/c/mat-ucheniya/accounting`, apply
filter `actor = Общак, loop = 4`; expect the list to show only
stash rows from loop 4.

**Acceptance Scenarios**:

1. **Given** the campaign has stash and PC transactions in loop
   4, **When** the user filters the ledger by `actor = stash`,
   **Then** only rows whose actor is the stash appear (both legs
   of a transfer show as two rows in the listing, as elsewhere
   in the ledger).
2. **Given** the filter is applied, **When** the summary renders,
   **Then** "net gp" reflects the signed sum of the stash's money
   rows for the filtered set.

---

### Edge Cases

- **Multiple PCs, one transfer_group_id.** The shortfall
  shortcut (US3) intentionally creates **three** rows (one
  transfer pair + one expense), not a single linked triple. The
  transfer pair is a well-formed spec-010 transfer; the expense
  is its own row. Editing/deleting one does not cascade to the
  others automatically — the form warns instead (US3.6, US3.7).
- **Concurrent stash edits.** Last-write-wins, as everywhere in
  the project. Two players draining the stash in parallel can
  overdraw it; the ledger records what they did, the party
  reconciles out-of-band.
- **"Put in stash" from the stash page itself.** Nonsensical —
  stash→stash is not a valid actor pair. The form blocks it the
  same way spec-010 US5 blocks self-transfers.
- **Item row references a PC that was deleted.** Ledger shows
  "[deleted character]" in the "who" column. The item is still
  in the stash until someone takes it out.
- **Editing an item's `item_name` on one transfer leg.** Both
  legs update together (transfer-pair atomicity, spec-010
  FR-005). Editing one leg's leg alone is not allowed.
- **Item transaction without a transfer_group_id.** This is the
  spec-010 "breadcrumb" case (a single `kind='item'` row on a PC
  with no counterpart) and remains valid — it just doesn't
  affect the stash grid. Only **paired** item transfers with
  `actor = stash` on one leg contribute to the stash's current
  contents.
- **Stash-to-PC item transfer with a typo in the item name.** If
  Marcus drops "silver amulet" and Lex later takes "silver
  amullet" (typo) as a fresh item, the two are unrelated records
  — the typo item "appears out of nowhere", and the original
  amulet stays in the stash. Users fix it by editing the earlier
  leg. No fuzzy matching.
- **Reducing a qty to zero.** Not allowed — the form blocks
  save. To "remove" an item row, delete the transfer pair
  (author/DM rule from spec-010 FR-020). This keeps the grid's
  aggregation invariant clean (no zero-qty phantom rows).
- **Loop rollover during the mobile form flow.** If the DM flips
  loops while a player is composing a stash transaction, the
  form's captured `loop_number` is used on save — the new loop
  doesn't retroactively pull in a mid-flight input. Same
  behaviour as spec-010.
- **Shortfall shortcut when the stash has items but no money.**
  Items don't cover money; the stash's gp is 0, so the prompt
  shows "общак не может покрыть" and the user either accepts a
  plain negative wallet (spec-010 baseline) or edits the amount.
  Items are never silently "sold" to produce coins.

---

## Requirements

### Functional Requirements

**Stash node**

- **FR-001**: Every campaign MUST have **exactly one** stash
  node. Its name in the mat-ucheniya UI is "Общак" (the
  project-wide slang, not a translation of "stash"). The node
  MUST behave like a PC for the purposes of ledger queries —
  `actor_pc_id` on a transaction can reference it, and the
  wallet derivation in spec-010 works unchanged.
- **FR-002**: The stash node MUST NOT have a player-owner entry
  (it is not owned by any user). Write permissions on stash
  transactions follow the same rule as other ledger writes: the
  DM can always write; a player can write transfers whose
  counterpart is one of their own PCs.
- **FR-003**: The stash node MUST be findable in the campaign
  catalog and appear in the ledger's actor filter dropdown
  alongside PCs.

**Put-in / take-out controls**

- **FR-004**: Every PC page MUST render two dedicated controls —
  **"Положить в Общак"** and **"Взять из Общака"** — adjacent to
  the existing "+ Транзакция" button. They MUST NOT open a
  generic recipient picker; the counterpart is always the
  campaign's stash node.
- **FR-005**: The ledger actor bar (same strip shown on the
  `/accounting` page after picking an actor) MUST render the
  same two controls when the active actor is a PC.
- **FR-006**: Both controls MUST support switching between
  `money` and `item` modes in the form. The default is `money`.
  The per-denom input mode from spec-010 FR-011 remains
  available as a secondary toggle.

**Shortfall shortcut**

- **FR-007**: When a user composes a `money` expense (negative
  amount, non-transfer) whose gp-equivalent magnitude exceeds
  the actor PC's current-loop aggregate gp, the form MUST
  highlight the amount in red and render an inline prompt:
  "Не хватает N gp — добрать из общака?". Confirming the prompt
  saves, in one atomic server action, **two** things: (a) a
  spec-010 transfer pair stash→PC for the exact shortfall amount
  in gp, and (b) the original expense row as the user entered it.
- **FR-008**: The shortfall prompt MUST NOT appear when the user
  holds enough aggregate gp but is short on specific
  denominations — spec-010 FR-002a's smallest-first resolver
  handles that case silently.
- **FR-009**: Declining the prompt (or the prompt not appearing
  because the stash itself is empty) MUST fall back to spec-010's
  baseline: the expense saves as entered, the wallet can go
  negative, no transfer is created.
- **FR-010**: The two rows created together by the shortfall
  shortcut are **not a single linked triple** — they are a
  well-formed transfer pair plus a standalone expense. Edit and
  delete semantics follow the underlying records. The form
  surfaces a warning (not a block) if the user edits or deletes
  one side of the pair without touching the other (see US3.6 /
  US3.7).

**Items in the stash**

- **FR-011**: An item transfer between a PC and the stash MUST
  be modelled as a `kind='item'` transfer pair — two rows with
  a shared `transfer_group_id`, same loop/day, same optional
  session. No new kinds and no new columns on the transactions
  table. (Per spec-010's existing schema, a `kind='item'` row
  carries no coin amounts; the item name lives on the row.)
- **FR-012**: The stash's **current item contents** are derived
  by replaying item transfers where one leg's actor is the
  stash and **aggregating by `item_name`**:
  `current_qty(name) = sum(incoming legs' qty) − sum(outgoing
  legs' qty)`. Names that evaluate to `current_qty = 0` are
  hidden from the grid; names with `current_qty < 0` render a
  visible warning badge (a data-integrity signal — shouldn't
  normally happen unless the ledger was edited by hand out of
  order). Identical `item_name` values collapse into one grid
  row; distinct names (including typos) remain separate. No
  fuzzy matching.
- **FR-013**: Every `kind='item'` transaction MUST carry an
  integer **quantity ≥ 1** (default 1). **Quantity can never
  be 0** — a user who wants to "remove" an item row deletes the
  transfer pair entirely (author/DM rule from spec-010 FR-020
  applies). Both legs of an item transfer pair MUST share the
  same quantity; editing the qty on one leg updates the other
  (spec-010 FR-005 transfer-pair atomicity). Quantity is
  schema-level (a column on `transactions`); the exact column
  name and CHECK constraints — in `plan.md`.

**Stash page**

- **FR-014**: There MUST be a route that renders the stash page.
  The route path is a `plan.md` decision; the page MUST display
  (a) a wallet block, reusing the same component as the PC page,
  showing the stash's current-loop aggregate and per-denom
  holdings; (b) an item grid (see FR-015); (c) a "+ Транзакция"
  affordance prefilled with `actor = stash`; (d) a recent-
  transactions strip filtered to rows touching the stash.
- **FR-015**: The item grid MUST be a spreadsheet-style table,
  **one row per distinct `item_name` currently in the stash**
  (aggregated per FR-012). Columns at minimum: item name, qty,
  latest-drop loop+day, "dropped by" (the author if the qty
  comes from one drop, "multiple" if from several), short
  comment preview. Clicking (tapping) a row MUST expand it in
  place to reveal the full per-instance history — one sub-
  entry per underlying transfer, with full comment, leg
  author, loop+day, and session link if any. The grid MUST
  be the seed of a **reusable inventory grid component** —
  the same component is planned to render per-PC inventory in
  a later spec. The grid's core affordances (cell editing,
  sorting, filtering, the exact expand interaction) are a
  `plan.md` concern; the spec-level requirement is the
  component be reusable and not stash-specific.
- **FR-015a**: The grid component and the aggregation function
  MUST be **forward-compatible with spec-015** (items as
  nodes). Concretely: (i) the aggregation key is abstracted,
  not hard-coded to `item_name` — spec-011 passes
  `(item_name)` as the key, spec-015 will pass
  `(item_node_id, item_name)` without rewriting the component;
  (ii) the expanded per-instance row supports a future "open
  item node" affordance (hidden in spec-011 because there are
  no item nodes yet); (iii) the `plan.md` schema change for
  `qty` (FR-013) MUST leave room for adding an
  `item_node_id uuid nullable` column on `transactions` later
  without any data backfill — the future column simply stays
  `null` for every pre-spec-015 row.
- **FR-016**: Category grouping in the grid (accordion-style
  collapse by a per-item category) is **P2 / nice-to-have** —
  enumerated here only so `plan.md` accounts for a category
  hook in the grid component. The data currently has no item
  category column; grouping falls back to "ungrouped" in spec-011
  and becomes meaningful once spec-015 adds item nodes.

**Wipe semantics**

- **FR-017**: The "current-loop view" rule MUST be uniform
  across every actor in the campaign (PCs and the stash).
  Concretely: every wallet block and every inventory grid —
  whether rendered for the stash or for a PC (the PC inventory
  grid arrives in a later spec) — MUST display only
  transactions whose `loop_number` equals the campaign's
  current loop. Historical rows remain in the ledger,
  filterable by loop. Loop rollover is a view effect, not a
  data migration — no row is deleted. Spec-012 is responsible
  for injecting the starting contents of a new loop; until
  spec-012 ships, every new loop starts empty for every actor.
- **FR-018**: If the campaign has no current loop, the stash
  page MUST show a lifetime aggregate with the same "no current
  loop" caption the PC page uses (spec-010 FR-015 applies
  verbatim, substituting "stash" for "PC").

**Permissions and audit**

- **FR-019**: A player MAY create a stash transaction only if
  one leg's actor is a PC they own (i.e., "I am putting my money
  into the stash" or "I am taking from the stash into my PC").
  They MUST NOT create a stash-to-other-PC transfer on behalf of
  someone else.
- **FR-020**: The DM MAY create any stash transaction, including
  stash-to-any-PC or standalone stash rows (one-sided
  adjustments with no transfer pair) — the "ДМ pencils a
  correction" case.
- **FR-021**: The author of a transaction remains the user who
  created it (spec-010 FR-023 unchanged). The shortfall shortcut
  (US3) records the user as the author of **all three** rows it
  produces.

### Non-Functional / Performance

- **FR-022**: Opening the stash page for a campaign with ≤ 1000
  transactions (across all loops and actors) MUST render the
  first view in ≤ 1 s TTFB on the mat-ucheniya production
  baseline. The item grid counts as a single "current-loop
  stash items" query; it MUST NOT scan historical loops during
  the initial render.

---

## Key Entities

- **Stash (new node)**. A single node per campaign, modelled as
  a PC-shaped participant of the ledger. Its wallet and item
  contents are derived from the existing `transactions` table.
  No new columns are introduced on transactions in this spec.
- **Transaction** (unchanged from spec-010). The shortfall
  shortcut in US3 produces three rows — a spec-010 transfer pair
  plus a spec-010 expense — in one atomic server call.
- **Item transfer pair** (new usage of an existing primitive).
  Two `kind='item'` transactions sharing a `transfer_group_id`,
  one leg on the stash and one leg on a PC. The schema already
  allows this — spec-011 gives it a name and a UX.
- **Stash item instance** (derived entity). One per open-ended
  incoming item transfer leg on the stash — i.e., an item that
  has been put in and not yet taken out. Not stored; the item
  grid reconstructs it from the ledger at render time.

---

## Success Criteria

### Measurable Outcomes

- **SC-001**: Putting money into the stash from a PC page on a
  phone — tap "Положить в Общак", enter amount, save — completes
  in ≤ 10 s elapsed (half of spec-010 SC-001 because the
  counterpart is already chosen).
- **SC-002**: The shortfall shortcut (US3) saves three rows in a
  single server call; the user sees one loading state, not
  three.
- **SC-003**: On a campaign with 500 historical transactions
  including stash transfers, the stash page renders in ≤ 1 s
  TTFB (FR-022).
- **SC-004**: For every `(loop_number)`, the stash's aggregate
  gp shown on the stash page equals the signed sum of coin
  counts × denomination weights over all stash transactions
  with that loop. Verified against a hand-computed baseline on
  mat-ucheniya loop-4 data after a short pilot.
- **SC-005**: Zero HTTP 500 on the stash page or the ledger when
  stash transactions reference deleted PCs or deleted sessions
  — same standard as spec-010 SC-005.
- **SC-006**: Time spent on "figuring out what's in the общак"
  during a live session drops from the current "scroll the
  Telegram thread for 5 minutes" to a sub-30-second glance at
  the stash page (qualitative, owner-reported, one pilot
  session).

---

## Assumptions

- **The stash is exactly one node per campaign.** Multi-stash
  (per-party, per-location) is out of scope. Future campaigns
  may want "bank vault of the thieves guild" style scoped
  hoards — that's a different spec, probably layered on top of
  spec-015 (items as nodes).
- **The stash does not own PCs and is not owned.** It is not a
  character; it has no player. Its permissions model is "DM can
  touch it freely; a player can transfer between it and their
  own PC".
- **Wipe is a universal rule, not a stash feature.** Every
  actor's current-loop view (money and items) shows only
  transactions with `loop_number = current`. Spec-010 already
  implements this for PC wallets; spec-011 states it
  explicitly so the future PC-inventory grid inherits the rule
  without restatement. Starting contents for a new loop are
  spec-012's job; this spec ships "new loop = empty".
- **Items in the stash stay free-text in spec-011, but the
  architecture is spec-015-ready.** No item catalog, no item
  nodes, no `item_node_id` column **in the spec-011
  migration** — yet the grid component, the aggregation
  function, and the schema change for `qty` are all designed
  so spec-015 can later (a) add an `item_node_id` column with
  no backfill, (b) widen the aggregation key from `item_name`
  to `(item_node_id, item_name)`, and (c) light up a "open
  item node" link in the expanded row, all without touching
  the spec-011 grid's public API.
- **Items carry a quantity (integer ≥ 1).** A single item
  transfer pair can cover several copies of the same named
  item. The smallest-first resolver from spec-010 FR-002a does
  not apply to items — items are atomic units.
- **The inventory grid component used on the stash page is
  generic.** It has no hard-coded "stash" knowledge. The same
  component will later render per-PC inventory in a future
  spec. `plan.md` is responsible for naming the component, its
  props, and the data shape.
- **No realtime refresh.** If Marcus drops an item while Lex has
  the stash page open, Lex sees it on the next navigation or
  reload. Polling / realtime push is IDEA-009 (campaign-wide).
- **No starting stash seed in this spec.** When a new loop
  begins, the stash is empty. Spec-012 will add per-campaign
  starting-loop setup (including a non-empty default stash if
  the DM wants one).
- **No approval flow on stash transactions.** Every row is
  auto-approved at create time, as in spec-010. Spec-014
  flips this globally.
- **The shortfall shortcut only triggers on money expenses.**
  It does not apply to item transactions, transfers, or
  positive (income) money rows. Its scope is strictly "I owe
  more gp than I have".
- **The shortfall shortcut uses aggregate gp** for the "am I
  short?" check, not per-denom. The coin-resolver from spec-010
  FR-002a runs **after** the shortfall is covered — the
  covering transfer delivers gp into the PC's wallet in the
  default `gp` pile, and the expense then resolves smallest-
  first from the combined holdings.
- **Last-write-wins** on concurrent edits, as everywhere in
  the project. No optimistic locking.

---

## Out of Scope

- **Multi-stash per campaign** (party stashes, scoped hoards).
- **Automated loot distribution** — buttons like "distribute
  this pile to PCs A/B/C and the stash" (spec-013).
- **Starting-loop stash seeds** (spec-012).
- **Approval / batching of stash transactions** — spec-014 will
  flip the default status globally.
- **Items as nodes / item catalog integration** (spec-015).
  Items in the stash remain free-text in spec-011.
- **Per-PC inventory grid on PC pages.** The grid component
  ships in spec-011 **but is only mounted on the stash page**.
  Mounting the same component on the PC page (so a PC's items
  render alongside their Wallet block) is a future spec.
  Spec-011 guarantees the component is PC-ready — it just
  doesn't turn it on for PCs.
- **Weight, encumbrance, slots, equipping** on stash items.
- **Item fuzzy-matching / autocomplete from historical stash
  contents.** Users type exact names; typos are fixed by
  editing the row.
- **Bulk stash operations** — "take all", "give everything to
  Lex", "drain the stash on loop end". If the wipe-on-loop
  behaviour (US7) is sufficient as the end-of-loop drain, there
  is nothing to add here.
- **Realtime updates** of the stash page when another player
  edits it (IDEA-009).
- **Export of the stash contents** (CSV/JSON). The ledger export
  follow-up from spec-010 would cover it uniformly.
- **Category / tag grouping in the item grid.** Mentioned in
  FR-016 as a hook, not implemented — waits for spec-015's
  item node categories.
- **DM auto-approve rules / recurring transaction templates.**
  A DM might want to pre-approve repeated standard transactions
  (e.g. the "starting loop shopping run" for every PC) without
  tapping an approval each time. This is a future feature that
  sits on top of spec-014's approval flow; spec-011 ships every
  row auto-approved at create time, same as spec-010.
- **Auto-conversion between denominations** when the stash's
  wallet is short on specific coins. Same smallest-first rule
  as spec-010; no change-making logic.

---

## Clarifications

### Round 1 — 2026-04-24

**C1 (US3.5, FR-007..FR-010). When the stash itself can't cover
the full shortfall, what's the default?**
**A**: **Partial borrow + wallet-goes-negative for the gap.**
Accepting the "cover from stash" prompt always creates a
transfer pair for whatever gp the stash actually has — even if
it's less than the shortfall — and the original expense still
saves at its full amount; Marcus's wallet covers the remainder
by going negative. The form warns inline before the user
confirms. Rationale: mirrors the google-sheets baseline
("overdraws are allowed if flagged"), keeps the shortcut
one-tap instead of a second modal, and leaves the real gating
to spec-014's approval flow. A future DM-auto-approve rule
system on top of spec-014 will let the DM pre-bless recurring
patterns (e.g. "start-of-loop shopping run") so the approval
step stays cheap — that layer is out of scope for spec-011.

**C2 (FR-012, FR-013, US4.2, US6.5). Collapse identical items
in the grid — yes or no?**
**A**: **Yes, collapse by exact `item_name`, with a derived
quantity column.** Every `kind='item'` transaction carries an
integer qty (≥ 1); the grid aggregates by item name so
`current_qty(name) = sum(incoming) − sum(outgoing)`. Identical
names merge; distinct names (including typos) stay separate.
Clicking a grid row expands it to reveal the full per-instance
history (one sub-entry per underlying transfer). Rationale: the
1-item-per-row alternative is unreadable once the stash holds
three stacks of 50 arrows, and an expand-for-detail affordance
preserves the per-drop context without cluttering the
overview. No fuzzy name matching in spec-011; item-node
disambiguation lands with spec-015.
