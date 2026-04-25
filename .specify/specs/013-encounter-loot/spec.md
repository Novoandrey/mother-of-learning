# Feature Specification: Encounter Loot Distribution

**Feature Branch**: `013-encounter-loot`
**Created**: 2026-04-25
**Status**: Draft
**Input**: Fifth spec in the Bookkeeping series (see
`.specify/memory/bookkeeping-roadmap.md`). Builds directly on
spec-012's autogen layer — the second concrete batch of wizards
on top of the `(autogen_wizard_key, autogen_source_node_id,
autogen_hand_touched)` primitive shipped by migration `037`.
This spec adds **one new wizard key** (`encounter_loot`), one
new trigger surface (the encounter page), and one **minimal
schema change**: every `encounters` row gets a 1:1 mirror node
of `type='encounter'` so it can serve as a valid
`autogen_source_node_id` (which is `references nodes(id)`). No
new autogen machinery, no parallel ledger, no triggers, no
RPC. The mirror node is also a deliberate forward-compat seam
for a separate, larger future spec that reworks the encounter
constructor itself (encounters as canonical graph entities
with edges to locations, items, and a structured loot list,
fed by reusable templates) — that rework grows attributes and
edges on top of these mirror nodes; it does not invalidate
spec-013's wiring.

## Context

Spec-012 shipped the autogen primitive with four wizards
sourced from a loop. The next obvious autogen client is
encounter loot. Today, when a fight ends, the DM types loot
into the ledger by hand: 50 gp coin row tagged to the party,
a "Sword of Light" item row tagged to whoever the party
agreed it goes to, two healing potions split between two PCs,
and a stack of consumables dumped into the stash. A typical
post-fight loot pass is 4–10 transactions across 2–4
recipients; the DM either does it live (slow, breaks the
table's pace), or skips it and writes it later (fragile —
items get forgotten, coin amounts get fuzzed, the recipient
of a magic item gets disputed two sessions later).

The pain is structurally the same as spec-012's loop-start
pain — a deterministic set of rows the DM has to hand-pencil
every time, with no way to revise without manual cleanup. The
*solution* is structurally the same too: define the input
(an editable loot draft attached to the encounter), let the
DM press one button, materialise the rows, and rely on the
spec-012 reconcile so the DM can edit the draft after the
fact and reapply without duplicating or orphaning rows.

The new fact is the **source node**. Spec-012's source was
the loop, which is already a node. Encounters are not nodes
in the current schema — they live in the dedicated
`encounters` table, scoped per campaign, with no participation
in the graph. Spec-012's `autogen_source_node_id` column
points at `nodes(id)` with an FK and a delete cascade; if
spec-013 wants to use the same primitive (and it does — the
whole point of spec-012's framing was that spec-013 would not
re-derive the layer), the encounter has to surface a valid
node id.

Three options were on the table; one was chosen for this
spec, the other two are explicitly out of scope:

1. **(Chosen) Mirror node.** Every `encounters` row gets a
   1:1 mirror node of `type='encounter'` created automatically
   alongside the encounter. The mirror carries `id`, `title`,
   `campaign_id` — a deliberately minimal slice. The encounter
   table gains a `node_id` column (NOT NULL, FK, ON DELETE
   CASCADE in both directions). Loot rows reference this
   mirror node as their `autogen_source_node_id`. Total
   migration footprint: one column on `encounters`, a backfill
   for existing encounters, and a trigger that creates the
   mirror on encounter insert and deletes it on encounter
   delete. No FK loosening, no polymorphic source.
2. **(Rejected) Drop the FK.** Make `autogen_source_node_id`
   a free-form UUID, validate at app layer. Cheaper migration
   but loses the database-level guarantee that source-node
   delete cascades autogen rows — the exact guarantee
   spec-012 leaned on for FR-020.
3. **(Rejected) Encounter-as-canonical-node now.** Make
   encounters fully into nodes — typed enemy lists, edges to
   locations, structured loot list, day-of-loop attribute,
   reusable "Patrol · Easy / Medium / Hard" template family
   that supersedes `encounter_templates`. Correct end state,
   but a 5–7-day rework of the encounter constructor and its
   client. Out of scope for this spec — its only contact with
   spec-013 is that it will *consume* the mirror nodes
   spec-013 creates and add attributes/edges to them, with no
   change to the loot wizard.

The mirror-node decision is the single architectural choice
in spec-013. Everything downstream (loot draft shape, apply
flow, badge rendering, reconcile semantics, hand-edit
detection, two-phase confirm, RPC contract) is identical to
spec-012's plumbing — a different `wizard_key` and a different
trigger surface, otherwise unchanged.

**Three architectural points are pinned at the spec level**
because they shape every later decision:

1. **The encounter-loot wizard reuses spec-012's autogen
   primitive end-to-end.** No new autogen marker, no new
   reconcile algorithm, no parallel "loot ledger". A loot row
   is a normal `transactions` row with `kind='money'` or
   `kind='item'`, `actor_pc_id` set to a PC or the stash node,
   `autogen_wizard_key='encounter_loot'`, and
   `autogen_source_node_id=<encounter's mirror node id>`. It
   appears in `/accounting`, on PC ledger pages, on the stash
   ledger, on the session page (if the encounter is bound to
   a session) — exactly like spec-012 rows. Hand-touched
   detection, tombstones, the two-phase confirm dialog from
   spec-012, the autogen badge from FR-015 / FR-017 — all
   reused without modification.

2. **The encounter is the source node — concretely, its
   mirror node.** A loot draft is associated with an
   encounter instance (not a template, not a session, not a
   loop). Two encounters fought in different loops with the
   same template enemies have independent loot drafts,
   independent autogen rows, and independent reconciles —
   because they have distinct mirror nodes. This is the
   reason the source has to be the instance, not the
   template: idempotency is per `(wizard_key, source_node_id)`,
   and a shared source would let one encounter's reapply
   silently delete another's rows.

3. **The mirror node is a forward-compat seam, not a feature.**
   In spec-013 it carries the bare minimum (`id`, `title`,
   `campaign_id`) and exists only to satisfy the FK on
   `autogen_source_node_id`. The future encounter-as-node
   rework adds attributes (canonical enemy list, structured
   loot list, day-of-loop default), adds edges (encounter →
   location, encounter → originating template), and adds a
   reusable-templates flow that supersedes the current
   `encounter_templates` table. Spec-013 does not preempt any
   of those decisions; it ships the empty mirror and exits.
   The loot wizard's contract with the mirror is exactly
   "give me a node id" — anything the rework adds on top of
   the mirror is invisible to the wizard.

---

## User Scenarios & Testing

### User Story 1 — DM distributes loot after a fight with one click (Priority: P1)

The party has just finished a 4-round fight against a cult
patrol. The DM has the encounter open. Mid-fight she's been
jotting loot into a side panel: "30 gp", "Cultist's dagger",
"3× healing potion", "Sword of Light". When the encounter
status flips to `completed`, the loot panel grows a
**"Распределить лут"** button. She clicks it. A dialog opens
showing the four loot lines with a recipient picker per line:
the four PCs who fought (Mirian, Lex, Emelin, Ardeshir), plus
the campaign stash, plus a "split evenly" option for coins.
She drags the dagger to Mirian, the sword to Lex, the
potions to the stash, and leaves the 30 gp on "split evenly
across participants". She presses **"Применить"**. Without
any further action: 4 PC ledgers update (Mirian +1 dagger,
Lex +1 sword, each fighter +7.5 gp via four equal coin
rows), the stash gains 3 potions, and the encounter page
shows a small green confirmation: "Лут распределён · 9
строк". The dialog closes.

**Why this priority**: this is the entire point of the
spec. Without US1 the loot wizard is not a wizard.

**Independent Test**: an encounter with `status='completed'`,
no prior loot rows, four PC participants → DM fills the
draft → presses Применить → exactly the expected ledger
rows materialise with `autogen_wizard_key='encounter_loot'`
and `autogen_source_node_id=<mirror>.id` → the encounter
page reflects the drop.

**Acceptance Scenarios**:

1. **Given** an encounter with no loot draft and no autogen
   loot rows, **When** the DM opens the loot dialog and
   presses Применить with an empty draft, **Then** zero
   transactions are created and the dialog closes with a
   "пусто" notice.
2. **Given** a loot draft of 30 gp split evenly across 4
   participants, **When** the DM presses Применить, **Then**
   four `kind='money'` rows appear, each for 7.5 gp,
   actor=PC, autogen-tagged, dated to the encounter's day.
3. **Given** a loot draft with one item assigned to a PC,
   **When** the DM presses Применить, **Then** one
   `kind='item'` row appears with `actor=PC`, `item_qty>0`,
   `item_name='<draft entry>'`, autogen-tagged.
4. **Given** a loot draft with a coin amount that doesn't
   split evenly (e.g. 31 gp / 3 PCs), **When** the DM
   presses Применить, **Then** the system distributes
   remainder according to a deterministic rule that the
   draft preview makes visible BEFORE applying (exact rule
   is plan.md — sufficient that it's deterministic and
   shown).

---

### User Story 2 — DM revises a distribution and reapplies (Priority: P1)

Two sessions later the DM realises Lex shouldn't have the
Sword of Light — narratively it should belong to Emelin. She
opens the same encounter, opens the loot dialog, sees the
current draft pre-loaded with last time's assignments, drags
the sword from Lex to Emelin, and presses **"Пересобрать"**.
The system recomputes the desired row set, diffs against the
ledger, and shows a confirmation: "1 row will move from Lex
to Emelin, 0 rows added, 0 rows removed". She confirms.
Lex's ledger loses the sword row, Emelin's gains it; no
duplicates appear; the seven other rows from US1 are
untouched (no churn on author, no churn on `created_at`).

**Why this priority**: re-distribution is the value
multiplier. Without it the wizard is a write-once form, no
better than the by-hand workflow it replaces.

**Independent Test**: an encounter with previously applied
loot rows (state from US1) → DM changes one assignment in
the draft → presses Пересобрать → the diff dialog shows
exactly the delta → confirm → only the affected rows change.

**Acceptance Scenarios**:

1. **Given** previously applied loot rows and an unchanged
   draft, **When** the DM presses Пересобрать, **Then** the
   diff is empty and the system reports "ничего не
   изменилось" without creating, updating, or deleting any
   rows.
2. **Given** previously applied loot rows and a draft where
   one recipient changed, **When** the DM presses
   Пересобрать and confirms, **Then** exactly one row's
   `actor_pc_id` is updated (or one row deleted + one row
   inserted — plan.md decides) and all other rows are
   bit-for-bit identical to before.
3. **Given** a draft with one new item line added, **When**
   the DM presses Пересобрать and confirms, **Then** exactly
   one new row is inserted; no existing row is touched.
4. **Given** a draft with one item line removed, **When**
   the DM presses Пересобрать and confirms, **Then** exactly
   one row is deleted; no other row is touched.

---

### User Story 3 — Loot goes to the stash, not to PCs (Priority: P2)

The party loots a stack of unidentified scrolls. They don't
want to argue who carries them; they want to dump them in
the общак until next session. The DM marks every line in the
loot draft with recipient = «Общак», presses Применить. The
ten scroll rows appear under the stash's ledger with
`actor=<stash node>`, autogen-tagged. The PC ledgers stay
untouched.

**Why this priority**: stash-as-recipient is the everyday
case for items the party doesn't immediately split. Without
it the wizard would push every magical mystery into one
PC's bag by default.

**Independent Test**: an encounter with one loot draft line,
recipient = stash → press Применить → exactly one row on
the stash's ledger, zero on any PC's.

**Acceptance Scenarios**:

1. **Given** any draft line with recipient = stash, **When**
   the DM applies, **Then** the row's `actor_pc_id` equals
   the campaign's stash node id and the stash ledger
   reflects it.
2. **Given** a draft mixing PC recipients and stash
   recipients, **When** the DM applies, **Then** PC rows
   appear on PC ledgers and stash rows appear on the stash
   ledger; the autogen marker is identical
   (`encounter_loot`, same source mirror node).
3. **Given** a draft with any mix of recipients, **When**
   the DM presses **«Всё в общак»**, **Then** every line's
   recipient is rewritten to stash (coin lines lose their
   even-split mode and become "stash" too) without
   applying — the change is just to the draft. The DM can
   still hand-tweak any line back to a PC before pressing
   Применить. This is a UX shortcut, not a separate apply
   path.

---

### User Story 4 — DM splits coins evenly across participants (Priority: P2)

The DM marks a coin line with the **«Поровну между
участниками»** option. The dialog shows a live preview:
"4 участника · по 7.5 gp каждому · 0 gp в остатке". She
applies. Four rows materialise, one per participant, each
7.5 gp. Two sessions later one of those PCs is retconned out
of the participant list (the player decided their character
wasn't there); the DM removes the participant from the
encounter, presses Пересобрать. The diff shows "remove 1
row, redistribute 7.5 gp across remaining 3"; confirm; the
ledger now has 3 rows of 10 gp each.

**Why this priority**: even-split is the most common coin
disposition; making it a draft option (not a manual per-PC
fill) keeps the dialog usable for typical fights where loot
is "Coins go evenly to whoever fought".

**Independent Test**: a draft with one coin line marked
"split evenly" + N participants → applying creates exactly
N rows summing to the original amount → changing the
participant set and reapplying produces the new even split.

**Acceptance Scenarios**:

1. **Given** a draft coin line with "split evenly" and N
   participants, **When** applied, **Then** N rows are
   created summing to the draft amount; rounding follows
   the deterministic rule (plan.md).
2. **Given** an even-split line where the participant count
   has changed since the last apply, **When** the DM
   reapplies, **Then** the new distribution replaces the
   old (no orphan rows on removed participants, no doubled
   rows on retained participants).
3. **Given** an even-split line and zero participants in
   the encounter, **When** the DM tries to apply, **Then**
   the action errors before writing anything (the spec-012
   pattern of "config errors are surfaced, not silently
   eaten" applies).

---

### User Story 5 — Player sees an autogen badge on a looted row (Priority: P2)

A player opens her PC page, scrolls the ledger, sees the
sword row from US1. To the right of the row sits the
spec-012 autogen badge — a small ⚙ icon with hover/tap text:
**«Encounter loot · Patrol Cultists (loop 5, day 12)»**.
She taps it; nothing destructive happens, just a tooltip.
She knows: this row was generated by the DM's loot
distribution, not pencilled in by hand; if it looks wrong,
the source is the encounter. The same badge appears on
stash rows, on the session-page transaction list, and on
the global `/accounting` ledger.

**Why this priority**: the badge is what makes the wizard
**legible** — it tells players where a row came from and why
it might change next time the DM presses Пересобрать. The
spec-012 badge already exists and renders today; spec-013
inherits it free, but the inheritance has to be verified
because the badge's tooltip pulls "source title" from the
mirror node, not the encounter row.

**Independent Test**: any autogen-tagged row on any ledger
view → the badge renders, the tooltip resolves to the
encounter's title, and tapping it does not mutate state.

**Acceptance Scenarios**:

1. **Given** a loot row is rendered in any ledger view,
   **When** the page loads, **Then** the autogen badge from
   spec-012 FR-015 is visible on the row.
2. **Given** the badge is hovered or tapped, **When** the
   tooltip opens, **Then** it reads "encounter loot · <encounter
   title>" (or the localised equivalent), where the
   encounter title is fetched once per page (not per row).
3. **Given** the encounter is renamed after loot was
   applied, **When** a player reopens any ledger page,
   **Then** the badge tooltip reflects the new title without
   requiring a reapply.

---

### User Story 6 — Hand-edit + reapply (two-phase confirm) (Priority: P2)

The DM pencilled-in correction: an autogen sword row was
hand-edited from `qty=1` to `qty=2` because the party
actually found two. The `autogen_hand_touched` flag flipped
to `true` (spec-012 trigger). Three weeks later, the DM
opens the loot draft and changes the same line — now the
draft says one sword. She presses Пересобрать. Spec-012's
two-phase confirm fires: a dialog lists "Sword of Light ·
было 2 (правлено вручную) · станет 1" and asks for
confirmation. She reads, confirms; the row is overwritten.
Or she cancels; nothing changes.

**Why this priority**: the hand-touched flag is the safety
net that keeps the wizard from silently destroying a DM's
manual corrections. spec-012 already implements both the
flag and the dialog; spec-013 must verify both fire on
encounter-loot rows.

**Independent Test**: an encounter-loot row with
`autogen_hand_touched=true` → DM reapplies with a draft
change that touches that row → the diff dialog flags it as
hand-touched → confirm proceeds, cancel aborts.

**Acceptance Scenarios**:

1. **Given** any autogen loot row whose
   `autogen_hand_touched=true` is in the to-be-modified
   diff, **When** the DM presses Пересобрать, **Then** the
   confirm dialog opens and lists the row before any
   mutation occurs.
2. **Given** the confirm dialog is open, **When** the DM
   cancels, **Then** zero rows are mutated.
3. **Given** the same dialog, **When** the DM confirms,
   **Then** the row is overwritten and the
   `autogen_hand_touched` flag resets to `false`.

---

### User Story 7 — Encounter delete cascade (Priority: P3)

The DM created a duplicate encounter by accident and wants
to delete it. The duplicate had loot applied. She deletes
the encounter from the encounter list. The mirror node is
deleted by the encounter→mirror cascade; the loot rows are
deleted by the spec-012 `autogen_source_node_id` cascade.
No orphans remain in the ledger.

**Why this priority**: this is the only path that produces
orphaned autogen rows if it isn't wired. It's P3 because
the user rarely deletes encounters; but it has to work
because spec-012 promised that source-node delete cascades
autogen rows, and this is where spec-013 validates that
promise for its source.

**Independent Test**: an encounter with applied loot rows →
delete the encounter → the rows are gone, the mirror node
is gone, the encounter is gone, no other ledger row is
affected.

**Acceptance Scenarios**:

1. **Given** an encounter with autogen loot rows, **When**
   the encounter is deleted, **Then** every autogen loot
   row sourced from its mirror node is deleted, and no
   other transactions are affected.
2. **Given** the same encounter is deleted, **When** the
   delete completes, **Then** the mirror node is deleted
   too (no orphan node remains).
3. **Given** an encounter is deleted that had no autogen
   rows, **When** the delete completes, **Then** the
   encounter and its mirror are gone and no error is
   raised.

---

### Edge Cases

- **Encounter has no participants when the DM tries to
  apply.** The "split evenly" option errors as in US4 AC3.
  Per-PC assignments referencing a non-participant PC are
  legal — the DM may want to give a PC their absent
  share — and apply normally.
- **Encounter is deleted mid-confirm.** The two-phase
  confirm dialog is open; the source mirror node is gone;
  apply errors with "encounter no longer exists" before
  writing anything. The dialog dismisses.
- **Draft references an item line whose recipient PC was
  deleted.** Validation surfaces it as "recipient missing"
  before apply. The DM either reassigns or removes the line.
- **Encounter is not bound to a session yet.** The loot
  rows still need a `(loop_number, day_in_loop)`; if the
  encounter has no day metadata, the dialog requires the DM
  to pick one (loop + day inputs in the dialog header). The
  draft persists the picked day so reapply doesn't re-prompt.
- **Encounter status is `active` (the fight is still on).**
  The Распределить button is hidden — loot is a
  post-fight action. (Plan.md may relax this if the DM has
  ground-truth reasons to apply mid-fight, but the spec
  default is post-fight only.)
- **DM deletes a PC that received loot.** spec-010's
  `actor_pc_id ON DELETE SET NULL` rule applies — the row
  becomes "[deleted character]". Reapply detects the null
  actor, the diff treats it as "row no longer matches the
  draft" and surfaces it (DM can either accept the
  rewrite-to-correct-PC or back out).
- **Two encounters share a session and both have loot.**
  Independent mirror nodes → independent reconciles → no
  cross-contamination. The session ledger view shows both
  loot batches with distinct badge tooltips.
- **Backfill on existing encounters at migration time.**
  Existing `encounters` rows (the encounters in
  mat-ucheniya right now, ~50–100 of them) need a mirror
  node retroactively. The migration creates one per
  existing encounter, copying `title` and `campaign_id`. No
  loot rows exist on these encounters — they predate
  spec-013 — so no autogen rows are produced.
- **Renaming the encounter after loot is applied.** The
  badge tooltip resolves "source title" from the mirror
  node at render time (US5 AC3); a rename of the encounter
  must propagate to the mirror's title. Spec-013's mirror
  trigger handles this: an UPDATE of `encounters.title`
  syncs to the mirror node.
- **Two-phase confirm respects spec-012 tombstones.** A
  loot row that was hand-deleted (not just hand-edited)
  leaves a tombstone (spec-012 mechanism); reapply detects
  the tombstone and asks the DM "this row was deleted by
  hand last time — recreate it?" the same way spec-012's
  reapply does.

---

## Requirements

### Functional Requirements

**Encounter mirror node**

- **FR-001**: Every `encounters` row MUST have an
  associated node of `type='encounter'` (the **mirror
  node**). The mirror MUST share `id` semantics with the
  encounter — concretely, a `node_id` column on `encounters`
  with FK to `nodes(id)`. The mirror's `title` MUST mirror
  the encounter's `title` and its `campaign_id` MUST mirror
  the encounter's. Other graph attributes (description,
  edges, etc.) are out of scope for spec-013 — the mirror
  is intentionally bare.
- **FR-002**: The mirror node MUST be created automatically
  on encounter insert. The DM MUST NOT see the mirror in
  the catalog, in any side menu, or in any node-typeahead
  picker — it's an implementation node, not a user-facing
  entity. (Catalog and pickers filter `type='encounter'`
  out by default; an explicit "show implementation nodes"
  affordance is out of scope.)
- **FR-003**: Renaming an encounter MUST propagate to the
  mirror node's title. Updating any other encounter field
  (status, current_round, current_turn_id) MUST NOT touch
  the mirror.
- **FR-004**: Deleting an encounter MUST delete its mirror
  node (cascade). Deleting the mirror node directly MUST
  delete the encounter (the inverse cascade — but DM
  shouldn't be able to delete the mirror because FR-002
  hides it).
- **FR-005**: Existing encounters at migration time MUST be
  backfilled with a mirror node each. The backfill MUST be
  part of the same migration that introduces the column —
  no separate "run this script later" step.

**Loot draft**

- **FR-006**: An encounter MUST be able to carry a **loot
  draft** — an editable structure listing coin amounts and
  item lines, each with a recipient assignment. The draft's
  storage location (column on `encounters`, separate table,
  attribute on the mirror node) is `plan.md`. The
  spec-level guarantee is "the draft persists across
  page reloads and across sessions; editing the draft does
  not produce ledger rows; only the apply action produces
  rows".
- **FR-006a**: The draft editor MUST provide a one-click
  **«Всё в общак»** preset that rewrites every line's
  recipient to the campaign stash (coin lines drop their
  even-split mode and become recipient=stash). The preset
  edits the draft only; it does not apply. The DM can
  override individual lines back to PCs before pressing
  Применить. The inverse preset («Всё участникам поровну»)
  is out of scope for spec-013 — common loot disposition is
  "everything to стек первым в общак, потом разберёмся", not
  "everything immediately split to PCs".
- **FR-007**: Each draft entry MUST be one of:
  - **Coin line**: amount in `{cp, sp, gp, pp}` (mirroring
    the spec-010 transaction shape), recipient mode (one of:
    single PC, stash, even-split-across-participants).
  - **Item line**: free-text name (`item_name`), integer
    quantity, recipient (single PC or stash). No item-node
    reference (spec-015 territory). One item line is one
    autogen row.
- **FR-008**: A draft MAY be empty (no entries). Applying
  an empty draft MUST be a no-op.
- **FR-009**: Editing the draft MUST be DM-only. Players
  MUST NOT see the draft's edit affordance. Whether players
  see the *applied* rows is governed by spec-010's existing
  visibility rules (everyone sees the ledger, with role
  gating on edit).

**Apply / Reapply**

- **FR-010**: The encounter page MUST surface a single
  affordance — **«Распределить лут»** when no autogen rows
  exist for this encounter, **«Пересобрать»** when at least
  one row exists. Both flow through the same server action
  with the encounter's mirror node id as `source_node_id`.
- **FR-011**: The apply action MUST be visible only to
  DM-role users for this campaign. Players MUST NOT have
  the affordance even if the encounter is open.
- **FR-012**: The apply action MUST reuse spec-012's two-
  phase confirm pattern: compute the desired row set, diff
  against the current state, return `needsConfirmation`
  with the affected list if any rows are hand-touched or
  tombstoned; otherwise apply directly. The dialog UI MUST
  be the same component spec-012 ships, possibly
  parameterised.
- **FR-013**: Apply MUST be idempotent on `(wizard_key,
  source_node_id) = ('encounter_loot', mirror_node_id)`.
  Running it twice with an unchanged draft produces the
  same final row set with no churn — no inserts, no
  updates, no deletes.
- **FR-014**: Apply MUST NOT touch any row whose autogen
  marker doesn't match `(encounter_loot, this mirror)`.
  Other autogen rows (loop start setup, future wizards) and
  manual rows are out of bounds — the spec-012 reconcile
  guarantee applies unchanged.
- **FR-015**: The encounter page MUST refresh after a
  successful apply such that any inline indicator of
  applied state ("Лут распределён · N строк", row count,
  empty-state vs filled-state) reflects the new ledger
  immediately. The exact indicator is `plan.md`.

**Day & loop assignment**

- **FR-016**: Every loot row MUST carry a valid
  `(loop_number, day_in_loop)`. Resolution order:
  1. If the encounter is already bound to a specific day
     in the application — via session, via an
     encounter-day attribute introduced by a later spec, or
     via the apply dialog's manual day picker — use that.
  2. Otherwise the apply dialog MUST require the DM to pick
     loop and day before the apply button enables.
  The picked day MUST persist on the draft so reapply does
  not re-prompt. Where the day is stored is `plan.md`.
- **FR-017**: Even-split coin lines MUST distribute across
  the participants present at apply time, not at draft-edit
  time. (If the participant list changes between drafts,
  reapply uses the new list — see US4 AC2.) The "amount per
  participant" value the dialog previews is computed from
  the current participant list.
- **FR-018**: The deterministic rounding rule for non-even
  splits MUST produce the same result for the same input.
  The exact rule (e.g. "remainder goes to participants in
  initiative order, smallest denominations first") is
  `plan.md`. The spec-level guarantee is "deterministic, and
  the dialog previews the per-recipient breakdown before
  apply".

**Visibility & attribution**

- **FR-019**: Loot rows inherit the spec-012 autogen badge
  (FR-015 of spec-012). The badge tooltip MUST surface the
  wizard label and the encounter's title — concretely,
  "encounter loot · <encounter title>" (or its localised
  equivalent). The title MUST resolve from the mirror node
  via the same `autogenSourceTitles` Map mechanism spec-012
  ships (T040 of spec-012's tasks.md).
- **FR-020**: The author recorded on a loot row is the user
  who pressed Применить / Пересобрать. On reapply, rows
  whose values change have their author updated; rows that
  are unchanged keep their original author. (Same rule as
  spec-012 FR-018 / FR-019.)
- **FR-021**: The ledger's autogen filter from spec-012
  (`?autogen=only|none`) MUST already include encounter-
  loot rows by virtue of their marker — no filter-bar code
  change is required. (A future refinement to filter by
  `wizard_key` is out of scope.)

**Cascade**

- **FR-022**: Deleting an encounter MUST cascade-delete:
  (a) the mirror node, (b) every transaction with
  `autogen_source_node_id = mirror_node.id` (via spec-012's
  cascade FK on the transactions column). No application-
  layer cleanup code MUST be required to achieve this — the
  cascade chain is database-level.
- **FR-023**: Deleting an encounter MUST NOT cascade-delete
  any non-autogen transaction that happens to be linked to
  the encounter via other means (e.g. a manual transaction
  whose comment mentions the encounter, or a session row).
  Spec-013 owns only the autogen-tagged loot rows.

### Non-Functional / Performance

- **FR-024**: A first apply on a typical encounter (~10
  draft lines, 4 participants, even-split coin distributing
  to 4 rows + 6 item rows = ~10 generated rows) MUST
  complete in ≤ 500 ms wall-clock on the mat-ucheniya
  production baseline. The generation MUST be a single
  server action, not a client-side loop of per-row
  inserts. (Reuses the spec-012 RPC pattern; can be a thin
  wrapper or a separate RPC — `plan.md` decides.)
- **FR-025**: Reapply on an unchanged 10-row draft MUST be
  ≤ 300 ms wall-clock and MUST NOT issue any INSERT,
  UPDATE, or DELETE statements (no-op idempotent path).
- **FR-026**: Listing the encounter mirror nodes MUST NOT
  contaminate node typeaheads, catalog views, or sidebar
  trees. The performance cost is "filter `type !=
  'encounter'`" wherever node lists are read by users —
  one WHERE clause, no new index needed (existing node
  filters already partition by type).

### Constitution Compliance

- **I. Loop as core**: ✅ Loot rows are dated to a loop +
  day, just like every spec-010 transaction.
- **II. Atomicity**: ✅ Each loot row is one atomic
  transaction; the apply action wraps the multi-row write
  in a single server-side operation.
- **III. Cross-references**: ✅ Loot rows link PC ↔
  encounter (via mirror) ↔ ledger; the mirror is the
  forward-compat seam for richer cross-references later.
- **IV. Data first**: ✅ Loot draft persists in the
  database, not in client-only state; UI reads from it.
- **V. Event sourcing**: ✅ The applied rows are the
  events; the draft is the source-of-truth recipe; the
  current ledger is the replay.
- **VI. Reader UI**: ✅ Players read loot rows on PC
  pages, stash page, session page; no new edit surface for
  players.
- **VII. Each release playable**: ✅ Spec-013 ships a
  complete user-visible feature (loot distribution from
  end to end); it does not block on spec-014 (approval) or
  spec-015 (item catalog).
- **VIII. Stack simplicity**: ✅ Reuses Supabase + Next.js,
  no new tooling, no new framework on top of spec-012.
- **IX. Universality**: ✅ The "30 days, 4 PCs Лекс
  without loan" specifics are not encoded; the wizard
  operates on whatever PCs / loop / draft the campaign has.

---

## Out of Scope

- **Encounter-as-canonical-node rework.** Typed enemy
  lists, edges to locations, day-of-loop attribute,
  reusable templates that supersede `encounter_templates`.
  Architecturally desirable, separately specced. spec-013
  ships only the empty mirror.
- **Auto-generated loot from monster CR / templates.** The
  draft is hand-filled by the DM. A future spec can read
  monster CR + party level and propose draft entries; that
  is not this spec.
- **Item catalog integration (spec-015).** Item lines are
  free-text `{name, qty}` only. No `item_node_id`, no link
  to a canonical "Sword of Light" entity. Spec-015 will
  retrofit it.
- **Approval flow (spec-014).** Players can already see
  loot rows but cannot trigger apply or edit the draft.
  When spec-014 lands and players gain a write path,
  encounter loot stays DM-only on the wizard side because
  the wizard is fundamentally a DM action — a player
  doesn't "submit a loot draft for approval".
- **Mid-fight loot.** Apply is post-fight only (status =
  completed). DM may relax this in `plan.md` if there's a
  reason; the spec default is post-fight.
- **Auto-distribution heuristics.** "Smart split" by class
  (martial gets weapons, caster gets scrolls), or by need
  (lowest-coin PC gets coins), or by CR-to-XP, or by any
  other rule. Out of scope. Even-split is the only
  multi-recipient option.
- **Coin denomination optimisation.** If 100 cp lands as
  loot, it stays 100 cp on the row (or whatever
  denomination the DM put in the draft). No "convert to 1
  gp for tidiness". The DM's input is the source of truth.
- **Loot history per encounter beyond the ledger.** The
  ledger is the history. No separate "loot timeline" view
  per encounter. The encounter page may surface a count or
  a recent-rows list, but it doesn't duplicate state.
- **Templates / presets for loot drafts.** "Apply the
  standard cult-patrol loot kit". Out of scope; the
  encounter-as-node rework will subsume this.
- **Multi-encounter bulk apply.** "Apply loot for the last
  three encounters at once". One encounter at a time.
- **Loot for non-PC actors.** NPCs, monsters, the world.
  Recipients are PCs or the stash. Anything else is out of
  scope.
- **Draft import / export.** No copy-paste of drafts
  between encounters in this spec.
- **A bulk-add affordance for participants.** Even-split
  uses the existing encounter participant list; if the DM
  wants to give absent PCs their share, she does so by
  per-PC assignment, not by "phantom participants". Adding
  a participant is an existing encounter-tracker action.

---

## Success Criteria

- **SC-001**: A DM can distribute a 10-line loot draft to
  4 PCs and the stash in ≤ 30 seconds total interaction
  time (open dialog → fill assignments → apply). Measured
  by walking through the flow once with mat-ucheniya
  fixtures.
- **SC-002**: Reapplying an unchanged draft produces zero
  ledger writes (verifiable by row-version stamps or by
  observing zero changed `created_at` values on existing
  rows).
- **SC-003**: A loot row carries a working autogen badge
  with a tooltip resolving to the encounter title;
  renaming the encounter is reflected in the tooltip
  without a reapply.
- **SC-004**: Deleting an encounter that had loot applied
  removes every related autogen row from every ledger
  view; no orphans remain in `transactions`, no orphan
  mirror node remains in `nodes`.
- **SC-005**: The mirror node does not appear in any user-
  visible node list (catalog grid, sidebar, node-typeahead
  pickers).
- **SC-006**: Hand-touched encounter-loot rows trigger the
  spec-012 two-phase confirm dialog on reapply,
  identically to loop-start-setup rows. Verified by
  reproducing the spec-012 confirm path with an
  encounter-loot row swapped in.
- **SC-007**: The migration that introduces
  `encounters.node_id` and the mirror trigger backfills
  every existing encounter in mat-ucheniya at deploy time;
  no encounter is left without a mirror.

---

## Clarifications

(Resolved 2026-04-25 in chat 49.)

### Q1: Where does the loot draft live?

**Answer: dedicated table `encounter_loot_drafts`.**

Mirrors spec-012's `pc_starter_configs` /
`campaign_starter_configs` pattern — one row per encounter,
fields for coin amounts (cp/sp/gp/pp), JSONB array of
item lines (`{name, qty, recipient_node_id | null,
recipient_mode}`), persisted day & loop (closes Q3 below),
plus standard `created_at` / `updated_at`. Clean RLS
(DM-only write via server action, read for all members).
Migration: one new table + index on `encounter_id`. Future-
friendly: spec-018's encounter rework reads/migrates
trivially.

Rejected alternatives:
- **JSONB on `encounters`** — cheaper migration, but RLS on
  JSONB columns is grub (whole-column or none), and the
  draft state mixes with operational state (`status`,
  `current_round`, etc).
- **Mirror-node attributes** — directly contradicts the
  spec's pinned point #3 ("mirror is intentionally bare").
  Opening that door now would break the forward-compat seam
  for spec-018.

### Q2: Deterministic rounding rule for uneven coin split

**Answer: floor-to-cp, remainder distributed to participants
in initiative order (NULLS LAST → sort_order), starting from
the first.**

Concretely: 31 gp split across 3 PCs = 3100 cp. `floor(3100
/ 3) = 1033 cp` per PC, remainder 1 cp. PC #1 in initiative
order receives 1034 cp; PCs #2 and #3 receive 1033 cp each.
The dialog preview MUST surface this before apply, e.g.:

> 4 участника · по ~10.33 gp · остаток 1 cp → Mirian (init 18)

Initiative order is read at apply time, not at draft-edit
time — same as the participant set (FR-017). If two
participants share an initiative value, `sort_order` breaks
the tie; if both are equal too, `created_at` is the final
tiebreaker (deterministic).

### Q3: Where does the picked day persist when the encounter has no session?

**Answer: on the loot draft (closed by Q1).**

Two columns on `encounter_loot_drafts`: `loop_number int
not null`, `day_in_loop int not null`. Defaults at draft-
creation time: if the encounter has a session binding, copy
the session's `day_to`; else leave the draft uninitialised
and require the DM to fill the day picker before the apply
button enables (FR-016 path). Once set, reapply does not
re-prompt — the values stay on the draft and travel with
edits. If the DM later binds the encounter to a session,
the draft's day does NOT auto-sync to the session's day —
because that would silently move applied rows on the
ledger; the DM can hand-edit the draft if she wants the
move.

### Q4: Inline panel or dialog?

**Answer: inline panel on the encounter page, DM-only,
always mounted.**

The two-phase confirm dialog opens only when reapply
detects hand-touched rows or tombstones — same trigger as
spec-012's confirm dialog. The panel itself is the primary
edit surface; the dialog is the safety net. Reasons:

- Loot grows incrementally during a fight ("ой, у культиста
  ещё кинжал"); a dialog with two clicks each time is
  friction.
- The state ("draft has 4 lines · 0 applied" → "draft has
  4 lines · 4 applied" → "draft has 5 lines · 4 applied,
  1 pending") is more legible in a persistent panel than in
  a dialog that closes between edits.
- Reuses spec-012's dialog component for the confirm path
  unchanged.

Players never see the panel (FR-009 / FR-011); the
encounter page renders an alternative read-only "Лут
распределён" summary block to non-DM viewers (just the
applied row count + a link to the encounter's filtered
ledger view).

### Q5: What happens to applied loot rows on encounter reopen (`completed → active`)?

**Answer: applied rows stay; the apply button disables until
the encounter returns to `completed`.**

The applied row is a fact ("this loot was distributed on
day X"). Reopening means "we're continuing the same
fight" — initiative is preserved, HP is preserved, and loot
that was already distributed remains distributed. If the DM
genuinely wants to retract, she hand-edits or hand-deletes
the rows (spec-012's hand-touched / tombstone machinery
catches those edits and surfaces them on the next reapply).
Auto-retraction on reopen would be silent data destruction
without a confirm step — rejected.

When the encounter flips back to `completed`, the apply
button re-enables and the existing draft (with its existing
day) loads. If the DM has changed the draft during the
reopen-active window, those changes are still in the draft
and reapply will reconcile against them as usual.

---

