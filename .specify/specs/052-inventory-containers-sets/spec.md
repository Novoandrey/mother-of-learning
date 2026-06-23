# Feature Specification: Inventory — containers, buying, sets & equipped state

**Feature Branch**: `052-inventory-containers-sets`
**Created**: 2026-06-23 (chat 95)
**Status**: Specify draft — awaiting Clarify
**Depends on**: spec-044 (mobile ledger — wallet, item transfers, общак,
starter-equip; this inventory UI extends 044's `/tg` screens and its holdings
reader / transfer sheet), item catalog (spec-015/018) + default prices
(spec-016), общак (spec-017), the event-sourced ledger (specs 009–019;
`transactions` in migration 034 — balances are `SUM()`-derived, never stored).
**Relationship to the RPG-engine epic**
(`.specify/epics/rpg-engine/constitution.md`): this is an **economy / ledger-side**
feature, **not** an engine feature. It stores inventory *state* — holdings,
an equipped flag, player-authored sets — with **no** stat or effect
computation. The engine (spec-045, items-as-modules) may later *read* the
equipped flag to apply item effects, but effect application is explicitly OUT
of scope here. Whether "equipped" should live in the very store the engine
will consume is an open question (C-07).
**Input**: Andrey (chat 95): «функцию передачи/забора лучше задизайнить как
контейнеры в РПГ-играх; покупка за голду; механика "наборов" (набор мага /
набор чародея) — игроки сами делают наборы и покупают их одной кнопкой;
статус "Надето" на персонаже — по сути более полноценный инвентарь. Бэкенд
бухгалтерии при этом особо не трогает».

## Context

spec-044 shipped a thin item layer: items move PC↔PC and PC↔общак as ledger
item-transactions, holdings are the net of approved item rows for a node, and
the starter screen lets a player assemble a one-off list. What is missing is a
first-class **inventory** — there is no screen that shows everything a PC
holds, no way to **buy** a catalog item for its gold price, no notion of
**equipped**, and moving items is a one-shot "transfer" form rather than the
container-to-container interaction RPG players expect (drag a sword from your
pack into the party stash).

This spec layers a fuller inventory on top **without restructuring the
accounting backend**. Item moves stay item-transactions; a purchase is a
gold-out plus an item-in expressed in the existing ledger; the общак and every
PC are already nodes that hold items, so the "container" already exists in the
data — the work is mostly UX plus a small new layer. The genuinely new data is
modest: an **equipped** flag per (PC, item) and a player-authored **set** (a
named bundle of catalog items, bought in one tap).

Builds on existing assets: spec-044's `getPcItemHoldingsTg` /
`getStashItemHoldingsTg` readers, `createItemTransfer` / `putItemIntoStash` /
`takeItemFromStash` actions, the 844-item canon catalog (spec-018) with
default prices (spec-016), and the `transactions` ledger (money + item kinds,
`transfer_group_id` linkage, auto-approval policy).

## Scope

**In (P1) — containers & moves:** a per-PC **inventory** screen (everything
held this loop, with quantities); moving items between containers — own
inventory ↔ общак, own inventory → another PC — via a container-style picker
(source container → destination container → item → qty) that replaces the
one-shot transfer form; availability-capped pickers sourced from real
holdings; moves recorded as the existing item-transactions under the existing
auto-approval policy.

**In (P2) — buying & equipped:** **buy a catalog item for gold** (gold-out +
item-in, expressed in the existing ledger); price from the catalog;
affordability check; **equipped/Надето** state per PC with equip/un-equip,
shown in the inventory, carrying no mechanical effect.

**In (P3) — sets:** player-authored **sets** (named bundles of catalog items
+ qty); create / edit / delete; **buy a whole set in one action** (gold-out
for the total + all items in, as one batch); sets are campaign-scoped
templates (copy-on-buy).

**Out:** item *effects* / stats from equipped gear (engine — spec-045+);
nested containers / bags / weight & encumbrance; selling items back for gold,
vendor/shop entities, currencies beyond the existing coin set; desktop UI
parity (v1 is Mini-App-first — desktop keeps its current transfer/stash UI);
xlsx inventory import; any change to how balances are computed.

## Epic / platform note

All new surfaces live in the **Telegram Mini App** (`/tg`), extending
spec-044 — same auth (real GoTrue session from 046), same readers, same coin
model. The data model is platform-agnostic; a later spec may bring parity to
the desktop app. (C-09.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Container inventory & item moves (Priority: P1)

A player opens their PC and sees a full **inventory** — everything the PC
holds this loop with quantities. To move things around they pick a source
container and a destination container (own inventory, the party общак, another
PC) and move an item between them, choosing from what the source actually
holds — instead of filling a one-off "transfer" form.

**Why this priority**: item management is the everyday inventory action, and
the container redesign is the first thing Andrey asked to fix. It subsumes
spec-044's item-stash UI and is the foundation the buy / set / equip stories
sit on.

**Independent Test**: with seeded holdings, move an item from inventory →
общак and back; holdings update on both sides and ledger rows are created. No
buying, sets, or equipping required.

**Acceptance Scenarios**:

1. **Given** a PC holds 2 «Длинный меч», **When** the player moves 1 to the
   общак, **Then** the PC shows 1 and the общак shows 1, recorded as
   item-transactions, with balances unchanged.
2. **Given** the общак holds some items, **When** the player opens "взять",
   **Then** only items the общак actually holds are offered, each capped at
   its available quantity.
3. **Given** the player picks another PC as the destination, **When** they
   move an item, **Then** it follows the existing approval policy (auto vs
   queued — C-01).

---

### User Story 2 — Buy a catalog item for gold (Priority: P2)

A player with gold buys a catalog item at its price: pick the item, a
quantity, confirm — gold leaves their wallet and the item enters their
inventory.

**Why this priority**: a concrete new capability (a structured purchase versus
today's free-text expense), and the prerequisite for sets.

**Independent Test**: give a PC 100 gp, buy a 50-gp catalog item; wallet shows
−50 and inventory +1. No sets or equipping required.

**Acceptance Scenarios**:

1. **Given** a PC has 100 gp and an item costs 15 gp, **When** the player buys
   ×2, **Then** the wallet decreases by 30 gp and the inventory gains 2,
   expressed as linked money + item rows (C-02).
2. **Given** a PC has 10 gp and an item costs 15 gp, **When** the player tries
   to buy, **Then** the purchase is refused with a clear "недостаточно золота"
   message (unless C-01 permits credit / partial).
3. **Given** an item has no catalog price, **When** the player opens buy,
   **Then** that item is not offered for purchase (it can still be moved).

---

### User Story 3 — Equipped status (Priority: P2)

A player marks gear as **Надето** on their PC and can un-equip it; the
inventory visibly distinguishes equipped from carried.

**Why this priority**: part of the "fuller inventory" Andrey described;
standalone and low-risk; lets the engine read equipment later.

**Independent Test**: equip an item, reload, it is still equipped (within the
loop); balances and holdings are unchanged.

**Acceptance Scenarios**:

1. **Given** a PC holds armor, **When** the player taps «Надеть», **Then** the
   item shows as equipped and stays so after reload (persistence / loop scope —
   C-04).
2. **Given** an equipped item, **When** the player un-equips it, **Then** it
   returns to carried.
3. **Given** any equip / un-equip, **When** it happens, **Then** no balance or
   holding changes — it is metadata only.

---

### User Story 4 — Sets / bundles (Priority: P3)

A player creates «Набор мага» — a list of catalog items with quantities — and
any player buys the whole set in one tap, paying the total and receiving all
items.

**Why this priority**: convenience layered on buying; depends on US2;
highest-effort and most deferrable.

**Independent Test**: create a 3-item set, buy it with a funded PC; total gold
out and all items in. Editing the set afterward does not change the past
purchase.

**Acceptance Scenarios**:

1. **Given** a player defines a set of 3 catalog items, **When** another
   player with enough gold buys it, **Then** all 3 items are added and the
   summed price is deducted as one batch.
2. **Given** a player cannot afford the set total, **When** they try to buy,
   **Then** it is refused (or partial — C-06).
3. **Given** a set is edited after a prior buy, **When** viewing that past
   purchase, **Then** the purchase is unchanged (copy-on-buy).

---

### Edge Cases

- Current loop ambiguous → fall back to loop 1 (spec-044 convention).
- Buying an item already held → quantity stacks.
- Equipped item's quantity drops to 0 via a move → implicit un-equip? (C-03).
- A set references an item later removed from the catalog → skip / warn at buy.
- Concurrent moves draining a container below the picked qty → availability cap
  plus a server-side check.
- Two players buy the same set at once → independent purchases, no shared stock.

## Requirements *(mandatory)*

### Functional Requirements

**Containers & moves (US1)**
- **FR-001**: The Mini App MUST present each PC's holdings as an inventory —
  the items the PC currently holds this loop, with quantities, on one screen.
- **FR-002**: A player MUST be able to move items between containers (own
  inventory ↔ общак; own inventory → another PC), choosing an item the source
  holds and a quantity ≤ available, recorded as the existing item-transactions
  (no accounting change).
- **FR-003**: The move UI MUST follow a container model — choose a source
  container and a destination container, then move items — rather than a single
  fixed transfer form. (Exact interaction — two-pane, drag, etc. — is a
  Plan/design decision.)
- **FR-004**: Pickers for items leaving the общак or another PC MUST list only
  what that container actually holds and cap quantity at availability.
- **FR-005**: Moves into the общак (and PC↔PC, if so decided) MUST respect the
  existing free-общак auto-approval policy (spec-044). PC↔PC approval — C-01.

**Buying (US2)**
- **FR-010**: A player MUST be able to buy a catalog item for gold — pick item,
  quantity, confirm — debiting the buyer's gold and adding the item.
- **FR-011**: The price MUST come from the item's catalog price
  (spec-016 defaults). Items with no catalog price MUST NOT be buyable (C-10).
- **FR-012**: A purchase MUST be expressed in the existing ledger as a gold-out
  plus an item-in (accounting backend unchanged); the legs SHOULD be linked
  (`transfer_group_id` pattern) under a 'purchase' category. Representation —
  C-02.
- **FR-013**: Whether a purchase is auto-approved or queued for the DM, and
  whether gold may come only from the PC wallet or also the общак, is
  **[NEEDS CLARIFICATION — C-01]**.
- **FR-014**: A purchase MUST be clearly refused when available gold < price ×
  qty (unless C-01 allows partial / credit).

**Equipped (US3)**
- **FR-020**: A player MUST be able to mark an inventory item as Надето and to
  un-equip it; the state is per PC.
- **FR-021**: The inventory MUST visually distinguish equipped from carried.
- **FR-022**: Equipped state MUST NOT change balances or holdings — inventory
  metadata only; no mechanical effect in this spec (engine reads later — C-07).
- **FR-023**: How equipped state is stored and keyed to computed holdings, and
  whether it persists across loops, is **[NEEDS CLARIFICATION — C-03, C-04]**.

**Sets (US4)**
- **FR-030**: A player MUST be able to create a set — a named bundle of catalog
  items with quantities — and edit / delete it. Ownership / edit rights — C-05.
- **FR-031**: Any player MUST be able to buy a whole set in one action, buying
  every item in the set for the buyer (gold out + items in) as a single batch.
- **FR-032**: A set buy MUST follow the same purchase rules as a single buy
  (price source, approval, affordability — C-01, C-06); affordability is
  checked against the set total (all-or-nothing vs partial — C-06).
- **FR-033**: Sets MUST be campaign-scoped and visible to players to buy
  (visibility / DM curation — C-05); sets reference catalog items only (C-10).
- **FR-034**: A set is a template — buying it copies its contents into the
  purchase; later edits affect only future buys, not past purchases.

**Cross-cutting**
- **FR-040**: All new surfaces live in the Telegram Mini App (`/tg`), extending
  spec-044. Platform scope — C-09.
- **FR-041**: The accounting backend (the `transactions` schema, SUM-based
  balances, transfer / credit logic) MUST NOT be restructured. This feature
  adds only the equipped flag and set definitions as new data and reuses
  existing item / money transactions for moves and buys.
- **FR-042**: New server actions MUST follow the project's auth gating
  (`resolveAuth` / `getMembership` / ownership) per `mat-ucheniya/AGENTS.md`.

### Key Entities *(include if feature involves data)*

- **Container** — a node that holds items (a PC, or the общак). Holdings are
  the net of approved item-transactions for that node this loop. No new
  storage; existing nodes (spec-001 graph, spec-017 общак).
- **Item holding** — computed (container, item, net qty). Item identity =
  catalog node id for catalog items, name for free-text.
- **Equipped flag** — NEW. A per-(PC, item identity) boolean. Storage, keying
  to a computed holding, qty>1 handling, and loop scope — C-03 / C-04.
- **Set (bundle)** — NEW. A named, campaign-scoped, player-authored collection
  of (catalog item, qty); a template, copy-on-buy. Storage (a `set` node type
  vs a dedicated table) and ownership — C-05.
- **Purchase** — a ledger *expression* (gold-out + item-in, linked), not a new
  primitive; 'purchase' category. Representation — C-02.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can buy a catalog item for gold in ≤ 3 taps; the item
  appears in their inventory and the gold leaves their wallet.
- **SC-002**: A player can move an item from their inventory to the общак and
  back in ≤ 3 taps, always choosing from real holdings.
- **SC-003**: A player can create a set and later buy it in one tap; all its
  items appear and the correct total gold is deducted.
- **SC-004**: Equipping / un-equipping reflects immediately and survives a
  reload (within its loop scope).
- **SC-005**: Every wallet / общак balance after moves and buys equals the
  `SUM()` of approved transactions — no stored-balance drift — confirming the
  accounting backend was untouched.
- **SC-006**: The DM's approval workload for buys matches the C-01 decision
  (measurable once decided).

## Assumptions

- The event-sourced ledger (`transactions`; balance via `SUM`;
  `transfer_group_id`; money + item kinds) is reused as-is. Moves =
  item-transactions; buys = money + item transactions. No accounting schema
  change. (Andrey: «бэкенд бухгалтерии особо не трогает».)
- The inventory / containers / buy / sets / equipped UI targets the Telegram
  Mini App (`/tg`), building directly on spec-044's screens, readers, and
  actions. Desktop parity is out of scope for v1. (C-09.)
- Containers in v1 are the existing nodes only — each PC and the single
  campaign общак; no nested bags or multiple stashes.
- Buying references the existing catalog (spec-015/018) and its default prices
  (spec-016). Free-text (non-catalog) items remain movable and equippable but
  are not buyable and not allowed in sets. (C-10.)
- Realtime propagation of inventory changes is desirable but optional and
  depends on the spec-044 realtime path (DEBT-011); not required for v1.
- "Equipped" carries no mechanical / stat effect in this spec; item-effect
  application belongs to the RPG-engine epic (spec-045+). (C-07.)

## Open Questions (for Clarify)

- **C-01 — Purchase approval & gold source.** Is a buy auto-approved (player
  spends own gold) or queued for the DM like a normal record? Does gold come
  only from the PC wallet, or may a buy draw общак gold? Does affordability
  block the buy, or is credit / partial allowed?
- **C-02 — Purchase ledger shape.** One money-expense row (category 'purchase')
  + one item-acquire row sharing a `transfer_group_id`, vs a single item row
  that also carries a price and moves money? What category / comment text?
- **C-03 — Equipped storage & keying.** Holdings are computed (no per-item
  row), so what keys "equipped" — (pc_id, catalog_node_id) for catalog items
  and (pc_id, item_name) for free-text? A new `pc_equipped` table? When qty>1,
  is it the line that's equipped (boolean) or per-unit? What happens to the
  flag when the holding drops to 0?
- **C-04 — Loop semantics.** The 30-day loop resets the world; wallet and
  holdings are per-loop. Does equipped state reset each loop (re-equip every
  loop) or persist? (Sets are templates → persist regardless.) Confirm a bought
  item exists only within the loop it was bought.
- **C-05 — Set ownership / visibility / editing.** Who can create / edit /
  delete a set — any player (a shared library) or only its author? Are sets
  per-campaign and visible to all to buy? May the DM curate "official" sets?
  (Editing is safe given copy-on-buy.)
- **C-06 — Set buy semantics.** All-or-nothing on affordability, or partial?
  Same approval path as a single buy (C-01)? How are set items with no catalog
  price handled (assumed disallowed at set creation — C-10)?
- **C-07 — Equipped ↔ engine boundary.** Should "equipped" live in the store
  the RPG engine (spec-045) will read for item effects, or is it a standalone
  inventory flag now, reconciled when items-as-modules land?
- **C-08 — Containers in scope.** Confirm v1 containers = each PC + the single
  общак, no nested bags. Is "buy" modeled as a move from a virtual
  shop/catalog container (so the container metaphor covers buying too), or a
  separate buy action?
- **C-09 — Platform.** Mini-App-only for v1 (desktop keeps its current
  transfer/stash UI), with the data model platform-agnostic — confirm.
- **C-10 — Free-text items.** Confirm free-text (non-catalog) items are
  movable and equippable but not buyable and not allowed in sets.

## Dependencies

- **spec-044** (the `/tg` ledger, holdings readers, transfer / stash actions) —
  this builds directly on it; it must be merged (or this work continues on its
  branch).
- **item catalog** (spec-015/018) + **default prices** (spec-016) — for buying.
- **the event-sourced ledger** (specs 009–019; migration 034) — for the money
  / item legs of moves and buys.
- **RPG-engine epic** (spec-045) — only a boundary (C-07), not a hard
  dependency; this spec ships without the engine.
