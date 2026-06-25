# Feature Specification: Inventory — containers, buying, sets & equipped state

**Feature Branch**: `052-inventory-containers-sets`
**Created**: 2026-06-23 (chat 95)
**Status**: Clarified — awaiting Plan
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

**Prod feedback (2026-06-23, after 044 shipped to prod).** Two gaps surfaced in
real use and feed this spec: (1) a player has no way to see their own pending
заявки (moves / buys awaiting the DM) or to cancel one — it is submit-and-wait;
(2) quantity must be first-class everywhere items appear (20 arrows, 5 rations),
not item-at-a-time. Both fold into the scope below — the move / buy / set flows
already carry qty (the open piece is the underlying data, C-12, and the cancel
rules, C-11).

## Scope

**In (P1) — containers & moves:** a per-PC **inventory** screen (everything
held this loop, with quantities); moving items between containers — own
inventory ↔ общак, own inventory → another PC — via a container-style picker
(source container → destination container → item → qty) that replaces the
one-shot transfer form; availability-capped pickers sourced from real
holdings; moves recorded as the existing item-transactions under the existing
auto-approval policy.

**In (P2) — buying & equipped:** **buy a catalog item for gold** (gold-out +
item-in, expressed in the existing ledger); price from the catalog **scaled by
a DM per-rarity coefficient**; affordability check; **per-rarity approval
gate** (DM-configured, default: very-rare & legendary require approval);
**equipped/Надето** state per PC with equip/un-equip, shown in the inventory,
carrying no mechanical effect.

**In (P2) — DM purchase policy (desktop):** on the existing DM-only
**«Настройки предметов»** page — a per-rarity **price coefficient** (multiplier)
and a per-rarity **approval-required** toggle; in the items table — a per-item
**«нельзя купить»** checkbox excluding individual items from buying (e.g.
potentially illegal goods). DM/owner only; web/desktop surface, not the Mini
App. (C-13, C-14, C-15.)

**In (P3) — sets:** player-authored **sets** (named bundles of catalog items
+ qty); create / edit / delete; **buy a whole set in one action** (gold-out
for the total + all items in, as one batch); sets are campaign-scoped
templates (copy-on-buy).

**In — my requests:** a list of the player's own **pending заявки** (moves /
buys awaiting DM approval) in the Mini App, with the ability to **cancel** one
while it is still pending.

**Out:** item *effects* / stats from equipped gear (engine — spec-045+);
nested containers / bags / weight & encumbrance; selling items back for gold,
vendor/shop entities, currencies beyond the existing coin set; desktop UI
parity **for the player flows** (inventory / move / buy / sets stay
Mini-App-first — desktop keeps its current transfer/stash UI; the DM purchase
policy above is a deliberate, separate desktop-only addition, not player-flow
parity); xlsx inventory import; any change to how balances are computed.

## Epic / platform note

All **player-facing** surfaces live in the **Telegram Mini App** (`/tg`),
extending spec-044 — same auth (real GoTrue session from 046), same readers,
same coin model. The data model is platform-agnostic; a later spec may bring
parity to the desktop app. **Exception:** the DM-only purchase policy
(per-rarity coefficient + approval toggle, per-item «нельзя купить») is a
**desktop/web** surface, reusing the existing «Настройки предметов» page and
the items table — it is configuration, not a player flow. (C-09, C-13.)

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
4. **Given** the DM set the `rare` coefficient to 2, **When** a player buys a
   40-gp rare item, **Then** 80 gp is charged (FR-011, C-13).
5. **Given** the DM's default policy (very-rare/legendary require approval),
   **When** a player buys a very-rare item with their own gold, **Then** the buy
   is created **pending DM approval**, not auto-approved (FR-013, C-14).
6. **Given** the DM marked an item «нельзя купить», **When** a player opens buy,
   **Then** that item is not offered for purchase, yet still moves and equips
   normally (FR-052, C-15).

---

### User Story 3 — Equipped status (Priority: P2)

A player marks gear as **Надето** on their PC and can un-equip it; the
inventory visibly distinguishes equipped from carried. Items that **require
attunement** («Требует настройки») are tracked against the D&D soft cap of 3:
the cap does **not** block, but the inventory shows a warning **плашка** when a
PC has more than 3 attunement-requiring items equipped. Starting equipment may
ship items **pre-equipped**, so a PC begins a loop already wearing its kit.

**Why this priority**: part of the "fuller inventory" Andrey described;
standalone and low-risk; lets the engine read equipment later.

**Independent Test**: equip an item, reload, it is still equipped (within the
loop); balances and holdings are unchanged. Equip a 4th attunement item — a
warning плашка appears but the equip still succeeds.

**Acceptance Scenarios**:

1. **Given** a PC holds armor, **When** the player taps «Надеть», **Then** the
   item shows as equipped and stays so after reload (persistence / loop scope —
   C-04).
2. **Given** an equipped item, **When** the player un-equips it, **Then** it
   returns to carried.
3. **Given** any equip / un-equip, **When** it happens, **Then** no balance or
   holding changes — it is metadata only.
4. **Given** a PC already has 3 attunement-requiring items equipped, **When**
   the player equips a 4th, **Then** the equip succeeds and a warning плашка
   («настроено N из 3») is shown — nothing is blocked (FR-024, C-17).
5. **Given** the DM marked a starting item as «надето» in the starter setup,
   **When** the setup is applied to the PC, **Then** the PC begins the loop with
   that item already equipped (FR-025, C-18).

---

### User Story 4 — Sets / bundles (Priority: P3)

A player creates «Набор мага» — a list of catalog items with quantities — and
any player buys the whole set in one tap, paying the total and receiving all
items. On the buy screen the player can **adjust the working copy** — drop an
item, change a quantity, add another catalog item — and then either **buy the
adjusted contents as a one-off** (nothing saved) or **save-as a new set** for
reuse. The source set is never overwritten by this; editing one's own sets is
the separate management path (FR-030).

**Why this priority**: convenience layered on buying; depends on US2;
highest-effort and most deferrable.

**Independent Test**: create a 3-item set, buy it with a funded PC; total gold
out and all items in. Editing the set afterward does not change the past
purchase. Open the set on buy, drop one item, buy — only the 2 kept items are
purchased and the stored set still has 3.

**Acceptance Scenarios**:

1. **Given** a player defines a set of 3 catalog items, **When** another
   player with enough gold buys it, **Then** all 3 items are added and the
   summed price is deducted as one batch.
2. **Given** a player cannot afford the set total, **When** they try to buy,
   **Then** it is refused (or partial — C-06).
3. **Given** a set is edited after a prior buy, **When** viewing that past
   purchase, **Then** the purchase is unchanged (copy-on-buy).
4. **Given** a player opens a set on the buy screen and removes one item,
   **When** they confirm a one-off buy, **Then** only the kept items are
   purchased and the stored set is unchanged (FR-035, C-19).
5. **Given** a player adjusts a set's working copy on the buy screen, **When**
   they choose «сохранить как новый», **Then** a new player-owned set with the
   adjusted contents is created and the source set is untouched (FR-035, C-19).

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
- **FR-011**: The buy price MUST be the item's effective base price scaled by
  the DM's per-rarity coefficient: `charged = (item.price_gp ?? rarity-default
  price (spec-016, magic/consumable bucket)) × coefficient[rarity]`, rounded to
  whole gp. Default coefficient is 1 (no markup). Items with no effective base
  price MUST NOT be buyable (C-10); items flagged «нельзя купить» MUST NOT be
  buyable either (FR-052). Pricing detail — C-13.
- **FR-012**: A purchase MUST be expressed in the existing ledger as a gold-out
  plus an item-in (accounting backend unchanged); the legs SHOULD be linked
  (`transfer_group_id` pattern) under a 'purchase' category. Representation —
  C-02.
- **FR-013**: A buy MUST require DM approval iff the item's rarity is in the
  DM's per-rarity «approval-required» set (FR-051; default: very-rare,
  legendary) — **regardless of funding source**. Below the threshold the buy is
  auto-approved. This **revises C-01**: own-gold (and общак) funding no longer
  auto-approves a high-rarity buy. The funding source stays player-selected per
  purchase — own PC wallet, PC wallet with an общак shortfall top-up, or the
  общак directly — and a buy the chosen source cannot cover is blocked (no
  implicit credit). Approval gate — C-14; funding — C-01.
- **FR-014**: A purchase MUST be clearly refused when available gold < price ×
  qty (unless C-01 allows partial / credit).
- **FR-015**: A player MUST be able to see their own **pending заявки** (item
  moves / buys awaiting DM approval) in the Mini App and to **cancel** one while
  it is still pending. Cancel / notify rules — C-11.
- **FR-016** (cross-cutting): Quantity MUST be first-class across every item
  surface — display, move, buy and set — so a stack (e.g. 20 arrows) is one line
  carrying a count, not N rows. This needs the item-transaction to carry a
  quantity delta and holdings to sum it. Data-model confirmation — C-12.

**Pricing & purchase policy (US2 — DM, desktop)**
- **FR-050**: The DM/owner MUST be able to set a **per-rarity price
  coefficient** (a non-negative multiplier, default 1) on the «Настройки
  предметов» page, persisted in `campaigns.settings`; the buy price applies it
  per FR-011. Rarities are the existing ladder (`common / uncommon / rare /
  very-rare / legendary`). (C-13.)
- **FR-051**: The DM/owner MUST be able to toggle **«approval required»**
  per rarity on the same page, persisted in `campaigns.settings`. Defaults:
  `common / uncommon / rare` → off, `very-rare / legendary` → on. The buy flow
  reads this per FR-013. (C-14.)
- **FR-052**: The DM/owner MUST be able to mark an individual catalog item as
  **«нельзя купить»** via a checkbox in the items table, persisted as a boolean
  in the item node's `fields` jsonb. Flagged items are excluded from buying
  (FR-011) and from buyable sets (FR-032) but remain movable and equippable.
  (C-15.)
- **FR-053**: All of FR-050–FR-052 MUST persist without a schema change —
  coefficient + approval map in `campaigns.settings` (JSONB), the per-item flag
  in `fields` (JSONB) — preserving FR-041 / C-12 (no migration).

**Equipped (US3)**
- **FR-020**: A player MUST be able to mark an inventory item as Надето and to
  un-equip it; the state is per PC.
- **FR-021**: The inventory MUST visually distinguish equipped from carried.
- **FR-022**: Equipped state MUST NOT change balances or holdings — inventory
  metadata only; no mechanical effect in this spec (engine reads later — C-07).
- **FR-023**: Equipped state lives in a new `pc_equipped` table keyed by
  (pc_id, item_name, loop_number), separate from `transactions`, and is
  per-loop like holdings (C-03, C-04). See Clarifications.

- **FR-024**: The inventory MUST count a PC's equipped items that **require
  attunement** (existing `item_attributes.requires_attunement`, mig 055) and
  show a non-blocking warning **плашка** when that count exceeds **3**. The cap
  is soft: equipping is never refused on this basis; only an indicator appears.
  Attunement relevance follows equipped state (an equipped requires-attunement
  item counts; un-equipping clears it) — no separate «настроен» toggle in v1.
  The cap value is a constant 3 for v1 (DM-configurable later if wanted).
  Free-text items carry no attunement. — C-17.
- **FR-025**: Starting equipment MUST support a per-item **«надето»** flag in
  the DM starter-setup editor (spec-019); applying the setup writes the
  corresponding `pc_equipped` rows so the PC begins the loop with those items
  equipped. Desktop DM surface. — C-18.

**Sets (US4)**
- **FR-030**: A player MUST be able to create a set — a named bundle of catalog
  items with quantities — and edit / delete it. Ownership / edit rights — C-05.
- **FR-031**: Any player MUST be able to buy a whole set in one action, buying
  every item in the set for the buyer (gold out + items in) as a single batch.
- **FR-032**: A set buy MUST follow the same purchase rules as a single buy
  (per-rarity price coefficient, affordability — C-06); affordability is
  checked against the set total (all-or-nothing vs partial — C-06). The
  **approval gate aggregates**: a set buy requires DM approval if **any**
  constituent item's rarity requires it (FR-051). A set buy whose contents
  include an item currently flagged «нельзя купить» (FR-052) MUST be **blocked**
  at buy time (all-or-nothing). (C-14, C-15, C-16.)
- **FR-033**: Sets MUST be campaign-scoped and visible to players to buy
  (visibility / DM curation — C-05); sets reference catalog items only (C-10).
- **FR-034**: A set is a template — buying it copies its contents into the
  purchase; later edits affect only future buys, not past purchases.
- **FR-035**: On the buy screen the player MUST be able to **edit the working
  copy** of a set — remove items, change quantities, add another catalog item —
  then either (a) **buy the adjusted contents as a one-off** (no persistence) or
  (b) **save-as a new set** owned by the acting player. Neither path overwrites
  the source set (FR-034). The one-off buy and save-as obey the same purchase
  rules (FR-032: coefficient, affordability, approval aggregation, «нельзя
  купить» block). — C-19.

**Cross-cutting**
- **FR-040**: All **player-facing** new surfaces live in the Telegram Mini App
  (`/tg`), extending spec-044. The **DM-only purchase policy** (FR-050–FR-052)
  is the one exception — a desktop/web surface on the existing «Настройки
  предметов» page and the items table. Platform scope — C-09, C-13.
- **FR-041**: The accounting backend (the `transactions` schema, SUM-based
  balances, transfer / credit logic) MUST NOT be restructured. This feature
  adds only the equipped flag and set definitions as new data, plus the DM
  purchase-policy config (`campaigns.settings` JSONB) and the per-item
  «нельзя купить» flag (`fields` JSONB) — no accounting-schema change — and
  reuses existing item / money transactions for moves and buys.
- **FR-042**: New server actions MUST follow the project's auth gating
  (`resolveAuth` / `getMembership` / ownership) per `mat-ucheniya/AGENTS.md`.

### Key Entities *(include if feature involves data)*

- **Container** — a node that holds items (a PC, or the общак). Holdings are
  the net of approved item-transactions for that node this loop. No new
  storage; existing nodes (spec-001 graph, spec-017 общак).
- **Item holding** — computed (container, item, net qty). Item identity =
  catalog node id for catalog items, name for free-text.
- **Equipped flag** — NEW. A per-(PC, item identity) boolean. Storage, keying
  to a computed holding, qty>1 handling, and loop scope — C-03 / C-04. The
  **attunement count** is *derived*, not stored: equipped items whose catalog
  node has `requires_attunement=true` (mig 055), capped softly at 3 (C-17).
  Starter setup may seed equipped rows on apply (C-18).
- **Set (bundle)** — NEW. A named, campaign-scoped, player-authored collection
  of (catalog item, qty); a template, copy-on-buy. Storage (a `set` node type
  vs a dedicated table) and ownership — C-05. The buy screen operates on a
  **working copy** that the player may edit, then buy one-off or **save-as a new
  set**; the source set is never overwritten on the buy path (C-19).
- **Purchase** — a ledger *expression* (gold-out + item-in, linked), not a new
  primitive; 'purchase' category. Representation — C-02.
- **Purchase policy** — NEW (config, not a primitive). Campaign-scoped, in
  `campaigns.settings` (JSONB): per-rarity `coefficient` (multiplier, default 1)
  and per-rarity `approval_required` (bool; default very-rare/legendary = true).
  DM/owner edits on «Настройки предметов». No schema change. — C-13, C-14.
- **Item purchasability flag** — NEW. A per-item boolean («нельзя купить») in
  the item node's `fields` jsonb; excludes the item from buying and from
  buyable sets, leaves moves/equip untouched. — C-15.

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
  (spec-016), scaled by a DM per-rarity coefficient, and is gated by a DM
  per-rarity approval toggle (both new, in `campaigns.settings`); items the DM
  flags «нельзя купить» are not buyable. Free-text (non-catalog) items remain
  movable and equippable but are not buyable and not allowed in sets. (C-10,
  C-13, C-14, C-15.)
- Realtime propagation of inventory changes is desirable but optional and
  depends on the spec-044 realtime path (DEBT-011); not required for v1.
- "Equipped" carries no mechanical / stat effect in this spec; item-effect
  application belongs to the RPG-engine epic (spec-045+). (C-07.)

## Clarifications

### Round 1 — 2026-06-23 (chat 99)

Most questions resolved against the shipped spec-044 code rather than by
asking; the migration risk (C-12) is retired — no schema change is needed.

**C-01 (FR-010, FR-013, US2). Purchase approval & gold source.**
**A**: **A buy funded by the player's own gold is auto-approved** — the same
trust model as taking from the общак, which `takeMoneyFromStash` already
auto-approves. **The funding source is player-selected per purchase:**
(a) own PC wallet, (b) PC wallet with an общак top-up covering the shortfall
(reusing the existing `createExpenseWithStashShortfall` pattern — the cover
transfer auto-approves), or (c) the общак directly. When the chosen source
cannot cover price × qty, the buy is **blocked** — credit stays a separate,
explicit mechanism (`category='credit'` / `takeLoopCredit`), not an implicit
overdraft. Consequence accepted: общак-funded buys auto-approve with no DM
gate, matching the общак's existing free auto-approved take.

**C-02 (FR-012, Purchase entity). Purchase ledger shape.**
**A**: **Two correlated rows sharing a `transfer_group_id`, category
`'purchase'`:** a money leg (`kind='money'`, −gp) plus an item leg
(`kind='item'`, +qty, `item_node_id` = catalog node, column present since
migration 043). Neither leg is `kind='transfer'` (a buy has no counterparty
node). The money leg lands on the PC for sources (a)/(b) and on the общак
node for source (c); source (b) additionally emits the shortfall transfer
pair (общак→PC) ahead of the PC money leg. `'purchase'` is a new
`scope='transaction'` category, seeded like the existing six (makes buys
filterable). New `createPurchase` action — not `createItemTransfer` (that
writes a sender↔recipient item pair). No schema change.

**C-03 (FR-023, Equipped flag entity). Equipped storage & keying.**
**A**: **A new `pc_equipped` table** — `(pc_id, item_name, loop_number,
equipped bool)` — which does **not** touch `transactions` (FR-041). Keyed by
`item_name`, matching the identity used by the shipped holdings readers
(`getPcItemHoldingsTg` groups by name); `item_node_id` stays available if a
later spec wants node-keyed equip. The flag is per holding line (boolean),
not per unit — "Надето" carries no mechanical effect, so per-unit is overkill.
When the net holding for an item drops to 0 the reader simply does not render
it (the row may linger but is invisible / implicitly un-equipped).

**C-04 (FR-023, Edge Cases, Assumptions). Loop semantics.**
**A**: **Equipped state is per-loop, like wallet and holdings** (readers
already filter `loop_number`; the 30-day loop resets the world). Re-equip each
loop. Persisting equipped across loops is rejected — it would dangle against
holdings that do not exist in the new loop. Confirmed: a bought item exists
only within the loop it was bought. Sets are templates and persist across
loops regardless.

**C-05 (FR-030, FR-033). Set ownership / visibility / editing.**
**A**: **A shared, campaign-scoped library.** Any player can create, buy, and
view any set; edit/delete is restricted to the set's author or a DM/owner.
Rationale: the feature's premise is player-authored shared shortcuts, and
copy-on-buy (FR-034) makes post-hoc edits safe. DM curation of "official"
sets is deferred (not in v1).

**C-06 (FR-032). Set buy semantics.**
**A**: **All-or-nothing on affordability** (a set is one batch; partial buys
defeat the one-tap purpose). Same approval / funding path as a single buy
(C-01). Items with no catalog price are barred at set creation (C-10), so a
priced total is always computable.

**C-07 (FR-022, Assumptions). Equipped ↔ engine boundary.**
**A**: **Equipped is a standalone inventory flag now** (`pc_equipped`); the
RPG engine (spec-045) reads it later, once items-as-modules land. Rationale:
spec-045 is still in Specify and its item-module data model is not fixed —
binding 052 to an unbuilt store would block it, while reconciling a PC+item
boolean later is cheap. 052 ships without the engine (stated dependency).

**C-08 (FR-003, Containers entity). Containers in scope.**
**A**: **v1 containers = each PC + the single общак, no nested bags.** "Buy"
is a **separate action**, not a move from a virtual shop/catalog container:
the money leg leaves to no node and there is no gold reservoir, so a fake
"shop container" is worse than an explicit buy action.

**C-09 (FR-040, Assumptions). Platform.**
**A**: **Mini-App-only (`/tg`) for v1**; desktop keeps its current
transfer/stash UI. The data model (the `pc_equipped` table, set definitions,
reused ledger) is platform-agnostic — a later spec may bring desktop parity.

**C-10 (FR-011, FR-033, Assumptions). Free-text items.**
**A**: **Free-text (non-catalog) items are movable and equippable but not
buyable and not allowed in sets.** Buying requires a catalog price
(spec-016); free-text items have none. Moves and equip key on `item_name`, so
they work for catalog and free-text identically.

**C-11 (FR-015). Cancel own pending заявка.**
**A**: **Already supported at the action layer — only a UI surface is new.**
`deleteTransaction` / `deleteTransfer` already permit a player to delete only
their own `pending` rows ("Можно удалять только pending-заявки"). The wallet
and holdings readers count only `status='approved'`, so dropping a pending row
has **no balance or holding effect**. New work: a "my requests" view in `/tg`
(the feed already badges pending with ⏳ but offers no filter) plus a
"Отменить" button wired to the existing delete. No DM notification on cancel
in v1 — the заявка simply leaves the DM queue.

**C-12 (FR-016). Item quantity data model.**
**A**: **No migration needed — quantity is already first-class.**
`transactions.item_qty` exists (migration 035) and is signed (`<> 0`,
migration 036): `SUM(item_qty)` over `actor_pc_id` is the net holding, exactly
like coins. The shipped readers already sum it; the shipped actions
(`putItemIntoStash` / `takeItemFromStash` / `createItemTransfer`) already
thread `qty`; the `/tg` UI already has a qty input with an availability cap,
renders item rows as `×N`, and shows holdings as `×qty`. FR-016 is therefore
purely app-layer: the new buy and set forms inherit the same qty-carrying
pattern, and any remaining item-at-a-time surface adopts the stack-with-count
display.

### Round 2 — 2026-06-26 (chat 100)

Prod-driven scope from Andrey: a DM-configurable purchase economy + gate, on
the **desktop** «Настройки предметов» page and the items table. Player buy/move
flows stay in the Mini App. All persistence stays JSONB — no schema change,
C-12 still holds.

**C-13 (FR-011, FR-050). Per-rarity price coefficient — semantics.**
**A**: A **multiplier**, not a replacement for spec-016 default prices. They
layer: the spec-016 per-rarity default fills the *base* price when an item has
no `price_gp`; the coefficient then scales the base on every buy —
`charged = (item.price_gp ?? rarity-default[bucket]) × coefficient[rarity]`,
rounded to whole gp. Default coefficient = 1 (no markup), so existing campaigns
are unaffected until a DM changes it. Stored per rarity in `campaigns.settings`
alongside `item_default_prices`. Rarity ladder = the existing five
(`common / uncommon / rare / very-rare / legendary`); no `artifact` rung in the
data.

**C-14 (FR-013, FR-051). Per-rarity approval gate — and C-01 revision.**
**A**: Approval is decided by the item's **rarity**, funding-agnostic. A buy
needs DM approval iff `approval_required[rarity]` is on (DM-configured; default
`very-rare` & `legendary` = on, lower rungs = off). **This revises C-01**: the
old "a buy funded by the player's own gold (or the общак) is auto-approved" no
longer holds above the threshold — a very-rare/legendary buy goes to the
pending queue **even when fully self-funded or общак-funded**. Below the
threshold, self-funded buys still auto-approve (C-01's spirit, now scoped by
rarity). C-01's funding-source selection and affordability-block are unchanged.
Consequence accepted: high-rarity purchases always get a DM gate; the DM tunes
the threshold per rarity.

**C-15 (FR-052, FR-032). Item «нельзя купить» flag — storage & reach.**
**A**: A per-item **boolean** in the item node's `fields` jsonb (e.g.
`no_purchase: true`), toggled by a checkbox in the items table (DM/owner only).
Chosen over reusing the `item-availability` taxonomy: «нельзя купить» is an
orthogonal hard purchase-gate, not a "where it's sold" label, and a boolean
matches the requested checkbox UX with no migration. Reach: flagged items are
excluded from the buy picker (single and set) and a set buy containing one is
blocked at buy time; moves and equip are untouched. Enforcement is at buy time
(not set-creation time) because the DM can toggle the flag after a set exists.

**C-16 (FR-032). Set-buy approval aggregation.**
**A**: A set bundles mixed rarities; the gate **aggregates by max** — the set
buy needs approval if **any** constituent item's rarity requires it (FR-051).
Affordability stays all-or-nothing against the set total (C-06). A pending set
buy is one заявка (matching the single-batch model of FR-031), approved or
rejected as a unit.

**C-17 (FR-024, US3). Attunement soft cap & «настроен» vs «надето».**
**A**: Reuse the existing `item_attributes.requires_attunement` flag (mig 055).
Attunement is **derived from equipped state** — an equipped requires-attunement
item counts toward the cap; there is **no separate «настроен» toggle** in v1
(minimal, and a soft warning doesn't need the finer distinction). The cap is a
**constant 3**, **non-blocking**: equipping a 4th is allowed and only raises a
warning плашка («настроено N из 3»). Could become a DM-configured number later,
but not in this spec. Free-text (non-catalog) items have no attunement.

**C-18 (FR-025, US3). «Надето» in starting equipment.**
**A**: The spec-019 starter-setup editor (desktop, DM-only) gains a per-starting
-item «надето» toggle; **applying** the setup writes `pc_equipped` rows for the
flagged items so the PC starts the loop already wearing them. This extends
spec-019's apply path; no accounting change. Same loop-scoped equipped model as
FR-023 / C-03.

**C-19 (FR-035, US4). Edit-on-buy: one-off vs save-as.**
**A**: The buy screen edits a **working copy** of the set — remove / change-qty
/ add catalog item. Two non-destructive exits: **(a) one-off buy** of the
adjusted contents (nothing persisted) or **(b) save-as a new set** owned by the
acting player. The **source set is never overwritten** on the buy path —
overwriting one's own set is the separate management path (FR-030). Both exits
obey FR-032 purchase rules. This preserves copy-on-buy (FR-034) and the
template semantics.

## Open Questions (resolved — see Clarifications above)

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
- **C-11 — Cancel own pending заявка.** A player cancels only their own request
  and only while it is pending? Does cancel simply drop the pending row (no
  ledger effect, since pending isn't applied), and does the DM get notified?
- **C-12 — Item quantity data model.** Does the spec-044 item-transaction
  already carry a quantity delta (a stack = one row with `qty`), or do items
  ship as one row each today — i.e. does 052 need a migration to add `qty` and
  make holdings sum it? (Prod feedback #2.)

## Dependencies

- **spec-044** (the `/tg` ledger, holdings readers, transfer / stash actions) —
  this builds directly on it; it must be merged (or this work continues on its
  branch).
- **item catalog** (spec-015/018) + **default prices** (spec-016) — for buying.
- **the event-sourced ledger** (specs 009–019; migration 034) — for the money
  / item legs of moves and buys.
- **RPG-engine epic** (spec-045) — only a boundary (C-07), not a hard
  dependency; this spec ships without the engine.
