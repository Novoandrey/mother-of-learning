# Tasks — Inventory: containers, buying, sets & equipped (spec-052)

Derived from `plan.md`. Markers: 🤖 Claude · 🧑 Andrey (operator) · 🌐 dashboard.
Next free migration = **118** (044 took 117). 052 migrations: **118**
`pc_equipped`, **119** `purchase` category, **120** `set` node type (119+120 may
be one file).
**During Implement: one task at a time — `[x]` + brief report + wait before the
next** (project rule). After any `.sql` → `present_files`.
App code (`mat-ucheniya/**` except `*.md`) ships `claude/052-inventory-containers-sets`
→ staging hand-test → **PR into `main`** (never direct). Meta/docs (spec/plan/
tasks) → `main` directly.

## Phase 0 — Foundation (migrations + policy lib + purchase core)
- [ ] **T001** 🤖 `supabase/migrations/118_pc_equipped.sql` — `create table if
  not exists pc_equipped (pc_id uuid, item_name text, loop_number int, equipped
  bool, …)`; unique `(pc_id, item_name, loop_number)`; index for per-PC/per-loop
  read; RLS — member-wide `SELECT` (Mini App), write own-PC/DM (mirror
  `is_member` + ownership). Idempotent; `BEGIN;`/`COMMIT;`; ✅/❌ verification
  `SELECT` (table + policy exist) → `present_files`. (C-03/C-04, PL-5)
- [ ] **T002** 🤖 `supabase/migrations/119_purchase_category_seed.sql` — seed the
  `'purchase'` `scope='transaction'` category for every campaign, like the
  existing six (mig 034/037); idempotent (`on conflict do nothing`); ✅/❌
  `SELECT` → `present_files`. ⚠️ Also confirm the **new-campaign** seed path
  emits `'purchase'` (risk R4). (C-02, PL-2)
- [ ] **T003** 🤖 `supabase/migrations/120_set_node_type.sql` — seed the `set`
  node type (field schema: `items` list + `ownerUserId`) for campaigns, matching
  base-type seeding in `seed.sql`; idempotent; ✅/❌ `SELECT` → `present_files`.
  (PL-8) *(may be folded into 119.)*
- [ ] **T004** 🤖 `lib/item-purchase-policy.ts` — `type ItemPurchasePolicy =
  { coefficient: Record<RarityKey, number>; approvalRequired: Record<RarityKey,
  boolean> }`, `DEFAULT_ITEM_PURCHASE_POLICY` (coef all 1; approval
  common/uncommon/rare=false, very-rare/legendary=true), `parseItemPurchase
  Policy(raw)` — reuse `RARITY_KEYS` from `item-default-prices`. (C-13/C-14, PL-3)
- [ ] **T005** 🤖 Vitest for T004 (defaults; missing keys back-filled;
  coefficient/approval shape). [needs T004]
- [ ] **T006** 🤖 `app/actions/transactions.ts` — add `createPurchase`:
  money leg (−gp) + item leg (+qty, `item_node_id`) sharing one
  `transfer_group_id`, category `'purchase'`; money leg on PC (a/b) or общак (c),
  source (b) via `createExpenseWithStashShortfall` first; price `=
  round((price_gp ?? defaultPrice[bucket][rarity]) × coefficient[rarity])`;
  `status = approvalRequired[rarity] ? 'pending' : 'approved'` (funding-agnostic);
  guards — «нельзя купить», no effective price (C-10), source can't cover →
  blocked (no credit). Cookie `resolveAuth`. (C-02/C-13/C-14, PL-1/2) [needs
  T001, T004]
- [ ] **T007** 🤖 Vitest for `createPurchase` logic (price resolution +
  rounding; approval threshold, funding-agnostic pending; no_purchase / no-price
  / affordability guards). [needs T006]

## Phase 1 — US1 containers & moves + «мои заявки» (P1)
- [ ] **T008** 🤖 `lib/queries/ledger-tg.ts` — extend `getPcItemHoldingsTg` to
  also return **equipped** (join `pc_equipped` by name + loop) and **attunement**
  (resolve `item_name` → catalog node → `item_attributes.requires_attunement`,
  mig 055). Free-text ⇒ no node ⇒ no attunement. (PL-5/6) [needs T001]
- [ ] **T009** 🤖 `app/tg/_components/ledger-app.tsx` — per-PC **inventory
  screen**: holdings as `×N`, carried vs equipped sections (equipped wired in
  Phase 2b). (FR-001, C-12) [needs T008]
- [ ] **T010** 🤖 Container-model **move UI** (source container → destination →
  item → qty) over existing `put|takeItemFromStash` / `createItemTransfer`;
  pickers list only real holdings, qty capped at availability. (FR-002/003/004,
  PL-10) [needs T009]
- [ ] **T011** 🤖 **«Мои заявки»** view (filter own `pending`) + «Отменить»
  wired to existing `deleteTransaction` / `deleteTransfer` (own pending only, no
  balance effect). (FR-015, C-11, PL-11) [needs T009]
- [ ] **T012** 🤖 ✅ **CHECKPOINT US1**: move own↔общак↔PC with qty; cancel a
  pending заявка; balances unchanged. Demoable end-to-end.

## Phase 2a — US2 buy + DM purchase policy (P2)
- [ ] **T013** 🤖 `app/c/[slug]/settings/actions.ts` — add
  `updateItemPurchasePolicy(slug, policy)` (sibling to `updateItemDefaultPrices`),
  DM/owner-gated, persists to `campaigns.settings`. (FR-050/051, PL-3) [needs
  T004]
- [ ] **T014** 🤖 `components/item-purchase-policy-editor.tsx` — per-rarity row
  `{coefficient input, approval checkbox}`, debounced persist like
  `DefaultPricesEditor`; mount on `app/c/[slug]/items/settings/page.tsx`.
  (FR-050/051) [needs T013]
- [ ] **T015** 🤖 `components/item-form-page.tsx` + `app/actions/items.ts` — add
  `noPurchase` checkbox (mirror `requiresAttunement`), thread through
  `createItemAction` / `updateItemAction` (item `fields` jsonb). (FR-052, C-15,
  PL-4)
- [ ] **T016** 🤖 `components/item-catalog-grid.tsx` — «нельзя купить» indicator
  column + inline toggle via existing `quickUpdateItemAction` (already
  invalidates sidebar). (FR-052, PL-4) [needs T015]
- [ ] **T017** 🤖 `app/tg/_components/ledger-app.tsx` — **buy screen**: pick item
  + qty, funding source (own / shortfall / общак), confirm → `createPurchase`;
  exclude no_purchase + no-price items; optimistic + rollback. (FR-010..014, US2)
  [needs T006]
- [ ] **T018** 🤖 ✅ **CHECKPOINT US2**: buy below threshold auto-approves, above
  → pending; coefficient applied; «нельзя купить» not offered; DM editor
  persists. Demoable.

## Phase 2b — US3 equipped + attunement + starter (P2)
- [ ] **T019** 🤖 `app/actions/equipped.ts` — `setEquipped(pcId, itemName,
  loopNumber, equipped)`, cookie-gated own-PC/DM, writes `pc_equipped`. (FR-020,
  PL-5) [needs T001]
- [ ] **T020** 🤖 `app/tg/_components/ledger-app.tsx` — inventory **equipped
  display** (carried vs «Надето») + equip/un-equip control; row hidden when net
  holding hits 0. (FR-020/021/022, C-03) [needs T019, T009]
- [ ] **T021** 🤖 **Attunement плашка**: count equipped × `requires_attunement`
  (from T008); show «настроено N из 3» warning at > 3, **non-blocking**. (FR-024,
  C-17, PL-6) [needs T020]
- [ ] **T022** 🤖 `components/starting-items-editor-client.tsx` — per-item
  **«надето»** toggle in the starter config. (FR-025, C-18, PL-7)
- [ ] **T023** 🤖 `app/actions/starter-setup.ts` — extend `applyLoopStartSetup`
  to write `pc_equipped` rows for flagged starting items at the target loop.
  (FR-025, C-18, PL-7) [needs T001, T022]
- [ ] **T024** 🤖 ✅ **CHECKPOINT US3**: equip persists within loop; 4th
  attunement warns not blocks; starter «надето» → PC begins equipped. Demoable.

## Phase 3 — US4 sets + edit-on-buy (P3)
- [ ] **T025** 🤖 `app/actions/sets.ts` — `createSet` / `updateSet` / `deleteSet`
  on the `set` node type (`fields` jsonb `items` + `ownerUserId`); edit/delete
  gated author|DM (C-05); create/view/buy open to any player; `invalidateSidebar`
  on mutation. (FR-030/033, PL-8) [needs T003]
- [ ] **T026** 🤖 `app/tg/_components/ledger-app.tsx` — **sets list** + create /
  edit / delete UI (own-or-DM edit). (FR-030/033) [needs T025]
- [ ] **T027** 🤖 `buySet` (in `app/actions/sets.ts`) — batch of `createPurchase`
  legs sharing one `transfer_group_id`; all-or-nothing affordability against the
  set total (C-06); approval **aggregates by max rarity** (C-16); blocked if any
  constituent «нельзя купить» (FR-052). One заявка per set buy. (FR-031/032)
  [needs T006, T025]
- [ ] **T028** 🤖 **Edit-on-buy**: buy screen edits a working copy (add / remove
  / change qty) → (a) one-off `buySet` over the edited list (no persist) or (b)
  **save-as a new set** (`createSet`); source set never overwritten. (FR-035,
  C-19, PL-9) [needs T027]
- [ ] **T029** 🤖 ✅ **CHECKPOINT US4**: one-tap set buy (aggregated approval);
  edit-on-buy leaves the source set intact. Demoable.

## Phase 4 — Staging E2E + ship
- [ ] **T030** 🧑 Deploy `claude/052-inventory-containers-sets` → `staging`;
  apply **118 / 119 / 120** to staging by hand (prod via Studio at ship). [needs
  green Phase 0–3]
- [ ] **T031** 🧑 E2E on staging: buy below vs above threshold (auto vs pending);
  общак-funded very-rare → pending (C-14 behavior change); coefficient visible;
  «нельзя купить» hidden from buy yet movable/equippable; equip + 4th-attunement
  плашка; starter «надето» → PC starts equipped; set one-tap buy; edit-on-buy →
  source set intact; «мои заявки» cancel removes the pending. Real iOS + Android.
  [needs T030]
- [ ] **T032** 🤖 Open PR `claude/052-inventory-containers-sets` → `main` (human
  merges). [needs green staging]

## Tails (deferred — not blockers)
- [ ] **(tail) T033** 🤖 Move-UI interaction polish (two-pane / drag) once the
  basic source→dest→item→qty flow is proven (FR-003 leaves the exact interaction
  to design).
- [ ] **(tail) T034** 🤖 DM-curated «official» sets (C-05 deferred) + a
  DM-configurable attunement cap number (C-17 leaves 3 constant for v1).

## Sequencing
Phase 0 (migrations written + `createPurchase` + policy lib; vitest-gated, no
live DB) → US1 moves (mostly UI over shipped actions) → US2 buy + DM config →
US3 equipped/attunement/starter → US4 sets + edit-on-buy → Phase 4 ship.
`createPurchase` (T006) is the spine — single buy (T017) and set buy (T027) both
route through it. Migrations apply to staging at **T030** (none block local
vitest/typecheck); prod via Studio at ship. CI gate is authoritative
(`npm run build` hangs in the sandbox — rely on lint + typecheck + vitest).
