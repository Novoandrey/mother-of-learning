# Implementation Plan: Inventory — containers, buying, sets & equipped (spec-052)

**Status**: Plan draft — awaiting review (then Tasks)
**Created**: 2026-06-26 · **Author**: Claude
**Inputs**: `spec.md` (Clarified, C-01…C-19), epic `constitution.md`
(E4/E6/E10, engine boundary C-07 → spec-045), shipped spec-044 (`/tg` ledger,
holdings readers, transfer/stash actions) + spec-046 (real GoTrue cookie
session) as the base.
**Assumes**: 044 + 046 are on `main` (they are — PR #4/#5 merged). 052 branches
from clean `main` as `claude/052-inventory-containers-sets`.

---

## 1. Summary & approach

052 is a **fuller inventory layer** on top of the shipped 044 ledger, almost
entirely **app-layer**. The accounting core (transactions, SUM balances,
transfer/stash, signed `item_qty`) is reused untouched (FR-041, C-12). Four
player stories live in the `/tg` Mini App; one DM purchase-policy surface lives
on the **desktop** «Настройки предметов» page + items table (the single
intentional desktop addition, C-13/FR-040).

What is genuinely new:
- **One new table** — `pc_equipped` (C-03/C-04); everything else is JSONB or
  reuses existing columns.
- **One new write action** — `createPurchase` (C-02); buying a single item and
  buying a set both route through it.
- **DM purchase policy** in `campaigns.settings` (per-rarity coefficient +
  approval toggle, C-13/C-14) and a per-item «нельзя купить» flag in the item
  node's `fields` (C-15) — both JSONB, no migration.
- **Sets** as a `set` node type with the item list in `fields` jsonb (PL-8).

Split of concerns (inherits 044):
- **Reads** (inventory, feed, общак, holdings, sets) → existing `tg-client`
  readers under the cookie session; extend `getPcItemHoldingsTg` to also carry
  equipped + attunement.
- **Writes** (move, buy, equip, set CRUD) → server actions through the standard
  `resolveAuth(campaignId)` cookie path (PL-1), AGENTS auth-gated.
- **Refresh** → Mini App client-side optimistic + realtime (044 PL-6, no
  `revalidatePath`); desktop surfaces honour the sidebar-invalidation contract.

---

## 2. Key technical decisions

### PL-1 — Auth: standard cookie session, no adapter (supersedes 044 PL-1)

spec-046 gave the Mini App a **real passwordless GoTrue session** (magiclink →
verifyOtp → `@supabase/ssr` cookie). `resolveAuth(campaignId)` already takes
**only** `campaignId` (verified on disk: `transactions.ts:98`,
`approval.ts:35`) and resolves the user from the cookie. The 044 plan's
minted-JWT `tgToken` adapter is **dead** — gone from the shipped code. Every new
052 action (`createPurchase`, equip, set CRUD, policy update) calls
`resolveAuth` → `getMembership` → ownership exactly like the desktop actions
(AGENTS mandatory auth gating). No new trust path, no adapter.

### PL-2 — Buy = a new `createPurchase` action (C-02, C-13, C-14)

Add `createPurchase` to `app/actions/transactions.ts`:
- **Ledger shape (C-02)**: two correlated rows sharing a `transfer_group_id`,
  category `'purchase'` — a money leg (`kind='money'`, −gp) + an item leg
  (`kind='item'`, +qty, `item_node_id`). Neither is `kind='transfer'` (no
  counterparty). Money leg lands on the PC (sources a/b) or the общак node
  (source c); source (b) emits the shortfall transfer pair first via the
  existing `createExpenseWithStashShortfall` path.
- **Price (FR-011, C-13)**: `charged = round((item.price_gp ??
  defaultPrice[bucket][rarity]) × coefficient[rarity])`. `bucket` = magic vs
  consumable (existing split in `item-default-prices`). Default coefficient 1.
- **Approval (FR-013, C-14)**: `status = approval_required[rarity] ? 'pending'
  : 'approved'`, **funding-agnostic** — a very-rare/legendary buy is pending
  even when self- or общак-funded. Below threshold, self/общак funding
  auto-approves (rule-based self-approval, same audit-CHECK shape 044 uses for
  free-общак).
- **Guards**: item flagged «нельзя купить» (PL-4) → refused; no effective base
  price → refused (C-10); chosen source can't cover `price × qty` → blocked,
  no implicit credit (C-01).
- Quantity threads through unchanged (C-12).

`createTransfer` / `createItemTransfer` keep their existing roles (moves);
`createPurchase` is the only new primitive.

### PL-3 — DM purchase policy in `campaigns.settings` (C-13, C-14)

JSONB, no schema change — mirrors the spec-016 default-prices machinery exactly:
- **`lib/item-purchase-policy.ts`** (new): `type ItemPurchasePolicy = { coefficient:
  Record<RarityKey, number>; approvalRequired: Record<RarityKey, boolean> }`,
  `DEFAULT_ITEM_PURCHASE_POLICY` (coefficient all 1; approval
  common/uncommon/rare=false, very-rare/legendary=true), and
  `parseItemPurchasePolicy(raw)` — reusing `RARITY_KEYS` from
  `item-default-prices`.
- **`updateItemPurchasePolicy(slug, policy)`** in
  `app/c/[slug]/settings/actions.ts` — sibling to `updateItemDefaultPrices`,
  persists to `settings`, DM/owner-gated.
- **`ItemPurchasePolicyEditor`** component on the «Настройки предметов» page —
  a per-rarity row `{coefficient input, approval checkbox}`, debounced-persist
  like `DefaultPricesEditor`. Reads consumed by `createPurchase`.

### PL-4 — «Нельзя купить» flag in item `fields` jsonb (C-15)

A per-item boolean (`no_purchase`) in the item node's `fields`:
- Form: add a `noPurchase` checkbox to `components/item-form-page.tsx`,
  mirroring the existing `requiresAttunement` checkbox (lines 268–276); thread
  through `createItemAction` / `updateItemAction`.
- Grid: a «нельзя купить» indicator column + inline toggle via the existing
  `quickUpdateItemAction` (already calls `invalidateSidebar` + `revalidatePath`,
  `items.ts:509`).
- Reach: excluded from the buy picker (single + set), and a set buy containing a
  flagged item is blocked at buy time (FR-052/FR-032). Moves/equip untouched
  (key on `item_name`, C-10). No migration.

### PL-5 — Equipped: the one new table `pc_equipped` (C-03, C-04)

New table `pc_equipped (pc_id, item_name, loop_number, equipped bool)` —
name-keyed to match the shipped holdings readers (`getPcItemHoldingsTg` groups
by name), per-loop (re-equip each loop, C-04), **not** touching `transactions`
(FR-041). New `setEquipped(pcId, itemName, loopNumber, equipped)` action
(cookie-gated, own-PC or DM). The Mini App inventory renders equipped vs carried;
when net holding for a name hits 0 the row simply isn't rendered (implicitly
un-equipped). `item_node_id` is intentionally *not* the key — node-keyed equip
is a later-spec option (C-03) — but the catalog node is reachable by name for
the attunement join (PL-6).

### PL-6 — Attunement soft cap (C-17)

Derived, not stored. The inventory reader counts a PC's equipped items whose
catalog node carries `item_attributes.requires_attunement = true` (existing
column, mig 055; resolve name → catalog item → attributes). When the count
> **3** the Mini App shows a non-blocking warning плашка («настроено N из 3»).
Equipping is never refused on this basis; un-equipping clears the count. No
separate «настроен» toggle in v1; cap is a constant 3 (a future DM-config
number). Free-text items have no catalog node ⇒ no attunement.

### PL-7 — «Надето» in starter setup (C-18, desktop)

`components/starting-items-editor-client.tsx` gains a per-starting-item
«надето» toggle (carried in the starter config alongside qty). Extend
`applyLoopStartSetup` (`app/actions/starter-setup.ts:468`) so that, on apply, it
writes `pc_equipped` rows for the flagged starting items at the target loop —
the PC begins already wearing its kit. Desktop DM surface; no accounting change;
reuses the PL-5 table. Same loop-scoped model (C-04).

### PL-8 — Sets: a `set` node type with the item list in `fields` (C-05, C-06)

**Decision: a `set` node type, not a dedicated `sets`/`set_items` table.**
Rationale: sets are low-volume, player-authored, campaign-scoped, persist across
loops (templates), and **copy-on-buy (FR-034) makes stale item refs harmless** —
so relational integrity buys little. A `set` node fits the existing graph,
keeps 052 to a single new *table* (`pc_equipped`), and matches the project's
node+jsonb / custom-type ethos. Shape: `fields = { items: [{ itemNodeId, name,
qty }], ownerUserId }`. The `set` node type (its field schema) is seeded for
campaigns like the seven base types in `seed.sql`.
- Actions: `createSet` / `updateSet` / `deleteSet` — edit/delete gated to the
  author (`ownerUserId`) or DM/owner (C-05); create/view/buy open to any player.
- `buySet` → iterate items into a **single batch of `createPurchase`** legs
  sharing one `transfer_group_id`; affordability all-or-nothing against the set
  total (C-06); approval **aggregates by max rarity** — pending if *any*
  constituent rarity requires it (C-16); blocked if any constituent is
  «нельзя купить» (FR-052). One заявка per set buy (FR-031).
- Set-node mutations call `invalidateSidebar` (nodes/node_types touched).

*Fallback (risk R1):* if jsonb item lists prove painful for queries/integrity,
migrate sets to dedicated tables later — reversible, isolated to the storage
layer.

### PL-9 — Edit-on-buy / save-as (C-19)

The buy screen operates on a **working copy** of a set: remove items, change
qty, add another catalog item. Two non-destructive exits:
- **(a) one-off buy** of the adjusted contents (nothing persisted) — a `buySet`
  call over the edited list.
- **(b) save-as a new set** owned by the acting player — a `createSet` from the
  edited list, then optionally buy.
The **source set is never overwritten** on this path (overwriting one's own set
is the separate `updateSet` management path, FR-030). Both exits obey the PL-2
purchase rules.

### PL-10 — Container-model moves + inventory screen (US1)

The per-PC inventory is `getPcItemHoldingsTg` (shipped) rendered as a screen,
extended to carry equipped+attunement (PL-5/6). Moves generalise the 044
one-shot transfer into a **source container → destination container → item →
qty** flow over the existing actions: own↔общак via `put|takeItemFromStash`,
own→PC via `createItemTransfer`. Pickers list only what the source holds and cap
qty at availability (FR-004) — the shipped readers already do this. Quantity is
first-class throughout (C-12); the exact interaction (two-pane/drag) is a design
detail.

### PL-11 — «Мои заявки» view + cancel (C-11 / FR-015)

Action-layer is already done (C-11): `deleteTransaction` / `deleteTransfer`
permit a player to delete only their own `pending` rows, with no balance/holding
effect (readers count `status='approved'`). New work is purely a `/tg` surface:
a «мои заявки» filter on the feed (it already badges pending) + an «Отменить»
button wired to the existing delete. No DM notification on cancel in v1.

### PL-12 — Refresh & invalidation

Mini App = client SPA: optimistic update confirmed by realtime, **no
`revalidatePath`** (044 PL-6). Desktop surfaces (items table, «Настройки
предметов», starter-setup) follow the AGENTS sidebar-invalidation contract;
item-node and set-node mutations call `invalidateSidebar(campaignId)` (item
actions already do — `items.ts`). `pc_equipped`, purchases, and the policy
config are not sidebar entities ⇒ no invalidation needed for them.

---

## 3. Data model / migrations

**One required table + two small seeds.** Everything else is JSONB / existing
columns. All migrations: idempotent (`create … if not exists`, `on conflict do
nothing`), wrapped `BEGIN; … COMMIT;`, ending with a verification `SELECT`
printing ✅/❌, `present_files` on creation, applied by Andrey via Studio (prod)
/ manually on staging.

- **M1 `NNN_pc_equipped.sql`** *(required)* — `create table pc_equipped (pc_id,
  item_name text, loop_number int, equipped bool, …)`, PK/unique on
  `(pc_id, item_name, loop_number)`, index for the per-PC/per-loop read, RLS
  mirroring the membership predicate used elsewhere (read member-wide for the
  Mini App; write own-PC/DM). (C-03/C-04, PL-5/7.)
- **M2 `NNN_purchase_category_seed.sql`** — seed the `'purchase'`
  `scope='transaction'` category for every campaign, like the existing six
  (mig 034/037). Idempotent. Verify the new-campaign seed path also emits it
  (risk R4). (C-02, PL-2.)
- **M3 `NNN_set_node_type.sql`** — seed the `set` node type (field schema) for
  campaigns, matching the base-type seeding in `seed.sql`. (PL-8.)

(M2 + M3 may be folded into one `NNN_spec052_seeds.sql` at Implement.)

**No migration**: DM purchase policy (`campaigns.settings` JSONB),
«нельзя купить» (item `fields` JSONB), attunement (existing
`item_attributes.requires_attunement`), quantity (existing signed `item_qty`,
C-12), starter-equip (writes the M1 table).

---

## 4. File layout (additive)

```
lib/item-purchase-policy.ts        coefficient+approval types/defaults/parse   (new)
lib/queries/ledger-tg.ts           getPcItemHoldingsTg + equipped/attunement   (edit)
app/actions/transactions.ts        + createPurchase                            (edit)
app/actions/equipped.ts            setEquipped (cookie-gated)                  (new)
app/actions/sets.ts                createSet/updateSet/deleteSet/buySet        (new)
app/actions/items.ts               create/updateItemAction thread noPurchase   (edit)
app/actions/starter-setup.ts       applyLoopStartSetup writes pc_equipped      (edit)
app/c/[slug]/settings/actions.ts   + updateItemPurchasePolicy                  (edit)
app/c/[slug]/items/settings/page.tsx  mount ItemPurchasePolicyEditor           (edit)
components/item-purchase-policy-editor.tsx  per-rarity coef+approval editor    (new)
components/item-form-page.tsx      + noPurchase checkbox                       (edit)
components/item-catalog-grid.tsx   «нельзя купить» indicator + quick-toggle    (edit)
components/starting-items-editor-client.tsx  per-item «надето» toggle          (edit)
app/tg/page.tsx                    inventory screen entry                      (edit)
app/tg/_components/ledger-app.tsx  inventory/move/buy/equip/sets/«мои заявки»   (edit)
app/tg/_components/…               new sub-screens as the file grows (buy, set-editor) (new)
supabase/migrations/NNN_pc_equipped.sql                                        (new)
supabase/migrations/NNN_purchase_category_seed.sql                             (new)
supabase/migrations/NNN_set_node_type.sql                                      (new)
```

Conventions (AGENTS.md): cookie `resolveAuth` + `getMembership` + ownership on
every write; named exports for server modules, default for client components;
hand-rolled validators (reuse existing); Tailwind media queries only;
sidebar-invalidation on node mutations; Mini App refreshes client-side.

---

## 5. Implement phasing (preview — task breakdown lands in Tasks)

Story-by-story, each independently shippable with a checkpoint.

- **Phase 0 — foundation**: M1 (`pc_equipped`), M2 (purchase category), M3
  (`set` type); `lib/item-purchase-policy.ts`; `createPurchase` action core.
  vitest on price + approval resolution (coefficient, threshold, funding-agnostic
  pending, no_purchase/no-price guards). Nothing user-visible; de-risks every
  buy/set below.
- **Phase 1 — US1 (P1) containers & moves**: inventory screen; source→dest→item
  →qty move UI over existing actions; «мои заявки» view + cancel (PL-11);
  quantity-as-`×N` polish. Checkpoint: move own↔общак↔PC, cancel a pending.
- **Phase 2a — US2 buy (P2)**: `createPurchase` wired into a `/tg` buy screen;
  desktop `ItemPurchasePolicyEditor` on «Настройки предметов»; «нельзя купить»
  checkbox (form + grid). Checkpoint: buy below threshold auto-approves, above
  goes pending; coefficient applied; flagged item not offered.
- **Phase 2b — US3 equipped + attunement (P2)**: `setEquipped` + inventory
  equipped display; attunement плашка at >3 (PL-6); starter «надето» toggle +
  `applyLoopStartSetup` extension (desktop). Checkpoint: equip persists within
  loop; 4th attunement warns not blocks; starter applies pre-equipped.
- **Phase 3 — US4 sets (P3)**: `set` node CRUD; `buySet` (aggregated approval,
  all-or-nothing); edit-on-buy working copy → one-off buy or save-as (PL-9).
  Checkpoint: buy a set one-tap; edit-on-buy leaves the source set unchanged.

---

## 6. Testing

- **vitest** (CI gate authoritative; `npm run build` hangs in sandbox): price
  resolution (`price_gp ?? default × coefficient`, rounding); approval gate
  (threshold, funding-agnostic pending); no_purchase + no-price exclusion;
  attunement count (equipped × requires_attunement); set-buy approval
  aggregation (max-rarity) + all-or-nothing affordability; edit-on-buy
  copy-on-buy (source unchanged); equip per-loop persistence; `parseItemPurchase
  Policy` defaults.
- **Manual on staging** (E2E): buy own-gold below vs above threshold → auto vs
  pending; общак-funded very-rare → pending (C-14 behavior change); coefficient
  visible; «нельзя купить» hidden from buy yet movable; equip + 4th-attunement
  плашка; starter «надето» → PC starts equipped; set one-tap buy; edit-on-buy →
  source set intact; «мои заявки» cancel removes the pending заявка. Real iOS +
  Android from the pool.

---

## 7. Risks & open checks

1. **Sets storage (PL-8)** — chose `set` node + jsonb item list over dedicated
   tables. Low risk (low volume, copy-on-buy tolerates stale refs); fallback is
   a later migration to relational tables, isolated to the storage layer.
2. **Attunement name-join (PL-5/6)** — `pc_equipped` is name-keyed; attunement
   resolves name → catalog node → `item_attributes`. Renamed/duplicate catalog
   names could misjoin. Verify name→node resolution; free-text items correctly
   carry no attunement.
3. **Approval behavior change (C-14)** — общак-funded high-rarity buys now go
   pending (vs 044's free-общак auto-approve for that path). Intended; note in
   the PR.
4. **`'purchase'` category reach (M2)** — must seed every campaign incl. ones
   created later. Verify the campaign-creation seed path emits `'purchase'`.
5. **`db_max_rows` clamp** — inventory/holdings/sets reads stay on the existing
   paginated/filtered patterns; no unbounded `.range()`.

---

## 8. Constitution / definition of done

Epic constitution honoured: E4 (read any, edit own — applies to inventory/sets),
E6 (faster than paper), E10 (mobile-first; DM config the one desktop exception).
Engine boundary held: equipped is a standalone flag now, engine reads later
(C-07). FR-041 holds — accounting core untouched beyond `createPurchase` + the
new flag/table. Every migration idempotent + verification `SELECT` +
`present_files`. Mini App refreshes client-side (PL-12); desktop honours the
sidebar-invalidation contract. Ships via `claude/052-inventory-containers-sets`
→ staging hand-test → **PR into `main`** (human merges; app code never lands on
`main` directly). Meta/docs (this plan, spec, tasks) commit to `main` directly.
