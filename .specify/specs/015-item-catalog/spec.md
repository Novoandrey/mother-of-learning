# Feature Specification: Item Catalog Integration

**Feature Branch**: `015-item-catalog`
**Created**: 2026-04-25
**Status**: Clarified (2026-04-26)
**Input**: Seventh and final spec in the Bookkeeping series
(see `.specify/memory/bookkeeping-roadmap.md`). Promotes items
from free-text strings (the placeholder shape spec-010 shipped
and spec-011 / spec-013 / spec-014 inherited) to first-class
graph nodes of `type='item'`, backed by a queryable catalog UI.
Adds one new node type, one new column on `transactions`
(`item_node_id`, nullable for back-compat), one initial SRD
seed, and a backfill of existing item-transactions by name.
This is the structural payoff that makes deduplication,
auto-fill of price / weight on ledger entry, per-item ownership
timelines, and a real "show me everything Mirian owns" view
possible — none of which work today because every "Длинный
меч" / "Longsword" / "long sword" is a separate string in a
separate transaction with no edges.

The spec deliberately scopes **out** of location inventory
(items physically residing in non-actor places), the
"loot a location" bulk operation, and the spell-as-item
question. Those are tracked separately in the backlog (see
IDEA-054 deprioritised note) and may or may not happen — the
DM's current judgement is they probably don't materialise.

## Context

The bookkeeping series (specs 009–014) treated items as a
deliberate placeholder: a `text item_name` column on
`transactions` plus a signed `item_qty` (spec-011 migration
036) is enough to make a ledger row look like an item
transfer, but every reference is a free string. The
consequences are by now obvious in mat-ucheniya:

- **No deduplication.** "Длинный меч", "длинный меч",
  "Long sword", "Longsword +1" all live as distinct strings
  on distinct rows. Counting how many longswords Mirian owns
  requires a fuzzy text match across her transactions, which
  the app does not do; the DM does it by reading the ledger.
- **No auto-fill.** Every time the DM enters "верёвка 50ft"
  she retypes the price and weight, or skips them entirely
  ("вспомним позже"). The information lives in the SRD
  table on dnd.su and on the DM's bookshelf, not in the app.
- **No per-item view.** "What is the history of the Sword of
  Light" — who owned it, when it was looted, when it changed
  hands — is a question with no UI. The data is in the
  ledger, but only as scattered text matches.
- **No source attribution.** "Where did this potion come
  from? SRD? Homebrew? A specific sourcebook?" — no field
  to record it on, so it isn't recorded.
- **Spec-013's loot draft inherits the placeholder.** Item
  lines on the encounter loot draft are `{name, qty,
  recipient}` strings — same fragility, scaled to every
  fight.
- **Spec-011's stash items grid** renders the existing
  free-text item rows aggregated by name (see chat 42 Slice
  B). It works as a snapshot but cannot link any row to a
  canonical entity, and so cannot show price, weight, or
  type.

The fix is the one the bookkeeping roadmap pinned for
spec-015 from the start: **items are nodes**. Every
significant item — every magical item, every named item, every
SRD-catalogued mundane item the DM cares to seed — is a node
of `type='item'` with structured fields. Transactions get a
new column `item_node_id` (nullable, FK to `nodes(id)`); when
present, it is the canonical reference; when absent, the row
stays as a free-text fallback (back-compat for legacy data
and for items the DM hasn't bothered to canonicalise yet).

The catalog itself is **app over data nodes** (constitution
III-b): a flat node list with a configurable group-by /
filter / sort surface, not a tree, not a hierarchy. The same
component pattern as the existing entity catalog (spec-001),
specialised to items — with item-specific facets (rarity,
price band, source book, availability) on the filter bar and
a tabular layout that defaults to grouping by category.

**Five architectural points are pinned at the spec level**
because they shape every later decision:

1. **Item node = Platonic template, transactions = instances.**
   An item node is the **Образец** — a stable Platonic ideal
   describing what this kind of item *is*: its name, its
   category, its rarity, its canonical price and weight, its
   description, its source, its availability. The Образец is
   not a single physical item in the world; it is the
   reference against which every actual physical instance
   ("Мириан's longsword in loop 3 day 5") is recorded. Every
   physical instance lives as a transaction (or sequence of
   transactions: looted, transferred, sold, lost) that
   references the Образец via `item_node_id` and adjusts a
   signed `item_qty`. The Образец itself does not move, does
   not deplete, does not change owner — it has no quantity
   and no location, only attributes. Editing the Образец is
   a deliberate, infrequent DM action that retroactively
   changes how every linked transaction is *displayed* (but
   not what was historically recorded — see FR-014's
   snapshot rule). This separation mirrors the existing
   condition / effect / monster patterns in the codebase
   (the condition node is the template; an
   `encounter_participant_conditions` row is the instance).
2. **Items are nodes, not their own table.** Reusing the
   existing graph (`nodes` + `node_types` + JSONB `fields`)
   gives the catalog all the existing affordances —
   permalinks, edges, descriptions, search, role gating —
   for free. A separate `items` table would duplicate every
   one of those for an entity that genuinely wants to live
   on the graph (an item *can* be the source of a quest, the
   reward of an encounter, the focus of a relationship —
   real edges that justify the node treatment).
3. **`transactions.item_node_id` is nullable.** The free-text
   `item_name` column stays. The column means "if you have a
   canonical Образец for this row, link it; otherwise the
   string is the source of truth". This is the only way
   spec-013's pre-existing draft shape, spec-014's pending
   queue, and the historical mat-ucheniya ledger keep
   working without a destructive backfill.
4. **Inventory is a temporal slice — the user picks the day.**
   "What does Mirian own" is never a row in a table — it is
   always a query: "sum of signed `item_qty` over all
   approved item-transactions for `actor=Mirian` filtered to
   `(loop, day_in_loop ≤ chosen_day)`". The chosen day is a
   **UI control**, not a security gate. Default opens at a
   sensible "where the actor stopped in time" — the same
   helper `computeDefaultDayForTx` the transaction form
   already uses (latest tx → loop frontier → 1). But the
   user is free to pick **any** day from 1 to the loop
   length: day 30 with no transactions logged after day 7
   simply shows the same items as day 7, because there are
   no rows in between. Future loops are not selectable
   (they haven't happened yet, constitution I). The chosen
   `(loop, day)` is **always clearly visible on screen** —
   "Петля 4 · день 15" — so the DM can trust what she's
   looking at. Transparency over guards: the DM is
   competent, the day picker is a tool, not a child-lock.
   This rule applies identically to PC inventory, stash
   inventory, and any future location inventory.
5. **The catalog is read-mostly, write-DM-only.** Players
   browse, filter, sort, group; they never create or edit
   item nodes. Linking a player-facing transaction to an
   existing catalog entry (typeahead) is a read of the
   catalog, not a write — adding new items is a DM action.
   This matches the spec-014 contract (player writes go
   through the queue) without complicating it: the typeahead
   in the player ledger form is a read of canonical Образцы,
   it doesn't create them. Editing an existing Образец is
   even rarer than creating one (point 1) and the UI MUST
   make it feel that way (see FR-030).

The spec deliberately leaves several questions open for
Clarify (see § Open Questions): the item field schema
(JSONB vs typed columns), the `categories(scope='item')`
keep-or-kill question (TECH-011), the SRD-import scope
(every SRD item or just magical), the backfill strategy
(strict vs fuzzy), and the availability-field shape.

---

## User Scenarios & Testing

### User Story 1 — DM creates a new item in the catalog (Priority: P1)

The DM is prepping a session and wants to add a homebrew
magic item, "Кольцо Шёпотов петли", to the campaign. She
opens the catalog, presses **«+ Предмет»**, and fills a
form: name, category (magic-item), rarity (rare), price
(700 gp), weight (—), source ("homebrew · мать учения"),
availability ("уникум · нельзя купить"), description
("Раз в петлю владелец слышит шёпот из следующего витка
…"). She saves. The new item appears in the catalog grid
under the «Магические · Rare» group, ordered alphabetically
within the group.

**Why this priority**: without item creation the catalog is
empty and the rest of the spec has no data to hang from.

**Independent Test**: open the catalog with no item nodes
present → DM creates one → it shows in the catalog with all
its fields → re-opening the page shows it persisted.

**Acceptance Scenarios**:

1. **Given** an empty catalog, **When** DM creates an item
   with all fields filled, **Then** the item appears in the
   catalog grid and is queryable by name, category, rarity,
   price, source, availability.
2. **Given** an empty catalog, **When** DM creates an item
   with only name + category, **Then** the item is created
   with optional fields blank and the grid renders the
   blanks gracefully (no "undefined", no broken layout).
3. **Given** a player session, **When** the player opens the
   catalog, **Then** there is no «+ Предмет» button and no
   edit affordance on item rows.

---

### User Story 2 — DM browses the catalog as a grouped table (Priority: P1)

The DM is preparing a shop and wants to see "all magical
items priced under 500 gp, grouped by rarity, sorted by
price ascending within each rarity". She opens the catalog,
sets group-by = «Редкость», filter category = «magic-item»,
filter price ≤ 500 gp, sort = «Цена ↑». The grid renders
three section headers (Common, Uncommon, Rare) with item
rows beneath each — name, category, rarity chip, price,
weight, source. She can collapse a section by clicking the
header. The view is the table, not a card grid — every
column is a thin row, comparable to a spreadsheet.

**Why this priority**: this is the entire reason for adding
filterable structured fields. A flat list is a step down
from grep'ing the SRD; the value of the catalog is in
slicing it.

**Independent Test**: with ≥ 30 items seeded across multiple
categories / rarities, the DM can configure group-by,
filter, sort and the grid responds correctly without
reload.

**Acceptance Scenarios**:

1. **Given** items of multiple categories, **When** DM sets
   group-by = «Категория», **Then** the grid renders one
   section per category present in the result set, with the
   section header showing category label and item count.
2. **Given** items of multiple rarities, **When** DM filters
   to one rarity, **Then** only items of that rarity render,
   and the rarity filter chip appears in the active filters
   bar (analogous to the ledger filter chip pattern, chat
   43).
3. **Given** items with prices 0..1000 gp, **When** DM sorts
   by price ascending, **Then** items render cheapest-first
   within each group (group order is independent of sort).
4. **Given** any active filter set, **When** DM presses
   «Сбросить всё», **Then** filters clear and the full
   catalog renders.
5. **Given** an empty filter result, **When** the grid
   would have no items, **Then** an empty-state message is
   shown ("Ничего не найдено" + suggestion to adjust
   filters).

---

### User Story 3 — DM logs an item transaction with autofill (Priority: P1)

The DM is recording loot. In the transaction form she
selects kind = «Предмет», starts typing "длинн" in the item
field, the typeahead suggests «Длинный меч» (existing
catalog node) at the top of the dropdown plus a "+ Создать
«длинн…»" option at the bottom. She picks «Длинный меч»;
the form auto-fills the item name as canonical and shows a
read-only chip with price (15 gp) and weight (3 lb) under
the field as informational hint. She submits. The
transaction is recorded with `item_name = 'Длинный меч'`
AND `item_node_id = <node id>`. On the ledger row, the item
name renders as a link to the item's catalog page.

**Why this priority**: this is the dedup and autofill
payoff. Without it, every DM-typed item is still a unique
string and the catalog is decorative.

**Independent Test**: with at least one item in the catalog,
the DM types its name in the transaction form → typeahead
shows it → selecting it links the row to the node.

**Acceptance Scenarios**:

1. **Given** an item «Длинный меч» in the catalog, **When**
   DM types "длинн" in the item field, **Then** the
   typeahead shows «Длинный меч» as the top suggestion.
2. **Given** the typeahead is open, **When** DM picks an
   existing item, **Then** the form fills the canonical
   name and the submitted transaction has `item_node_id`
   set.
3. **Given** the typeahead is open with no exact match,
   **When** DM submits without picking, **Then** the
   transaction is created with `item_name = <typed>` and
   `item_node_id = NULL` (back-compat path), with a
   non-blocking inline hint suggesting "не нашлось в
   каталоге — создать?".
4. **Given** a loot draft on an encounter (spec-013),
   **When** DM picks an item from the catalog typeahead,
   **Then** on apply the resulting transaction has
   `item_node_id` set (spec-013 retrofit).
5. **Given** a player submits a pending transaction
   (spec-014), **When** the player picks an item from the
   typeahead, **Then** the pending row carries
   `item_node_id`; on DM approval the link persists.

---

### User Story 4 — Player and DM see PC inventory as a structured table (Priority: P1)

The player opens her PC's page. Under the wallet block there
is a new **«Предметы»** tab (analogous to the stash page
tabs from chat 43 Slice B). She clicks it. The view renders
her inventory at the **default day** — wherever Mirian
"stopped in time" (latest tx → loop frontier → 1, same
helper the transaction form uses). Aggregated by item: one
row per distinct item she owns, columns name, category,
rarity, slot, qty, total weight, total value. A clear
subtitle on the tab makes the slice unambiguous: «Петля 4 ·
день 7». Default group-by is by category; default sort is
name. She can switch group-by to rarity, or filter to
"только магические". Each row links to the item's catalog
page.

The day picker is right there too. Mirian's player can
scrub it to day 15 to see "what would I have at day 15 if
nothing else were logged"; she can scrub to day 1 to see
"what did I start the loop with"; she can scrub to day 30
to see "everything I've accumulated". The picker doesn't
block anything — it's a transparent slider into the
transaction history.

The loop picker beside it works the same way. If Mirian's
player wants to remember "what did I have at the end of
loop 3 when we faced the dragon", she switches the picker
to «Петля 3», the day picker resets to a sensible default
for that loop, and she scrubs as needed. Past loops are
read-only history — constitution I says inventory is
wipeable per loop, and that wipe is implemented as "each
loop has its own disjoint slice", not as a destructive
event. Future loops are not offered — the campaign hasn't
played them.

**Why this priority**: the bookkeeping series promised
"player can see what they own". Today they see a list of
text strings on a wallet page; this user story upgrades it
to a real inventory with the temporal model the rest of
the app already commits to.

**Independent Test**: with several item-transactions on a PC
across two loops (some linked to catalog, some not), the
inventory tab renders correctly at any chosen `(loop, day)`
slice, respects the day picker as a free control, and
renders both linked and unlinked items in one consistent
table.

**Acceptance Scenarios**:

1. **Given** a PC with three potion-purchase rows linked to
   the same catalog node in the current loop with day ≤
   selected, **When** the player views the inventory tab,
   **Then** one row appears with qty=3.
2. **Given** a PC with a catalog-linked sword and a
   free-text "странный камень" (no node) in the current
   loop, **When** the inventory renders, **Then** both
   appear; the sword has structured fields (rarity,
   category, slot), the stone has only name and qty.
3. **Given** a PC with no item transactions on `day 12`,
   **When** the day picker is set to `day 7` and then to
   `day 12` and then to `day 30`, **Then** the same set
   of items renders for all three (whatever was logged
   through day 7 — no transactions exist later in this
   case, so day 12 and day 30 show identical results).
   No error, no warning, no block.
4. **Given** a PC who acquired an item on `day 12` and
   lost it on `day 18`, **When** the day picker is at day
   10, **Then** the item does NOT appear; **When** the
   picker moves to day 15, **Then** the item appears with
   qty=1; **When** the picker moves to day 20, **Then**
   the item does NOT appear (qty nets to zero).
5. **Given** a PC with item rows from loop 3 and loop 4
   (both already played), **When** the loop selector is
   set to loop 4, **Then** only loop 4's items appear in
   the slice; switching to loop 3 swaps to loop 3's view;
   loop 3's items do NOT carry over into loop 4.
6. **Given** the campaign's current loop is 4 and the loop
   picker is opened, **When** the user inspects available
   options, **Then** loops 5+ are not offered (FR-023b);
   loops 1..4 are.
7. **Given** a PC viewing her own inventory, **When** she
   opens the inventory tab, **Then** there is no edit
   affordance — inventory is read-only; changes are made
   by ledger transactions.
8. **Given** the same view applied to the campaign stash,
   **When** rendered, **Then** it shows the stash's
   inventory with the same columns, grouping, day picker,
   loop picker — the same component, no special-casing
   for actor type.
9. **Given** an inventory tab opened with no URL params,
   **When** the page renders, **Then** the day chip
   subtitle is clearly visible (e.g. «Петля 4 · день 7»)
   and the day defaults to a sensible value (latest tx →
   frontier → 1). The default rule MUST match the wallet
   block's first-render default rule.

---

### User Story 5 — Anyone opens an item page and sees its ownership timeline (Priority: P2)

The DM clicks on the Sword of Light row in the catalog. The
item page opens. It shows the item's structured fields
(name, category, rarity, price, weight, source, availability,
description) at the top, then a **«История»** section below
listing every transaction that references this item node, in
chronological order: "Loop 2, day 5 — найден на энкаунтере
Логово культа", "Loop 3, day 11 — Mirian → Lex", "Loop 4,
day 1 — Lex → общак". Each entry is a clickable link to the
ledger filter for that transaction. Player view is the same
minus DM-only edit affordances.

**Why this priority**: per-item history is the canonical
"why is this item a node" use case. P2 because it's the
view, not the underlying data — the data exists once items
are nodes, the page surfaces it.

**Independent Test**: an item linked from ≥ 2 transactions
across different loops → opening the item page shows both,
in order.

**Acceptance Scenarios**:

1. **Given** an item with no linked transactions, **When**
   the item page opens, **Then** the «История» section
   renders an empty state ("Нет операций с этим предметом").
2. **Given** an item linked from N transactions, **When**
   the item page opens, **Then** N entries render in
   chronological order with PC / actor names resolved.
3. **Given** an item also referenced by free-text rows
   (`item_name` matches but `item_node_id` is NULL), **When**
   the page opens, **Then** those rows MAY appear in a
   secondary subsection ("Возможные совпадения по имени")
   — exact behaviour is `plan.md`. The spec-level guarantee
   is that the linked-by-id rows are never mixed with
   linked-by-name-only rows in a way that misrepresents
   either set.
4. **Given** a DM viewing the item page, **When** she clicks
   «Редактировать», **Then** the same edit form as US1
   opens, prepopulated.
5. **Given** a player viewing the item page, **When** she
   looks for «Редактировать», **Then** there is no such
   button.

---

### User Story 6 — Initial SRD seed + backfill of existing item-transactions (Priority: P2)

On migration deploy: every existing campaign gets the SRD
item set seeded as item nodes (~300 mundane + ~100 magical,
exact count `plan.md`). Existing item-transactions in the
database whose `item_name` matches an SRD entry exactly
(case-insensitive, trimmed) are backfilled with
`item_node_id = <matched node>.id`. Non-matching free-text
rows are left as-is (no destructive cleanup, no fuzzy
match).

**Why this priority**: P2 because the catalog is functional
without it (DM can hand-create the few items she actively
uses), but with the SRD seed it goes from "empty grid you
have to fill" to "complete reference table on day one".

**Independent Test**: the `mat-ucheniya` campaign has a
specific set of historical item rows (verified by query in
plan/T-phase). After migration deploy, a defined subset of
those rows should match SRD seeds and get linked; the rest
should remain free-text. Counts measurable, no surprises.

**Acceptance Scenarios**:

1. **Given** a fresh campaign created after migration,
   **When** the campaign is initialised, **Then** the SRD
   item nodes are present in its catalog.
2. **Given** an existing campaign with item-transactions
   pre-migration, **When** migration runs, **Then** rows
   whose `item_name` matches an SRD entry exactly are
   updated with `item_node_id`; rows that don't match are
   not touched.
3. **Given** mat-ucheniya post-migration, **When** the DM
   inspects the catalog, **Then** SRD items are visibly
   marked as "источник: SRD 5e" (or similar) so she can
   filter them out / in.
4. **Given** the seed runs and a name collision exists with
   a hand-created homebrew item, **When** the migration
   runs, **Then** the homebrew is preserved and the SRD
   item is created alongside (deterministic resolution
   rule is `plan.md`).
5. **Given** the seed has run once, **When** migration is
   re-run (in any plausible recovery scenario), **Then**
   it does not duplicate seeds (idempotent).

---

### User Story 7 — Spec-013 loot draft picks items from the catalog (Priority: P2)

The DM opens an encounter loot draft. The item-line input
has a typeahead (the same component as US3). She picks
«Кольцо Шёпотов петли» from the catalog. On apply, the
generated `kind='item'` transaction has both `item_name =
'Кольцо Шёпотов петли'` AND `item_node_id = <node id>`.
The encounter page's read-only loot summary, the player's
inventory tab, the item's history page — all three views
update consistently because they all read the same
underlying transaction with the same node link.

**Why this priority**: this is the spec-013 retrofit. It's
not a new wizard, just plumbing the typeahead into the
existing draft editor.

**Independent Test**: an encounter loot draft with one
catalog-linked item and one free-text item → on apply both
appear in the ledger; only the catalog-linked one shows up
on the item page's history.

**Acceptance Scenarios**:

1. **Given** an encounter loot draft, **When** DM types in
   the item line and picks a catalog item, **Then** the
   draft persists `item_node_id` alongside `item_name` and
   `qty`.
2. **Given** a draft with both linked and unlinked item
   lines, **When** apply runs, **Then** the produced
   transactions reflect the linkage per line.
3. **Given** the draft format extension, **When** the
   migration deploys, **Then** existing draft JSONB rows
   (which have no `item_node_id`) keep working — the field
   is optional and absent values are tolerated.

---

### Edge Cases

- **Item rename in the catalog (Образец edit).** DM renames
  «Длинный меч» → «Меч полуторный». **Decision** (FR-031):
  the transaction's `item_name` snapshot is preserved on
  the row; live displays read the **current** Образец title
  through the `item_node_id` join. Inventory tab, item
  history page, ledger feed all show the new name for
  linked rows; rows with `item_node_id = NULL` continue to
  display whatever string they originally captured. The
  edit form (FR-030) surfaces the linked-row count so the
  DM is aware before saving.
- **Item structured-field edit (price / category / rarity).**
  DM changes the canonical price of «Зелье лечения» from
  50 gp to 75 gp two months into the campaign. **Decision**:
  the change is global to all live displays. Past-loop
  inventory snapshots and item-history page entries will
  show the new price for any view that reads price live.
  Past coin-transactions (which captured the GP amount at
  the time of purchase) are unaffected — those are
  immutable money rows, not derived from the Образец's
  price field. This asymmetry is intentional: the price on
  the Образец is the **canonical reference**, not a
  per-transaction accounting field. If the DM wants to
  preserve "50 gp at the time" she leaves the original row
  intact (it already has its money snapshot); if she wants
  the catalog to say "75 gp" going forward, she edits the
  Образец.
- **Item delete with linked transactions.** DM deletes an
  Образец that is referenced by N transactions.
  **Decision** (FR-032): `on delete set null` — every
  linked row's `item_node_id` becomes NULL, the
  `item_name` snapshot survives. The row continues to
  appear in the ledger and aggregates as a free-text item.
  No transaction is destroyed, no count is altered.
- **Two items with the same name.** DM can create
  «Кольцо защиты» twice (homebrew variants). The catalog
  doesn't enforce title uniqueness (the existing node model
  doesn't); the typeahead in the transaction form must show
  both with disambiguating context (e.g. rarity / source).
- **Free-text row promoted to linked row.** DM realises a
  historical "странный камень" row should have been linked.
  Out of scope for the spec — spec-014's edit flow already
  lets DMs edit transactions; if the typeahead is in the
  edit form, the link can be added there. No bulk
  "promote-by-name" tool in spec-015.
- **Frontier moves backwards.** A DM enters a transaction
  with `day_in_loop = 9` on what was day-7 territory, then
  deletes it. No problem under the Q8 model — inventory at
  `(loop, day)` is a pure query of remaining transactions
  per FR-023; nothing is cached, nothing to invalidate.
- **Loop selector on a loop with no transactions.** DM
  switches inventory to «Петля 1» on a campaign that
  started in loop 2 (legacy data). **Decision** (FR-023b):
  empty state, hint "В этой петле не было операций с
  предметами". No error.
- **Future loops.** The loop picker MUST NOT offer loops
  beyond the campaign's current loop number (FR-023b).
  There is no inventory for a loop that hasn't started.
- **Future days within the current loop.** DM sets day = 30
  on day-7 campaign. **Decision** (FR-023): allowed.
  Inventory shows everything logged at days 1..30 — which
  is everything logged so far, since no rows exist after
  day 7. This is correct, not a bug. The day chip clearly
  reads «день 30» so the DM knows what slice she's looking
  at. If she wants to "pre-buy" a session-31 expense, she
  logs the transaction at day 30, sees the inventory
  update; transparent.
- **Inventory and wallet show different days.** **Decision**:
  allowed and intentional. The two views share a default
  helper (FR-023) so they OPEN at the same day, but the
  user can move them independently. There is no
  "synchronisation" requirement between them — each
  controls its own slider.
- **Catalog with thousands of items.** With SRD seed the
  catalog starts at ~400 items. Performance is a `plan.md`
  concern (pagination, virtualisation, indexed search).
  Spec-level guarantee: the catalog must remain usable at
  ~1000 items without page-level lag on the mat-ucheniya
  reference setup.
- **Player tries to write to an item node.** RLS blocks at
  the database layer; UI hides the affordances. Same
  pattern as the rest of the app.
- **An item is the receiver of a transaction.** Only PCs
  and stash are valid actors / counterparties on a
  transaction (spec-010 contract). Items appear as
  `item_node_id`, never as actor. This is a deliberate
  limit; "item gives item to PC" is not a thing.

---

## Requirements

### Functional Requirements

**Item nodes**

- **FR-001**: The system MUST introduce a node type
  `item` per campaign, seeded by migration. The type's
  `default_fields` MUST include the structured fields
  spec-015 needs (exact JSON schema is `plan.md`; the
  spec-level guarantee is "every catalog field that
  participates in filter / sort / group-by has a typed
  representation, not free-text in description").
- **FR-002**: The structured fields on an item node MUST
  cover at minimum:
  - **category** (slug ref to `categories(scope='item')`, see
    FR-004) — required;
  - **rarity** (enum, see FR-005) — optional, NULL for
    non-magical items;
  - **price in GP** (decimal) — optional;
  - **weight in lb** (decimal) — optional;
  - **slot** (slug ref to a campaign-configurable list, see
    FR-005a) — optional, NULL for items that don't occupy a
    body or hand slot (consumables, treasure, tools);
  - **source** (slug ref to a campaign-configurable list,
    see FR-005b) — optional;
  - **availability** (slug ref to a campaign-configurable
    list, see FR-005c) — optional;
  - **srd_slug** (text, English, lowercase-kebab) —
    optional, present on every SRD-seeded item, NULL on
    homebrew. Used as a backfill key (FR-027) and as a
    typeahead alias when a DM types in English.
  - **description** (markdown text) — optional. Name is
    `nodes.title` (Russian by convention for SRD seeds; DM
    chooses for homebrew).

  Storage (Q1 resolved): **hybrid**. Hot fields (category,
  rarity, price_gp, weight_lb, slot, source, availability)
  live as typed columns on a side table or as
  type-specific columns on `nodes` — exact placement
  `plan.md`. Cold fields (`srd_slug`, source detail beyond
  the slug, description) live in `nodes.fields` JSONB.
- **FR-003**: Item nodes MUST be writable by DM only and
  readable by all members of the campaign. RLS at the
  database layer enforces this; UI hides write affordances
  for non-DM users.
- **FR-004**: The category field MUST be backed by
  `categories(scope='item')` (Q2 resolved). Per-campaign
  seed list (8–10 categories — weapon, armor, consumable,
  magic-item, wondrous, tool, treasure, misc; exact list
  `plan.md`). DM MUST be able to add new categories per
  campaign for homebrew needs through the existing
  categories settings UI (extended to include item scope).
  Each row carries `slug` (en, stable id) and `label` (ru,
  display).
- **FR-005**: The rarity field MUST be one of: common,
  uncommon, rare, very-rare, legendary, artifact (the
  standard 5e ladder). Empty / NULL rarity is valid for
  non-magical items. Rarity is a **closed enum** (not
  DM-configurable), unlike category / slot / source /
  availability — the 5e ladder is canonical.
- **FR-005a**: The slot field MUST be backed by a
  campaign-configurable value list (mechanism analogous to
  `categories(scope='item')` — exact table choice
  `plan.md`: extend `categories` with a new scope, or new
  table `item_slots`). Per-campaign seed list MUST cover at
  minimum: `ring`, `cloak`, `amulet`, `boots`, `gloves`,
  `headwear`, `belt`, `body` (armor / robe), `shield`,
  `1-handed`, `2-handed`, `versatile`, `ranged`. Each row
  carries slug (en) + label (ru) + sort_order. NULL slot
  means "doesn't occupy a slot" (consumables, treasure,
  tools).
- **FR-005b**: The source field MUST be backed by a
  campaign-configurable value list (same mechanism as
  FR-005a). Per-campaign seed list MUST cover at minimum:
  `srd-5e` (label «SRD 5e»), `homebrew` (label «Хоумбрю»).
  DM adds further sources as needed (Tasha's, Xanathar's,
  third-party, etc.). Each row carries slug (en) + label
  (ru) + sort_order. SRD seed (FR-027(b)) populates the
  `source` field with `srd-5e` for every seeded item.
- **FR-005c**: The availability field MUST be backed by a
  campaign-configurable value list (same mechanism as
  FR-005a, FR-005b). Per-campaign seed list MUST cover at
  minimum: `for-sale` (label «свободно купить»), `quest`
  (label «квестовый»), `unique` (label «уникум»),
  `starter` (label «стартовый»). Each row carries slug
  (en) + label (ru) + sort_order. DM adds further values
  as needed.
- **FR-005d**: The settings page for value lists (`item`
  category, `item-slot`, `item-source`,
  `item-availability`) MUST be reachable from the campaign
  settings nav. Layout `plan.md` — likely a single page
  with four tabs / sections, mirroring the existing
  `/accounting/settings/categories` UX. DM can add, rename,
  reorder, and (with a confirm) delete values; deletion of
  a value referenced by item nodes MUST either block or
  cascade-set-null on those nodes (exact behaviour
  `plan.md`).

**Catalog UI**

- **FR-006**: The catalog MUST be reachable from the main
  navigation as a top-level tab (e.g. «Предметы» under the
  campaign menu) AND as a sub-section of the existing
  catalog (spec-001) filtered by `type='item'` — both URLs
  must work, both must render the same data with the same
  affordances.
- **FR-007**: The catalog MUST render as a tabular list
  with a column per structured field: name, category,
  rarity, slot, price, weight, source, availability.
  Description is shown on row expand or on the item page,
  not inline in the table (too long for a row).
- **FR-008**: The catalog MUST support **group-by** with at
  least these grouping keys: category, rarity, slot, price
  band (free / cheap / mid / expensive / priceless — bands
  defined in `plan.md`), source, availability. Group-by is
  a UI control, not a URL filter; switching groupings does
  not refetch.
- **FR-009**: The catalog MUST support **filtering** by
  any field listed in FR-007 plus a free-text name search.
  Filters MUST be URL-driven (analogous to the ledger
  filter bar, chat 43) so that a filtered view is
  shareable / bookmarkable. Active filters render as
  removable chips.
- **FR-010**: The catalog MUST support **sorting** by name,
  price, weight, rarity (in standard 5e rarity order, not
  alphabetical). Default sort `plan.md`.
- **FR-011**: The catalog MUST support an **empty state**
  (no items at all, or no items match the current filter)
  and render a helpful prompt for both states.
- **FR-012**: The catalog MUST handle ≥ 1000 items without
  needing manual pagination affordances visible to the user
  (whether this is virtualisation, infinite scroll, or
  page-N is `plan.md`).

**Transactions ↔ catalog link**

- **FR-013**: The `transactions` table MUST gain a column
  `item_node_id uuid references nodes(id) on delete set
  null`. The column MUST be NULL for non-item rows
  (`kind != 'item'`) — enforced by check constraint or by
  application code; mechanism `plan.md`.
- **FR-014**: When an item-transaction is created with
  `item_node_id` set, the row's `item_name` MUST be a
  snapshot of the item's title at write time. This makes
  historical rows resilient to item renames at the storage
  layer; the rendering layer reads the live name through
  the join.
- **FR-015**: Existing item-transactions (rows with
  `kind='item'` already in the database at migration time)
  MUST be back-compat: they can have `item_node_id = NULL`
  and continue to render based on `item_name` only.
  Migration MUST NOT delete or invalidate any existing row.
- **FR-016**: The transaction form's item-name input MUST
  become a **catalog typeahead**. As the user types, the
  dropdown MUST show:
  - matching item nodes (top of list, ranked by name match
    quality — exact prefix > exact substring > fuzzy);
  - a "+ Создать «<typed>»" affordance for DM users only
    at the bottom (creates the item node inline, see
    FR-017);
  - a "(не найдено — оставить как текст)" non-action hint
    for player users.
  Picking a node fills `item_node_id` + `item_name`. Typing
  freely without picking submits `item_name` only.
- **FR-017**: DM MAY create a new item node from the
  typeahead inline (a quick-create dialog with name +
  category + rarity, full edit deferred to the catalog
  page). This affordance MUST NOT exist for players. Player
  free-text submissions are accepted but not promoted to
  nodes.
- **FR-018**: The encounter-loot draft (spec-013) MUST
  accept `item_node_id` per item line. On apply, the
  resulting transactions MUST carry the link. Existing
  drafts (with no `item_node_id`) MUST keep working.
- **FR-019**: The pending-transaction queue (spec-014) MUST
  preserve `item_node_id` through the pending → approved
  state transition. DM-edit-on-approval MUST be able to
  add or change the item link.

**Inventory views**

- **FR-020**: The PC page MUST gain an «Предметы» tab next
  to the existing wallet block. The tab MUST render the
  PC's current-loop inventory aggregated by item: one row
  per distinct item (linked items aggregate by node id;
  free-text items aggregate by name). Columns and grouping
  are governed by FR-008/009/010 (same component as the
  catalog).
- **FR-021**: The stash page MUST render the same
  inventory tab — the existing `<InventoryGrid>` (spec-011
  / chat 42) is upgraded to use the new aggregation rules.
  Same component, no fork.
- **FR-022**: Inventory views MUST be read-only. Changes to
  inventory are made through ledger transactions, never by
  editing the inventory directly.
- **FR-023**: Inventory views MUST be a **query parameterised
  by `(loop, day)`**, not a gated default. Specifically (Q8
  resolved):
  - Inventory at `(loop, day)` = sum of signed `item_qty`
    over all approved item-transactions matching
    `loop_number = loop AND day_in_loop ≤ day` for the
    actor; rows with net qty ≤ 0 MUST NOT appear (collected
    and lost in the same slice = absent).
  - The day picker (slider, dropdown, or input — `plan.md`
    chooses) MUST allow selecting any `day_in_loop` from 1
    to the campaign's loop length. **The picker MUST NOT
    block or guard** — DM and player MAY view inventory at
    day 30 even if the party has only played up to day 7.
    Inventory at "future" days simply renders whatever
    transactions happen to have been logged at those days
    (typically nothing); this is correct, not a bug.
  - **Default value** for the day picker on first render
    MUST be a sensible "where the actor stopped in time" —
    the same default helper the spec-010 transaction form
    already uses (`computeDefaultDayForTx`: latest tx →
    frontier → 1). The PC inventory tab and the PC wallet
    block MUST share this default helper so they open with
    the same day; the user is then free to move either one
    independently.
  - **Default value** for the loop picker is the campaign's
    current loop, read from the same source the wallet uses.
  - Once the user picks a day, the URL MUST encode it (e.g.
    `?loop=4&day=15`) so the view is shareable / bookmarkable.
- **FR-023a**: The chosen `(loop, day)` MUST be **clearly
  legible** in the inventory tab UI — a subtitle / day chip
  reading «Петля 4 · день 15» (or «Петля 3 · итог» when day
  = loop length and loop < current). Visibility is the
  primary affordance from Q8 — the DM trusts the
  presentation as long as the day is unambiguous on screen.
- **FR-023b**: The loop picker MUST NOT offer loops beyond
  the campaign's current loop (no future loops; constitution
  I — those loops haven't happened). Past loops MUST be
  selectable; past loops with no transactions MUST render
  an empty state ("В этой петле не было операций с
  предметами") rather than an error.

**Item page**

- **FR-024**: Each item node MUST have a permalink at a
  predictable URL (e.g. `/c/[slug]/items/[id]` OR
  `/c/[slug]/catalog/[id]` — exact path `plan.md`,
  consistent with the existing entity-catalog URL pattern).
- **FR-025**: The item page MUST render the structured
  fields (FR-002) at the top, the description (markdown)
  below, and a **«История»** section listing every
  transaction with this `item_node_id` in chronological
  order (loop ascending → day_in_loop ascending →
  created_at ascending).
- **FR-026**: Each history entry MUST be a clickable link
  to the ledger view filtered to the source transaction
  (analogous to the autogen badge link from spec-012).

**Migration & seeding**

- **FR-027**: A migration MUST: (a) seed the `item`
  node type per campaign; (b) seed the SRD item set per
  campaign (Q3 below — scope `plan.md`); (c) add the
  `item_node_id` column to `transactions`; (d) backfill
  existing item-transactions whose `item_name` exact-
  matches an SRD entry (Q4 — strict only, no fuzzy).
- **FR-028**: The migration MUST be idempotent: running
  it twice MUST NOT duplicate seeded items, MUST NOT
  re-link transactions that were manually relinked
  between runs, and MUST NOT break existing rows.
- **FR-029**: The migration MUST log (in stdout or a
  reporting table) the count of: SRD items seeded per
  campaign, item-transactions backfilled per campaign,
  item-transactions left unlinked per campaign. This is
  not a UI feature — it's an operational verification
  step like spec-013's smoke scripts.

**Образец (item template) edit semantics**

- **FR-030**: Editing the structured fields of an existing
  item node (the Образец) MUST be a deliberate, friction-
  bearing DM action — not a casual inline edit. The exact
  shape is `plan.md`, but the spec-level guarantee is:
  - The edit form MUST be reachable only from the item
    page (FR-024), not from the catalog grid row, not from
    the typeahead, not from the transaction row.
  - The edit form MUST surface, before save, the **scope
    of the change**: the count of transactions currently
    linked to this Образец, with a non-blocking note that
    historical rows already preserve their `item_name`
    snapshot (FR-014) but their displayed category /
    rarity / price WILL change in views that read those
    fields live through the join.
  - DM MAY proceed without further confirmation; this is
    not a two-phase confirm dialog like spec-012's. The
    point is to make the change **legible**, not to gate
    it.
- **FR-031**: Renaming an Образец MUST be allowed and MUST
  preserve historical transaction display. Concretely: the
  ledger row's inline name SHOULD render the **current**
  Образец title (live read through `item_node_id`); the
  `transactions.item_name` snapshot is the fallback for
  display when `item_node_id` is NULL OR the Образец has
  been deleted. Whether the ledger ever shows the snapshot
  alongside the current title (e.g. "Меч полуторный
  (originally Длинный меч)") is a `plan.md` UX call.
- **FR-032**: Deleting an Образец MUST set `item_node_id`
  to NULL on every linked transaction (`on delete set
  null`, FR-013), preserving the row via the `item_name`
  snapshot. This is destructive only at the catalog level —
  the ledger continues to render the row as a free-text
  item. DM MAY recreate an Образец with the same name
  later; existing rows will not auto-relink (the link is
  by id, not by name). Bulk relinking is out of scope per
  Out of Scope.

### Non-Functional / Performance

- **NFR-001**: Catalog load time at 500 items (mat-ucheniya
  scale post-seed) MUST be < 500 ms TTFB on the existing
  Vercel + Supabase setup.
- **NFR-002**: The typeahead in the transaction form MUST
  return suggestions within 100 ms for a 5-char query at
  500-item catalog scale.
- **NFR-003**: Inventory aggregation MUST scale to
  ~1000 transactions per PC per loop without measurable
  lag (currently mat-ucheniya is well under that).
- **NFR-004**: All new database queries MUST be RLS-
  guarded; the catalog is per-campaign and item nodes
  inherit the existing per-campaign RLS on `nodes`.

### Constitution Compliance

- **I. Loop progression core**: inventory views default to
  current-loop aggregation (FR-023). Cross-loop view is a
  selector, not the default — same pattern as the wallet.
- **II. Atomic data**: items are nodes, structured fields
  on the node, edges available for future use (the catalog
  is a flat list — no hierarchy in data, only in the
  group-by view per III-b).
- **III. Cross-references**: items link from transactions
  by FK; the item page is a real permalink; future edges
  (item → location, item → quest) work without further
  schema work.
- **III-b. Flat navigation, grouping as lens**: the catalog
  is a flat node list with configurable group-by — the
  exact pattern III-b mandates. No hierarchical "category
  tree" in the data.
- **IV. Data first, UI as lens**: item nodes are
  first-class data; the catalog, the inventory tab, the
  item page are three lenses on the same data; export to
  JSON/CSV works through the existing node-export path.
- **V. Event sourcing**: inventory state = aggregate of
  signed `item_qty` over transactions, not a separate
  inventory table. Same model as the wallet.
- **VI. Reader, not dashboard**: the catalog and item page
  are reading surfaces; the only write affordance for
  players is the typeahead in the transaction form (which
  is technically a write to `transactions`, not to items).
- **VII. Each release is playable**: catalog + autofill
  alone is shippable value (US1+US2+US3); SRD seed
  (US6) and inventory tab (US4) layer on top.
- **VIII. Stack simplicity**: no new tables for items
  (uses `nodes`); no new ORM; no new UI library.
- **IX. Universality**: SRD seed is generic and runs per
  campaign; nothing mat-ucheniya-specific is hard-coded.

---

## Out of Scope

- **Location inventory.** Items physically residing in
  non-actor places (a chest in a dungeon room, a shelf in
  a shop, a hidden cache). Tracked in IDEA-054, deprioritised
  per chat 51 — DM judgement is "probably won't matter".
  Spec-015 deliberately ships nothing toward
  `item_location_node_id` or "loot a location".
- **Spell-as-item.** Spells are not items in this spec.
  IDEA-029 (spells + slots) is its own future spec; whether
  spellbooks become items at the catalog level is left
  open.
- **Item identification mechanics.** "Unidentified magic
  item — players see «странный кулон», DM sees «Кулон
  правды»". Out of scope; no UI for hiding structured
  fields from players. Workaround: DM creates a
  «странный кулон» free-text row and links to the real
  catalog node later when identified.
- **Currency conversion at write time.** The transaction
  form's coin denomination shape is unchanged; price on the
  item is informational autofill, not enforced.
- **Item attunement / equipped state.** Whether a magical
  item is currently attuned, equipped, or in storage is
  not tracked in spec-015. This was part of IDEA-054
  (`item_carried_state`) — also deprioritised.
- **Item charges / consumable counters.** "Wand has 7
  charges remaining". Out of scope; tracked as separate
  item-transaction rows or in description text per DM
  preference.
- **Item-to-item edges in the catalog.** "Kit of three"
  (gear set), "consumes" (this scroll uses this reagent),
  "evolves into" (this potion is an upgrade of that one).
  Possible later via the existing edge mechanism, but no
  spec-015 UI for it.
- **Marketplace / shop simulation.** "Browse what's for
  sale at this shop, click to buy". Out of scope. The
  availability field is a metadata note, not a transaction
  origin. A separate future spec (likely after the location
  graph epic) could build a shop UI on top.
- **Item search across campaigns.** Each campaign has its
  own item nodes (seeded independently from SRD). Cross-
  campaign item library is out of scope.
- **Bulk import from external sources** beyond SRD. CSV
  import, dnd.su scraper, D&D Beyond integration. Out of
  scope; SRD seed is the only import path.
- **Item versioning / homebrew variants tracking.** "Sword
  of Light v2 — buffed in patch 3". DM duplicates the item
  manually if she wants; no first-class variant mechanism.
- **Bulk relinking of historical free-text items.** Beyond
  the migration's exact-match backfill, there is no
  "promote all 'longsword' rows to the canonical Longsword
  item" tool. DM does this transaction by transaction
  through the edit form (spec-014) if she cares.

---

## Success Criteria

- **SC-001**: A DM can create a new homebrew item from
  scratch in ≤ 30 seconds (open catalog → press +Предмет →
  fill form → save). Verifiable by walking through US1.
- **SC-002**: A DM logs an SRD item transaction without
  retyping price or weight — the typeahead and autofill
  reduce keystrokes to (item picker + qty + actor +
  submit). Verifiable by walking through US3.
- **SC-003**: A player opens her PC inventory tab and sees
  a structured table of her items with category / rarity /
  qty / value, grouped by category by default, in ≤ 2
  clicks from the home page. Verifiable by walking through
  US4.
- **SC-004**: An item's history page lists every
  transaction touching that item across all loops, in
  chronological order, with PC names resolved. Verifiable
  by walking through US5.
- **SC-005**: After migration, the mat-ucheniya catalog has
  ≥ 300 SRD items present and ≥ N existing item-
  transactions backfilled (N measured pre-migration in a
  plan.md task). No existing transaction is broken.
- **SC-006**: At 500 items in the catalog, the catalog
  page loads under 500 ms TTFB and the typeahead returns
  results under 100 ms (NFR-001 / NFR-002).
- **SC-007**: An encounter loot apply (spec-013) with one
  catalog-linked item produces a transaction with
  `item_node_id` correctly set; the item appears on the
  recipient's inventory tab and on the item's history.
  Verifiable by re-running spec-013 acceptance scenarios
  with a catalog item.
- **SC-008**: When opened with no URL params, the PC
  inventory tab and the PC wallet block default to the
  **same** loop and day (computed from the same
  `computeDefaultDayForTx` helper or successor). Verifiable:
  open both on the same PC; subtitles match. After opening,
  each control moves independently; this is intentional,
  not a desync.
- **SC-009**: Switching the inventory loop or day picker
  re-renders the inventory as a pure read; no transactions
  are mutated, no rows are inserted. Verifiable by
  inspecting `transactions` rows before and after picker
  changes (counts, ids, contents identical).
- **SC-010**: Editing an Образец's name or category from
  the item page surfaces the count of linked transactions
  and updates the displayed name on every linked ledger
  row, inventory row, and history entry on the next read.
  Verifiable by editing a node with ≥ 2 linked rows and
  inspecting all three views.
- **SC-011**: The day picker on the inventory tab accepts
  any day from 1 to the loop length without blocking,
  warning, or reordering. Verifiable: scrub to day 30 on a
  loop where the campaign is on day 7; the inventory
  renders without any error and the day chip clearly
  reads «день 30».

---

## Clarifications

(Resolved 2026-04-26 in chat 54.)

### Q1: How are item structured fields stored?

**Answer: C — hybrid.** Hot fields (category, rarity,
price_gp, weight_lb, slot, source, availability) live as
typed columns on a side table or as type-specific columns
on `nodes` — placement is a `plan.md` concern, but they
are typed columns either way, indexable, fast to filter /
sort / group. Cold fields (`srd_slug`, source detail
beyond the slug, description markdown) live in
`nodes.fields` JSONB.

Rationale: pure JSONB (option A) is the lazy answer — the
catalog-grid filter UX would feel sluggish at ~500 items
with multi-field filters compounding through `->>` JSONB
operators. Pure side-table (option B) is the over-eager
answer — too much migration work for fields the spec
genuinely doesn't filter on. The hybrid model lets us
index the seven fields the catalog grid actively filters
by, keeps the long tail (description, free-form source
detail) where it belongs (JSONB), and has a clean
extension path: any field that turns out to need
filtering later can be promoted from JSONB to a typed
column with a one-line ALTER TABLE.

Plan.md will decide whether the typed columns live on
`nodes` directly (gated by `type='item'` so they are
NULL for other node types) or on a side table
`item_attributes(node_id PK, …)`. Both are viable; the
side-table is cleaner schema, the on-`nodes` placement
is fewer joins. Plan picks based on the existing
codebase's pattern.

### Q2: TECH-011 — categories storage

**Answer: A — `categories(scope='item')`.** Use the
existing `categories` table that was reserved for
spec-015 from the start. Item nodes carry a
`category_slug` column (or JSONB field, depending on Q1
final placement) that references
`categories(campaign_id, slug)` where `scope='item'`.

This resolves TECH-011 as **"keep"** — both transaction
and item categories live in the same table, scope-
discriminated. The rationale: categories are a closed,
DM-curated set (8–10 values typically), which is exactly
what `categories` is designed for. Tags-on-nodes (option
B) would over-flexibilise an axis the DM doesn't actually
want to be free-form: weapon, armor, consumable, etc.
are well-known buckets, not a folksonomy. Tag-style
freedom on a different axis (e.g. mat-ucheniya-specific
keywords like "загадка", "запрещено в академии") can be
added later as a separate JSONB tag list without
disrupting categories.

Settings UI for item categories MUST be reachable from
the same surface as transaction categories (FR-005d).

### Q3: SRD seed scope

**Answer: A — all SRD items, ~400 total per campaign.**
Both mundane (longsword, rope, rations, plate armor,
arrows, …) and magical (potion of healing, +1 weapons,
common rings, the standard magic-item set up to
artifact). Each seeded item carries:

- `srd_slug` (English, kebab-case, stable) — used as the
  backfill key (Q4) and as a typeahead alias when DMs
  type in English. Examples: `longsword`,
  `potion-of-healing`, `ring-of-protection`.
- `nodes.title` (Russian) — display label. Examples:
  «Длинный меч», «Зелье лечения», «Кольцо защиты».
- `source = 'srd-5e'` (the SRD source slug seeded by
  FR-005b).

The SRD seed runs per-campaign (idempotent — running
twice is a no-op via slug-based UPSERT). Existing
campaigns get the seed on migration deploy; new
campaigns get it as part of campaign initialisation.

Rationale: spec-015's main value-proposition is
typeahead autofill of price/weight when logging
transactions. That value only materialises when mundane
items are in the catalog — DMs log "100 ft верёвки"
constantly. Magical-only (option B) would deliver only
half the value. DM-toggle (option C) is a reasonable
fallback if the seed turns out to clutter the UI, but
the filter affordances (FR-008/009) and the "источник:
SRD 5e" tag (FR-005b) already let DMs hide SRD when
they want to focus on homebrew — clutter risk is low.

The English srd_slug + Russian title pair is the
deliberate model: English provides a stable migration /
backfill / API key that survives translation choices;
Russian provides the in-game display the table actually
uses.

### Q4: Backfill strategy

**Answer: B — strict by `title` OR `srd_slug`.** The
migration backfills `transactions.item_node_id` for any
existing item-transaction whose `LOWER(TRIM(item_name))`
matches either the `LOWER(TRIM(seed.title))` OR the
`LOWER(seed.srd_slug)` of any seeded item in the same
campaign. Both lookups are exact, no fuzzy matching.

Rationale: Q3's English+Russian model means existing
transactions in the database may have either form
(`Длинный меч`, `Longsword`, `longsword`). Strict
matching on both fields covers all three forms with zero
false-positive risk — both keys are unique within the
SRD seed. Fuzzy matching (option D) was rejected as
risky: «длинный лук» fuzz-matching to «длинный меч» is
exactly the kind of silent miscategorisation that gets
discovered three sessions later.

Strict-with-report (option C) was considered and not
chosen: the diagnostic value of an "unmatched rows"
report is high, but it's a one-shot operational concern
that doesn't need to ship with the migration. If
post-deploy verification shows lots of unmatched legacy
rows, a follow-up SQL script can produce the report on
demand. FR-029 already mandates per-campaign counts of
seeded / backfilled / unlinked rows in the migration
output, which is sufficient operational telemetry.

### Q5: Availability field shape

**Answer: A + DM-configurable per-campaign value list.**
The `availability` field on an item is a slug reference
to a campaign-configurable list (FR-005c). Default
seeded values: `for-sale` («свободно купить»), `quest`
(«квестовый»), `unique` («уникум»), `starter`
(«стартовый»). DM extends the list per campaign as
homebrew needs arise.

Each value carries `slug` (en, stable) + `label` (ru,
display) + `sort_order`. The same pattern (FR-005a/b/c)
applies to `slot` and `source` value lists — three
independent campaign-configurable enums, all reachable
from the same settings page (FR-005d).

Rationale: the user's clarification "вынести в
настройки кампейна все источники, id + русская локаль"
made it clear that availability is not a hardcoded enum
(option A in original Q5) but DM-curated like
categories. The slug+label structure is the same one
already established for categories in spec-010, so the
infrastructure mostly exists. Free text (option B in
original Q5) was rejected — DMs want to filter "show me
everything свободно купить", which requires a
controlled vocabulary. Node-refs (option C in original
Q5) was rejected for spec-015 — that's location-
inventory territory and we deliberately deprioritised
locations (chat 51).

### Q6: Catalog URL + slot field requirement

**Answer: A — `/c/[slug]/items` is primary, with
`/catalog?type=item` working as alias.** Plus, the user's
clarification added a new requirement: the **slot** field
on item nodes (FR-005a). Slot is for items that occupy a
body or hand position — ring, cloak, amulet, boots,
gloves, headwear, belt, body armor, shield, 1-handed,
2-handed, versatile, ranged. Non-equippable items
(consumables, treasure, tools) leave it NULL.

Slot is treated like category, source, availability — a
DM-configurable value list per campaign (FR-005a). Default
seeded values from the 5e standard equipment slots.
Filterable, group-able, sortable in the catalog grid
(FR-007/008/009). Visible as a column in the inventory
tab (US4) so a player or DM can answer "что у меня на
плаще / в руках / на пальцах" at a glance.

URL choice rationale: `/items` as primary makes the
catalog a first-class destination with item-specific UX
(rarity ladder ordering, price-band groupings,
slot/category-aware columns). The generic `/catalog`
route from spec-001 stays as a flat all-types list with
a type filter; it redirects to `/items` when type=item.

### Q7: Item history coexistence

**Answer: A — linked rows only.** The item page's
«История» section shows transactions with
`item_node_id = this.id`, period. Free-text rows with
matching `item_name` but no node link are NOT included.

Rationale: after the FR-027 migration backfill (Q4=B),
the vast majority of legitimate matches are already
linked. Remaining unlinked rows are typically typos,
ad-hoc DM scribbles, or genuinely different items that
happen to share a name — none of which the item page
should claim are "this item's history". Mixing trust
levels (option B) introduces silent confusion; a
separate audit tool (option C) is overkill for this
spec.

If the DM later notices a free-text row that should be
linked, the spec-014 edit form lets her relink it — the
typeahead in that form (FR-016) gives her the catalog
to pick from. Bulk relinking is explicitly out of scope
(see § Out of Scope).

### Q8: Day frontier resolver — replaced by transparent picker

**Answer: not A/B/C. The day is a UI control, not a
computed frontier.** The user's clarification "как-то
надо проще все, выбирать день, как мы договаривались,
ничего не блочить, хоть 30й ты ставь и там закупайся,
главное прозрачность для ДМа" reframed the question:
the inventory's `(loop, day)` slice is parameterised by
**user-chosen** values, not by a per-actor or
campaign-wide computation.

Resolution (encoded in FR-023, re-pinned in § Context
point 4):

- The day picker accepts any value 1..loop_length and
  blocks nothing. A DM can scrub to day 30 on a day-7
  campaign and the inventory renders whatever happens to
  be logged at days 1..30 — typically the same items as
  day 7, with no warning.
- The default day on first render is the existing
  `computeDefaultDayForTx` helper (latest tx → loop
  frontier → 1) — the same default the transaction form
  already uses. This means the inventory tab and the
  wallet block open at the same day **on first render
  only** (SC-008); after that, the user is free to move
  each control independently — no enforced
  synchronisation.
- The chosen `(loop, day)` is encoded in the URL and
  always clearly visible on screen («Петля 4 · день 7»).
  This is the "прозрачность для ДМа" requirement: the
  picker is transparent, not policed.
- The loop picker still excludes future loops (FR-023b
  — those haven't happened, constitution I).

Rationale: all three original options (A strict
per-actor, B campaign-wide, C per-actor + fallback)
assumed frontier was a security gate that had to be
**computed correctly**. The user's framing made the
question moot: there is no computation to argue about
because there is no gate. The picker is a tool. The DM
is competent. The on-screen day chip is the
transparency. This is meaningfully simpler than any of
A/B/C and avoids a category of bug entirely (frontier
disagreement, frontier-moves-backwards-mid-action,
"why doesn't this PC see what the others see").

The wallet block in production today probably uses a
similar transparent-picker model (it has a day chip in
the form); plan.md will verify and align the inventory
tab to use the same default helper for consistency, but
no behavioural change to the wallet is needed.

---

**End of spec.md.** All eight clarifications resolved.
Status: **Clarified**. Next phase: **Plan**.
