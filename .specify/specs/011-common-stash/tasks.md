# Tasks: Common Stash (Общак)

**Input**: `spec.md`, `plan.md` in `specs/011-common-stash/`
**Updated**: 2026-04-24
**Tests**: `vitest` on pure utilities (`stash-aggregation`,
`shortfall-resolver`). Everything else = manual walkthrough
against Acceptance Scenarios in `spec.md` (same convention as
spec-009 / spec-010).

## Organization

Phase 1 (migration) blocks every follow-up: the `stash` node
type and the `item_qty` column must exist before any query or
action compiles.

Phase 2 is **parallelizable pure code** — aggregation +
resolver + validators + their vitest specs. All `[P]` within
the phase.

Phases 3–6 are the **sequential backend spine**: types →
queries → seeder → transfer actions → stash wrappers. Order
matters because each layer imports the one below it.

Phases 7–8 are **parallelizable UI building blocks**
(inventory grid, stash buttons, shortfall prompt). None
touches another file in these phases.

Phases 9–12 are the **UI integration layer**: transaction
form, wallet block, actor bar, and finally the pages. These
need the backend (Phases 3–6) and the building blocks
(Phases 7–8) done.

Phase 13 is close-out.

Device contract (from plan `## Device & Mode Contract`): the
put/take flow and the transaction form stay **mobile-first**;
the stash page and the item grid's table layout are
**desktop-primary**, responsive-degraded on mobile.

## Format: `[ID] [P?] [Priority] Description (file: path)`

`[P]` = can run in parallel with other `[P]` tasks in the same
phase (no shared file). Priority: P1 = MVP, P2 = important,
P3 = stretch.

---

## Phase 1: Migration

**Purpose**: Register the `stash` node_type globally, seed one
stash node per existing campaign, add `transactions.item_qty`
with a `>= 1` CHECK.

**⚠️ Idempotent & mostly non-destructive.** One `ALTER TABLE
transactions ADD COLUMN` (default 1, backfills every existing
row). New `node_types` row and new `nodes` rows only.

- [ ] **T001** [P1] Write `mat-ucheniya/supabase/migrations/035_stash_and_item_qty.sql`:
  - Wrap everything in `begin; … commit;`
  - `INSERT INTO node_types (id, campaign_id, slug, label, icon, default_fields, sort_order, is_base)` with `campaign_id = NULL`, `slug = 'stash'`, `label = 'Общак'`, `icon = '💰'`, `default_fields = '{}'::jsonb`, `sort_order = 50`, `is_base = true`; `ON CONFLICT (campaign_id, slug) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon` (idempotent upsert)
  - `INSERT INTO nodes (campaign_id, type_id, title, fields) SELECT c.id, nt.id, 'Общак', '{}'::jsonb FROM campaigns c CROSS JOIN node_types nt WHERE nt.slug='stash' AND nt.is_base=true AND NOT EXISTS (SELECT 1 FROM nodes n WHERE n.campaign_id=c.id AND n.type_id=nt.id)` (one stash per campaign, idempotent)
  - `ALTER TABLE transactions ADD COLUMN item_qty int NOT NULL DEFAULT 1 CHECK (item_qty >= 1)` (backfills existing rows to 1)
  - Header comment explains: spec-011 scope; rollback = drop column + delete stash nodes + delete node_type; forward-compat note that spec-015 will add `item_node_id uuid nullable references nodes(id)` later with no backfill
  - **Call `present_files` after writing** (project rule)
- [ ] **T002** [P1] User applies migration 035 in Supabase. After success, user runs `scripts/invalidate-sidebar-remote.ts mat-ucheniya` (or equivalent curl) to refresh the sidebar cache so the new stash node becomes visible immediately. Wait for confirmation before Phase 2.

**Checkpoint**: `node_types` has a global `stash` row; every campaign has exactly one `type='stash'` node; `transactions.item_qty` exists on every row with value 1.

---

## Phase 2: Pure utilities

**Purpose**: vitest-covered pure functions — no I/O, no
Supabase, no React. Safe to refactor later.

- [ ] **T003** [P] [P1] Create `mat-ucheniya/lib/stash-aggregation.ts`:
  - Export type `StashItemLeg` (transactionId, transferGroupId, itemName, qty, direction, loopNumber, dayInLoop, createdAt, sessionId/sessionTitle, droppedByPcId/droppedByPcTitle, comment, authorUserId/authorDisplayName)
  - Export `aggregateStashLegs(legs: StashItemLeg[], keyFn?: (leg) => string): StashItem[]` — sums incoming minus outgoing per key (default `keyFn = (leg) => leg.itemName`); drops zero-qty items; flags negative-qty items with `warning`; instances = incoming legs only, newest first
  - Pure, no async, no imports of `@/lib/supabase`
- [ ] **T004** [P] [P1] Extend `mat-ucheniya/lib/transaction-resolver.ts`:
  - Add `computeShortfall(walletGp: number, expenseGp: number, stashGp: number): { shortfall: number; toBorrow: number; remainderNegative: number }`
  - `shortfall = max(0, |expenseGp| − walletGp)`; `toBorrow = min(shortfall, stashGp)`; `remainderNegative = shortfall − toBorrow`
  - Pure; no changes to existing functions
- [ ] **T005** [P] [P1] Extend `mat-ucheniya/lib/transaction-validation.ts`:
  - Add `validateItemQty(qty: number): string | null` — rejects non-integer, `< 1`, `NaN`
  - Add `validateItemTransfer(input: { itemName: string; qty: number }): string | null` — rejects empty/whitespace-only itemName, delegates qty to `validateItemQty`
- [ ] **T006** [P] [P1] Create `mat-ucheniya/lib/__tests__/stash-aggregation.test.ts` — 7 cases from plan `## Testing`:
  1. empty input → empty output
  2. single incoming leg → qty 1, one instance
  3. two incoming same name → qty aggregated, two instances
  4. three incoming + one outgoing → qty 2, instances = only incoming
  5. only outgoing legs → qty < 0, warning flag set, item kept in output
  6. different names stay separate (no fuzzy matching)
  7. custom `keyFn` including a hypothetical `itemNodeId` — forward-compat canary
- [ ] **T007** [P] [P1] Create `mat-ucheniya/lib/__tests__/shortfall-resolver.test.ts` — 5 cases from plan `## Testing`:
  1. no shortfall (wallet covers expense) → all zeros
  2. shortfall, stash rich → `toBorrow = shortfall`, `remainderNegative = 0`
  3. shortfall, stash poor → `toBorrow = stashGp`, `remainderNegative = shortfall − stashGp`
  4. shortfall, stash empty → `toBorrow = 0`, `remainderNegative = shortfall`
  5. zero expense → all zeros, no NaN

**Checkpoint**: `npm run test` passes with all new cases green; existing spec-010 tests still green.

---

## Phase 3: Types + query layer

**Purpose**: Canonical types and the two query helpers the
stash page and form will call.

- [ ] **T008** [P1] Create `mat-ucheniya/lib/stash.ts` — types section:
  - `StashMeta` (nodeId, title, icon)
  - `StashItem` (itemName, qty, latestLoop, latestDay, instances[])
  - `StashItemInstance` (transactionId, transferGroupId, qty, droppedBy, loopNumber, dayInLoop, session, comment, author, createdAt)
  - `StashContents` (wallet, items, recentTransactions)
  - Re-export the `StashItemLeg` from `lib/stash-aggregation.ts` for convenience
- [ ] **T009** [P1] Extend `mat-ucheniya/lib/transactions.ts`:
  - Add `itemQty: number` to `Transaction` and `TransactionWithRelations` types
  - Update every `.select('...')` string to include `item_qty` (in `listRecentByPc`, `getLedgerPage`, `getTransactionById`, `getTransferPair`)
  - Map `item_qty` → `itemQty` in every row normaliser
- [ ] **T010** [P1] Extend `mat-ucheniya/lib/stash.ts` — `getStashNode(campaignId)`:
  - Query `nodes` joined to `node_types` for the single `type='stash'` node in the campaign
  - Return `StashMeta | null`
  - Wrap the body in React `cache()` (import from `react`) so a single request → one DB hit
- [ ] **T011** [P1] Extend `mat-ucheniya/lib/stash.ts` — `getStashContents(campaignId, loopNumber)`:
  - Three queries in `Promise.all`:
    1. Wallet sum over `(actor_pc_id = stashId, loop_number, status='approved')` for all 4 denominations
    2. All `kind='item'` rows where `transfer_group_id` is not null AND one leg's `actor_pc_id = stashId` in `loop_number` — join to `nodes` (PC titles, sessions) and to `auth.users` via the existing helper for author display names; shape each row into a `StashItemLeg` (direction = 'in' if `actor_pc_id = stashId`, else 'out')
    3. Top-10 recent transactions with `actor_pc_id = stashId` in `loop_number`, using the same `TransactionWithRelations` shape as the PC page
  - Pipe leg-array through `aggregateStashLegs` for the `items` field
  - Return `StashContents`

**Checkpoint**: `npm run typecheck` clean; `getStashNode(mat-ucheniya_id)` returns the seeded stash from Phase 1.

---

## Phase 4: Campaign init seeder

**Purpose**: Newly-created campaigns (via
`initializeCampaignFromTemplate`) automatically get a stash
node — just like they get seed categories.

- [ ] **T012** [P1] Create `mat-ucheniya/lib/seeds/stash.ts`:
  - Export `ensureCampaignStash(supabase, campaignId): Promise<{ created: boolean; nodeId: string }>`
  - Look up the existing stash node for the campaign; if present, return `{ created: false, nodeId }`
  - Otherwise, insert one row into `nodes` with `type_id = (select id from node_types where slug='stash' and is_base=true)`, `title = 'Общак'`, `fields = {}`
  - Idempotent shape mirrors `seedCampaignCategories` / `seedCampaignSrd`
- [ ] **T013** [P1] Modify `mat-ucheniya/lib/campaign-actions.ts`:
  - After the existing `seedCampaignCategories(supabase, campaignId)` call, call `ensureCampaignStash(supabase, campaignId)`
  - If `created === true`, the existing `invalidateSidebar(campaignId)` below the seeders already covers the sidebar refresh (no new invalidation call needed — the seeders all run before that line)

**Checkpoint**: a dry-run of `initializeCampaignFromTemplate` on a hypothetical fresh campaign produces one stash node.

---

## Phase 5: Transfer server actions

**Purpose**: Extend the money-transfer writer with an item
sibling; add `itemQty` to the existing single-row create /
update paths.

- [ ] **T014** [P1] Extend `mat-ucheniya/app/actions/transactions.ts` — `createItemTransfer`:
  - Export `ItemTransferInput` type (campaignId, senderPcId, recipientPcId, itemName, qty, categorySlug, comment, loopNumber, dayInLoop, sessionId?)
  - `createItemTransfer(input): Promise<ActionResult<{ groupId: string }>>`
  - Validate: same-loop (reuse `validateTransfer`), `validateItemTransfer`, `validateDayInLoop`
  - Ownership: reuse the existing `resolveAuth` + `isPcOwner` for the **sender** only (same rule as money `createTransfer`)
  - Generate `transfer_group_id = crypto.randomUUID()`
  - One `admin.from('transactions').insert([legA, legB])` with both legs `kind='item'`, `item_name = input.itemName`, `item_qty = input.qty`, all coin amounts 0, shared `transfer_group_id`
  - Return `{ ok: true, groupId }` or an error
- [ ] **T015** [P1] Extend `mat-ucheniya/app/actions/transactions.ts` — `itemQty` on create/update/delete:
  - Add `itemQty?: number` to `CreateTransactionInput` (default 1 when omitted; required when `kind='item'`)
  - When `kind='item'`, validate via `validateItemQty`; reject if missing/invalid
  - Pass `item_qty` into the insert statement
  - `updateTransaction`: if `itemQty` provided AND row is `kind='item'`, update it; apply transfer-pair atomicity (if the row has a `transfer_group_id`, also update the sibling leg's `item_qty` in the same action)

**Checkpoint**: from a Node REPL (or a one-off test), calling `createItemTransfer` produces two rows with matching `item_qty` and a shared group id; `updateTransaction` of one item leg updates both.

---

## Phase 6: Stash server actions

**Purpose**: Convenience wrappers the UI calls — hides the
"which node is the stash" resolution and the shortfall-shortcut
three-row sequence.

- [ ] **T016** [P1] Create `mat-ucheniya/app/actions/stash.ts` — money wrappers:
  - `'use server'` header
  - Export `putMoneyIntoStash(input: { campaignId, actorPcId, amountGp, comment, loopNumber, dayInLoop, sessionId? })`: resolves stash node, calls `createTransfer({ senderPcId: actorPcId, recipientPcId: stash.nodeId, amountGp, categorySlug: 'transfer', ... })`; returns the action result
  - Export `takeMoneyFromStash(...)`: same shape, reversed sender/recipient
- [ ] **T017** [P1] Extend `mat-ucheniya/app/actions/stash.ts` — item wrappers:
  - `putItemIntoStash(input: { campaignId, actorPcId, itemName, qty, comment, categorySlug?, loopNumber, dayInLoop, sessionId? })`: calls `createItemTransfer` with the PC as sender and stash as recipient; default `categorySlug='loot'`
  - `takeItemFromStash(...)`: same shape, reversed
- [ ] **T018** [P1] Extend `mat-ucheniya/app/actions/stash.ts` — `getStashAggregate`:
  - Small helper for the client form: returns the stash's current aggregate gp for a given `(campaignId, loopNumber)`
  - Implementation: one SUM query scoped to `(actor_pc_id = stashId, loop_number, status='approved')`; returns just the aggregated number
  - Used by `<TransactionForm>` to decide whether to render the shortfall prompt
- [ ] **T019** [P1] Extend `mat-ucheniya/app/actions/stash.ts` — `createExpenseWithStashShortfall`:
  - Input: `{ campaignId, actorPcId, amountGp (magnitude), categorySlug, comment, loopNumber, dayInLoop, sessionId? }`
  - Fetch stash node, PC wallet, stash wallet in `Promise.all`
  - Call `computeShortfall(walletGp, amountGp, stashGp)`
  - If `toBorrow > 0`: call `createTransfer` stash→PC for `toBorrow`, category `'transfer'`, comment prefixed with `'Покрытие: '`. Capture the group id.
  - Then call `createTransaction` for the full expense (`-Math.abs(amountGp)`) on the PC with the user's `categorySlug` + `comment`
  - Return `{ ok: true, transferGroupId (or null), expenseId, borrowed, remainder }`; partial-failure case: if transfer succeeded and expense failed, surface the error but leave the transfer in place (documented in plan)

**Checkpoint**: manual one-shot from a dev REPL — `putMoneyIntoStash` with Marcus 20gp produces a visible pair in `/accounting`.

---

## Phase 7: UI building blocks — inventory grid

**Purpose**: Generic, stash-agnostic components. Designed so
the PC-inventory grid (future spec) just remounts them.

- [ ] **T020** [P] [P1] Create `mat-ucheniya/components/inventory-grid.tsx` (server):
  - Props: `{ items: InventoryGridItem<K>[]; emptyMessage?: string; canEdit?: boolean; onDelete?: (item) => Promise<void> }`
  - Render empty state when `items.length === 0` with the `emptyMessage` (default `'Пусто'`) and no table
  - Responsive: on `md+` render as a table with columns (item name, qty, latest drop, dropped by, comment preview); on mobile render stacked cards
  - Delegate each row to `<InventoryGridRow>` (client)
  - Uses STYLE.md tokens for spacing/color
- [ ] **T021** [P] [P1] Create `mat-ucheniya/components/inventory-grid-row.tsx` (client):
  - Local state: `isExpanded`
  - Click/Tap on row toggles expand; `Enter` / `Space` keyboard support
  - Only one row expanded at a time — accept `expandedKey` + `onExpand(key)` from parent OR manage internal state (decide inside task; internal state is simpler for MVP — one-row-expanded-at-a-time is a polish, document whichever you pick)
  - Expanded state renders a sub-list of `instances[]` with per-leg loop/day, author, full comment, session link
  - Warning badge when `item.warning` is set (FR-012 negative-qty)
  - Optional delete affordance when `canEdit`

**Checkpoint**: mount the grid in a Storybook-like test page or the stash page (later phase) and confirm expand/collapse works.

---

## Phase 8: UI building blocks — stash buttons + shortfall prompt

**Purpose**: Small, focused, stash-specific components. Both
are client components; both wrap existing sheets / primitives.

- [ ] **T022** [P] [P1] Create `mat-ucheniya/components/stash-buttons.tsx` (client):
  - Props: `{ campaignId, actorPcId, stashNodeId, currentLoopNumber (null = disabled), defaultDay, defaultSessionId }`
  - Two `<button>` elements side by side: "Положить в Общак" and "Взять из Общака"
  - Each opens `<TransactionFormSheet>` with `initialTransferDirection='put-into-stash'` or `'take-from-stash'`
  - Disabled state when `currentLoopNumber === null` (hint "Отметьте петлю как текущую")
  - Mobile-first: big tap targets, full-width on narrow viewports
- [ ] **T023** [P] [P1] Create `mat-ucheniya/components/shortfall-prompt.tsx` (client):
  - Props: `{ shortfallGp: number; stashGp: number; onAcceptBorrow: () => void; onDeclineBorrow: () => void }`
  - Three visual modes (all from plan `## UI Components`):
    1. stash rich (`stashGp >= shortfallGp`) — "Не хватает N gp; добрать из общака?" + two buttons
    2. stash poor (`0 < stashGp < shortfallGp`) — "Не хватает N gp; в общаке только M gp; добрать M + (N−M) в минус?" + two buttons
    3. stash empty (`stashGp === 0`) — "Не хватает N gp; общак пуст. Сохранить (персонаж уйдёт в минус)?" + two buttons (one confirms, one cancels the whole save)
  - Warning-color banner styling (use existing token from STYLE.md); never a modal

**Checkpoint**: visual smoke-check on three mock states in the form.

---

## Phase 9: Transaction form integration

**Purpose**: Add qty input, stash-pinned transfer mode, and the
shortfall prompt to the existing form. All three additive.

- [ ] **T024** [P1] Modify `mat-ucheniya/components/transaction-form.tsx` — qty input for `kind='item'`:
  - When kind is `'item'`, render an integer stepper input below the item name input with min=1, default=1
  - Hidden for kind `'money'` / `'transfer'`
  - Client-side validation via `validateItemQty` (reuse from Phase 2)
- [ ] **T025** [P1] Modify `mat-ucheniya/components/transaction-form.tsx` — stash-pinned mode:
  - New prop `initialTransferDirection?: 'put-into-stash' | 'take-from-stash' | null`
  - When set: start the form in transfer kind, hide the recipient picker, show a read-only chip "→ Общак" or "← Общак"
  - On save, dispatch to the correct stash action based on current kind + direction: `putMoneyIntoStash` / `takeMoneyFromStash` / `putItemIntoStash` / `takeItemFromStash` (import from `@/app/actions/stash`)
  - Kind switcher still works (can flip money ↔ item within stash-pinned mode); transfer kind is disabled (stash transfers are not PC↔PC)
- [ ] **T026** [P1] Modify `mat-ucheniya/components/transaction-form.tsx` — shortfall prompt integration:
  - Only active when kind is `'money'` AND `sign = '-'` AND `amountGp > 0` AND NOT in stash-pinned mode
  - On every amount change, compute `shortfall = Math.max(0, amountGp − walletGp)` locally from the already-available wallet (no extra fetch)
  - When `shortfall > 0`, fetch the stash aggregate lazily (via `getStashAggregate` server action; memoize by `(campaignId, loopNumber)` until the actor or loop changes)
  - Render `<ShortfallPrompt>` below the form fields when `shortfall > 0`
  - Two save paths in submit handler: if prompt accepted → `createExpenseWithStashShortfall`; if declined → plain `createTransaction` (spec-010 baseline)
- [ ] **T027** [P1] Modify `mat-ucheniya/components/transaction-form-sheet.tsx`:
  - Add `initialTransferDirection` prop to the sheet's props type
  - Pass it through to `<TransactionForm>`

**Checkpoint**: manual test — open the form from a PC page, enter −10gp with wallet 3gp; expect the prompt to appear; tapping "Да" creates two rows (transfer + expense).

---

## Phase 10: Wallet block generalization

**Purpose**: Same component renders for PCs and the stash.

- [ ] **T028** [P] [P1] Modify `mat-ucheniya/components/wallet-block.tsx`:
  - Rename prop `pcId` → `actorNodeId` at the component boundary
  - Propagate to the internal query — `getWallet(actorNodeId, loopNumber)` (the function already takes a generic `pcId: string` that is just passed to the WHERE clause; rename the parameter for clarity is optional here)
  - Empty-state caption stays generic ("нет транзакций в этой петле")
  - Update every call site (only the PC catalog page today — `app/c/[slug]/catalog/[id]/page.tsx`) to pass `actorNodeId`
- [ ] **T029** [P] [P1] Modify `mat-ucheniya/components/wallet-block-client.tsx`:
  - Same rename, same prop propagation
  - No behaviour change

**Checkpoint**: the PC page's wallet still renders correctly post-rename; typecheck clean.

---

## Phase 11: Ledger actor bar

**Purpose**: Stash appears in the actor dropdown; put/take
buttons render when a PC actor is selected.

- [ ] **T030** [P1] Modify `mat-ucheniya/components/ledger-actor-bar.tsx`:
  - Extend `availablePcs` input shape to include the stash node (or accept a separate `stashNode: StashMeta | null` prop; pick one in the task — `stashNode` as a separate prop is cleaner because it avoids polluting PC-typed code paths)
  - Add the stash as an option in the actor dropdown (sorted at the bottom or pinned to the top — pick one; top with a `💰` icon is more discoverable)
  - When the selected actor is a PC, render `<StashButtons>` in the bar's action row next to the existing income/expense buttons
  - When the selected actor is the stash, hide `<StashButtons>` (stash↔stash is nonsensical) — the existing "+ Транзакция" button keeps opening the regular form with `actor = stash`
  - Update `app/c/[slug]/accounting/page.tsx` to fetch the stash node (via `getStashNode`) and pass it into the bar

**Checkpoint**: the `/accounting` page actor dropdown lists the stash; selecting a PC shows the Put / Take buttons.

---

## Phase 12: Pages

**Purpose**: Stash has its own page; catalog routes the stash
node to it.

- [ ] **T031** [P1] Create `mat-ucheniya/app/c/[slug]/accounting/stash/page.tsx`:
  - `export const dynamic = 'force-dynamic'`
  - Server-side fetches: `getStashNode(campaignId)`, current loop, `getStashContents(campaignId, currentLoopNumber)`, membership (for `canEdit`)
  - If no stash (should never happen post-migration — but defensive): render an empty-state with a "seed stash" CTA (calls `ensureCampaignStash` server action; or just instruct to contact the DM — safer)
  - Layout per plan `## UI Components → stash page`:
    1. Header: `💰 Общак` + current loop/day frontier
    2. `<WalletBlock actorNodeId={stash.nodeId} ...>` (wallet + top-10 recent)
    3. Divider
    4. Items section header with `+ Транзакция` button (opens `<TransactionFormSheet>` with `actorPcId=stash.nodeId`)
    5. `<InventoryGrid items={stashContents.items} ...>`
  - Mobile-primary lay­out adapts to desktop table at `md+`
- [ ] **T032** [P1] Modify `mat-ucheniya/app/c/[slug]/catalog/[id]/page.tsx`:
  - If the node is `type='stash'`, early-return a Next.js `redirect('/c/' + slug + '/accounting/stash')` (single source of truth for stash UI)
  - If the node is `type='character'`, mount `<StashButtons>` alongside the existing `+ Транзакция` button (fetch stash node once on the page; pass props per T022 signature)

**Checkpoint**: all seven P1 user stories work end-to-end on mat-ucheniya:
- US1 put money, US2 take money, US3 shortfall shortcut (rich/poor/empty stash variants), US4 put item, US5 take item (with qty), US6 stash page renders, US7 new-loop view is empty but ledger history preserved, US8 ledger filter by stash.

---

## Phase 13: Close-out

- [ ] **T033** [P1] Run `npm run lint`, `npm run typecheck`, `npm run test` in `mat-ucheniya/`. Fix anything that falls out.
- [ ] **T034** [P1] Hand-walkthrough on mat-ucheniya production — execute US1 through US8 from `spec.md` verbatim. Record any bugs in backlog as BUG-0NN.
- [ ] **T035** [P2] Update project docs:
  - `NEXT.md`: move "Spec-011" from "следующий приоритет" to "в проде"; update last-applied migration to `035`
  - `backlog.md`: add TECH-00X "Rename `actor_pc_id` → `actor_node_id`" (open question 1 from plan); add TECH-00Y "Categories: keep or kill (decide in spec-015)" (this chat's mini-discussion); if US-level bugs surfaced in T034, log them
  - `chatlog/YYYY-MM-DD-chatNN-spec-011-stash.md` per chatlog/README.md template (what was built, migrations, key decisions — qty column, universal wipe, forward-compat with spec-015)
- [ ] **T036** [P1] Commit + push. Commit message: `feat(stash): ship spec-011 common stash (migrations 035)`.

**Final checkpoint**: the feature is live on Vercel; `NEXT.md` reflects the new state; `backlog.md` has the deferred TECH items; `chatlog/` has the entry.

---

## Parallelization summary

Heaviest parallel blocks (single developer can ship these in
one sitting if they want):

- **Phase 2** — 5 tasks, all `[P]`: you can write
  aggregation, resolver extension, validator extension, and
  both test files in any interleaving.
- **Phase 7** — 2 tasks, both `[P]`: generic grid + row.
- **Phase 8** — 2 tasks, both `[P]`: stash buttons + shortfall
  prompt.
- **Phase 10** — 2 tasks, both `[P]`: wallet block renames in
  two sibling files.

Sequential blocks (order matters strongly):

- **Phase 1 → 2 → 3 → 4 → 5 → 6** — backend spine.
- **Phase 9** (transaction form) depends on Phase 2 (validators),
  Phase 5 (createItemTransfer), Phase 6 (stash wrappers + shortfall
  action), Phase 8 (shortfall prompt).
- **Phase 11** depends on Phases 8 (stash buttons) and 10
  (wallet block rename).
- **Phase 12** depends on everything above.
