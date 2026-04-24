# Tasks: Loop Start Setup

**Input**: `spec.md`, `plan.md` in `specs/012-loop-start-setup/`
**Updated**: 2026-04-24
**Tests**: `vitest` on pure utilities (resolver, diff, affected-
row identifier, validators). Everything else = manual
walkthrough against Acceptance Scenarios in `spec.md` (same
convention as spec-009 / spec-010 / spec-011).

## Organization

Phase 1 (migration) blocks every follow-up: the three new
tables, the three `transactions` columns, and the two triggers
must exist before any query, helper, or server action compiles
correctly.

Phases 2–3 are **parallelizable pure code** — types + helpers +
validators with their vitest specs. All `[P]` within each phase.
Zero DB / Supabase imports.

Phases 4–6 are the **sequential backend spine**: read queries →
config-edit actions → the apply action. Later phases import
earlier ones.

Phase 7 is **PC-create integration** — a small cross-cutting
touch to the existing node-create flow.

Phases 8–10 are **UI integration**: the loop banner + confirm
dialog (P1), the PC starter-config block (P1), the campaign
starter-config page (P1). The banner and dialog depend on the
apply action (Phase 6).

Phase 11 is **P2 polish**: the autogen badge on ledger rows and
the autogen filter chip. Can ship in the same PR as P1 or land
separately.

Phase 12 is close-out.

Device contract (from plan `## Device & Mode Contract`): the
banner, the dialog, the campaign config page, and the PC
config block's DM variant are **desktop-primary**. The PC
config block's player variant (loan-flag toggle + read-only
summary) is **mobile-first**. The autogen badge is both; it
must not change row height on mobile.

## Format: `[ID] [P?] [Priority] Description (file: path)`

`[P]` = can run in parallel with other `[P]` tasks in the
same phase (no shared file). Priority: P1 = MVP, P2 =
important, P3 = stretch.

---

## Phase 1: Migration

**Purpose**: Create `campaign_starter_configs`,
`pc_starter_configs`, `autogen_tombstones`; add 3 columns and
2 triggers on `transactions`; seed 2 new category slugs per
campaign.

**⚠️ Idempotent.** Tables use `create table if not exists`,
`insert ... where not exists`; columns use `alter table ...
add column if not exists` (Postgres 9.6+); triggers dropped-
then-created. One `ALTER TABLE transactions ADD COLUMN
autogen_hand_touched boolean NOT NULL DEFAULT false` backfills
every existing row to `false`.

- [x] **T001** [P1] Write `mat-ucheniya/supabase/migrations/037_loop_start_setup.sql`:
  - Wrap everything in `begin; ... commit;`
  - **1. `campaign_starter_configs`**: table with all columns per plan `## Data Model`; seed one row per existing campaign with `insert ... select ... where not exists`; RLS `csc_select` (`is_member`) + `csc_modify` (`is_dm_or_owner`)
  - **2. `pc_starter_configs`**: table per plan; seed one row per existing PC (join `nodes` × `node_types` where `slug='character'`); RLS `pcsc_select` + `pcsc_modify` via sub-`exists` against PC's campaign
  - **3. `autogen_tombstones`**: table + `idx_autogen_tombstones_source`; RLS `atb_select` (`is_member`) + no public write policy (admin-only)
  - **4. `transactions` columns**: `autogen_wizard_key text`, `autogen_source_node_id uuid references nodes(id) on delete cascade`, `autogen_hand_touched boolean not null default false`
  - **5. Partial index**: `idx_tx_autogen_source_wizard on transactions(autogen_source_node_id, autogen_wizard_key) where autogen_source_node_id is not null`
  - **6. Triggers**:
    - `mark_autogen_hand_touched()` function + `trg_tx_autogen_hand_touched` trigger (BEFORE UPDATE, WHEN new.autogen_wizard_key IS NOT NULL OR old.autogen_wizard_key IS NOT NULL)
    - `record_autogen_tombstone()` function + `trg_tx_autogen_tombstone` trigger (AFTER DELETE, WHEN old.autogen_wizard_key IS NOT NULL)
    - Both functions guarded by `current_setting('spec012.applying', true) = 'on'` early return
  - **7. Seed categories**: `insert into categories (campaign_id, scope, slug, label, sort_order)` two rows per campaign — `starting_money / Стартовые деньги / 15` and `starting_items / Стартовые предметы / 25` — `on conflict (campaign_id, scope, slug) do nothing`
  - Header comment explains: spec-012 scope; rollback sequence (`drop trigger / drop function / drop index / alter table drop column / drop table`); forward-compat note about spec-015's `item_node_id` and IDEA-054's `item_location_node_id` / `carried_state` being added later with no backfill
  - **Call `present_files` after writing** (project rule)
- [x] **T002** [P1] User applies migration 037 in Supabase. Wait for confirmation before Phase 2. (No sidebar invalidation needed — no `nodes`/`node_types` changes.)

**Checkpoint**: the three new tables exist with seeds; `transactions` has 3 new columns + partial index; two triggers installed; 2 new categories per campaign.

---

## Phase 2: Types

**Purpose**: Canonical type definitions used by every follow-up
file. Pure — no imports of `@/lib/supabase`.

- [x] **T003** [P] [P1] Create `mat-ucheniya/lib/starter-setup.ts` (types only — helpers and queries come later):
  - Export `StarterItem = { name: string; qty: number }`
  - Export `CampaignStarterConfig = { campaignId, loanAmount: CoinSet, stashSeedCoins: CoinSet, stashSeedItems: StarterItem[], updatedAt }`
  - Export `PcStarterConfig = { pcId, takesStartingLoan: boolean, startingCoins: CoinSet, startingItems: StarterItem[], updatedAt }`
  - Export `WizardKey = 'starting_money' | 'starting_loan' | 'stash_seed' | 'starting_items'` (kept narrow on purpose; spec-013 adds `'encounter_loot'` by extending this union)
  - Export `AutogenMarker = { wizardKey: WizardKey; sourceNodeId: string; handTouched: boolean }`
  - Export `ApplyResult`, `ApplySummary`, `AffectedRow` (per plan `## Server Layer → Types`)
  - Export `DesiredRow`, `ExistingAutogenRow`, `Tombstone`, `RowDiff` (internal types used by resolver/diff; exported so helpers can import)
  - Re-import `CoinSet` from `lib/transactions.ts`
  - No implementations — types only
- [x] **T004** [P] [P1] Extend `mat-ucheniya/lib/transactions.ts`:
  - Add optional `autogen: AutogenMarker | null` to `Transaction` and `TransactionWithRelations` types (imported from `./starter-setup`)
  - Update `mapTransactionRow` (or equivalent) to populate `autogen` from the three new DB columns (`autogen_wizard_key`, `autogen_source_node_id`, `autogen_hand_touched`)
  - Every existing `.select(...)` call in query helpers needs the three new columns added to the projection — list of files to touch, carry out each:
    - `lib/transactions.ts` (any top-level selects)
    - `lib/stash.ts` (stash queries that return rows)
    - anywhere else the existing `TRANSACTION_COLUMNS` constant is referenced
  - This task is shared-file-heavy (touches ~5 files) — **NOT parallelizable with T005**

**Checkpoint**: types compile; `Transaction.autogen` is visible to consumers; all existing queries return the new columns.

---

## Phase 3: Pure helpers (parallelizable)

**Purpose**: vitest-covered pure functions — no I/O, no
Supabase, no React.

- [x] **T005** [P] [P1] Create `mat-ucheniya/lib/starter-setup-resolver.ts`:
  - Export `canonicalKey(wizardKey: WizardKey, row: { actorPcId: string; itemName?: string | null }): string`
    - For `starting_money` / `starting_loan` / `stash_seed`: `${wizardKey}:${actorPcId}`
    - For `starting_items`: `${wizardKey}:${actorPcId}:${itemName}`
  - Export `resolveDesiredRowSet(params: { loopNodeId: string; stashNodeId: string; campaignId: string; campaignCfg: CampaignStarterConfig; pcCfgs: PcStarterConfig[] }): DesiredRow[]`
    - For each PC cfg: starting-money row if any coin > 0, starting-loan row if `takesStartingLoan && any loan coin > 0`, starting-items rows for each entry in `startingItems`
    - For the stash: seed row if any coin > 0, seed-items rows for each entry
    - Every `DesiredRow` includes `category_slug` (`starting_money`, `credit`, `starting_items` — for stash_seed wizard, picks one of `starting_money`/`starting_items` per row), amounts, `canonicalKey`
    - Rows returned in deterministic order (sort by canonical key) so snapshot tests are stable
  - Pure, no async, no `@/lib/supabase` imports
- [x] **T006** [P] [P1] Create `mat-ucheniya/lib/__tests__/starter-setup-resolver.test.ts`:
  - `canonicalKey` — stable across inputs; distinct keys for distinct rows
  - `resolveDesiredRowSet` with empty campaign cfg + empty PC cfgs → empty
  - Full cfg (10 PCs all takingLoan, 100 gp starting, 200 gp loan) → 20 rows
  - One PC with `takesStartingLoan=false` → 9 credit rows, 10 money rows
  - One PC with zero starting coins → no money row (but loan row still present if flag on)
  - One PC with 3 starter items → 3 item rows
  - Stash seed with 50 gp + 2 items → 3 rows total for stash actor
- [x] **T007** [P] [P1] Create `mat-ucheniya/lib/starter-setup-diff.ts`:
  - Export `diffRowSets(desired: DesiredRow[], existing: ExistingAutogenRow[]): RowDiff`
  - `RowDiff = { toInsert: DesiredRow[]; toUpdate: UpdatePair[]; toDelete: ExistingAutogenRow[]; unchanged: ExistingAutogenRow[] }` where `UpdatePair = { existing: ExistingAutogenRow; desired: DesiredRow }`
  - Match by `canonicalKey(wizardKey, row)`
  - For `toUpdate`: only include if amount/qty/category/comment actually differs (no-op updates don't count)
  - Pure
- [x] **T008** [P] [P1] Create `mat-ucheniya/lib/__tests__/starter-setup-diff.test.ts`:
  - No changes → `{ toInsert: [], toUpdate: [], toDelete: [], unchanged: [...] }`
  - Config amount changed → one `UpdatePair`, rest unchanged
  - PC added → `toInsert` has new rows, rest unchanged
  - PC removed from desired (e.g. `takesStartingLoan` flipped off) → `toDelete` has the credit row
  - Item name changed (`arrows` → `bolts`) → one delete (`arrows`) + one insert (`bolts`)
  - Orphan row (existing has an actor_pc_id not in desired) → stays in `unchanged` (FR-014 — orphans from deleted PCs aren't touched)
- [x] **T009** [P] [P1] Create `mat-ucheniya/lib/starter-setup-affected.ts`:
  - Export `identifyAffectedRows(diff: RowDiff, tombstones: Tombstone[]): AffectedRow[]`
  - For every `UpdatePair` in `diff.toUpdate` where `existing.autogenHandTouched === true` → add entry with `reason: 'hand_edited'`, current = formatted existing amount, config = formatted desired amount
  - For every `toDelete` where `existing.autogenHandTouched === true` → add entry with `reason: 'hand_edited'`, current = formatted existing, config = `null` (will be deleted)
  - For every tombstone whose `canonicalKey` matches a `DesiredRow` in `diff.toInsert` → add entry with `reason: 'hand_deleted'`, current = `null`, config = formatted desired
  - Tombstones that don't match any insert are ignored (the DM hand-deleted AND the config agrees it shouldn't exist)
  - Pure
- [x] **T010** [P] [P1] Create `mat-ucheniya/lib/__tests__/starter-setup-affected.test.ts`:
  - Clean diff (no hand-touches, no tombstones) → `[]`
  - Hand-touched row in `toUpdate` → returned with `hand_edited`
  - Hand-touched row staying untouched (in `unchanged`) → NOT returned
  - Tombstone with matching desired insert → returned with `hand_deleted`
  - Tombstone with no matching desired insert → NOT returned
  - Multiple affected rows → returned in a stable order (sort by actor title)
- [x] **T011** [P] [P1] Create `mat-ucheniya/lib/starter-setup-validation.ts`:
  - Export `validateCoinSet(c: unknown): { ok: true; value: CoinSet } | { ok: false; error: string }` — integers, non-negative
  - Export `validateStarterItems(items: unknown): { ok: true; value: StarterItem[] } | { ok: false; error: string }` — array, each `{name: non-empty string, qty: integer >= 1}`
  - Export `isKnownWizardKey(s: unknown): s is WizardKey`
  - Pure
- [x] **T012** [P] [P1] Create `mat-ucheniya/lib/__tests__/starter-setup-validation.test.ts`:
  - Valid / invalid `validateCoinSet` inputs (negative amounts, strings, missing fields, non-integers)
  - Valid / invalid `validateStarterItems` (empty name, qty=0, qty=-1, non-integer qty, non-array)
  - `isKnownWizardKey` accepts the four spec-012 keys, rejects `'encounter_loot'` (not yet!) and arbitrary strings

**Checkpoint**: `npm run test` passes all new pure-unit specs; no imports from `@/lib/supabase` in any of T005–T012's output files.

---

## Phase 4: Read queries

**Purpose**: DB-read helpers used by UI and by the apply
action. Sequential: each depends on the types from Phase 2.

- [x] **T013** [P1] Add `getCampaignStarterConfig(campaignId)` to `mat-ucheniya/lib/starter-setup.ts`:
  - Single `select` from `campaign_starter_configs` where `campaign_id = $1`
  - Returns `CampaignStarterConfig`; if row missing (defensive — shouldn't happen post-migration), return a default-zeroed config rather than throwing
  - Server-side only; uses user-context supabase client
- [x] **T014** [P1] Add `getPcStarterConfigsForCampaign(campaignId)` to `mat-ucheniya/lib/starter-setup.ts`:
  - Join `pc_starter_configs` × `nodes` × `node_types` filtered by `nodes.campaign_id = $1` AND `node_types.slug = 'character'`
  - Returns `Array<PcStarterConfig & { pcTitle: string }>`
  - Used by both the apply action and the campaign config page
- [x] **T015** [P1] Add `getLoopSetupStatus(loopNodeId)` to `mat-ucheniya/lib/starter-setup.ts`:
  - `select 1 from transactions where autogen_source_node_id = $1 and autogen_wizard_key in ('starting_money','starting_loan','stash_seed','starting_items') limit 1`
  - Returns `{ hasAutogenRows: boolean }`
  - Feeds the banner's "show / hide" decision
- [x] **T016** [P1] Add `getExistingAutogenRows(loopNodeId)` to `mat-ucheniya/lib/starter-setup.ts`:
  - `select * from transactions where autogen_source_node_id = $1 and autogen_wizard_key in (spec-012 keys)`
  - Maps to `ExistingAutogenRow[]` (with coin amounts, item name, item qty, hand_touched flag)
- [x] **T017** [P1] Add `getTombstones(loopNodeId)` to `mat-ucheniya/lib/starter-setup.ts`:
  - `select * from autogen_tombstones where autogen_source_node_id = $1 and autogen_wizard_key in (spec-012 keys)`
  - Maps to `Tombstone[]`

**Checkpoint**: read helpers compile; can be called from a Node REPL against a local Supabase.

---

## Phase 5: Config write actions

**Purpose**: server actions for DM edits and the narrow player
edit. Each wraps an auth gate + admin-client write.

- [x] **T018** [P1] Create `mat-ucheniya/app/actions/starter-setup.ts` with `updateCampaignStarterConfig(campaignId, patch)`:
  - `'use server'` at top
  - Auth gate: `requireAuth()` + `getMembership(campaignId)` → role must be `'dm' | 'owner'`
  - Validate `patch.loanAmount` via `validateCoinSet` (if present); `patch.stashSeedCoins` same; `patch.stashSeedItems` via `validateStarterItems`
  - Admin-client UPDATE into `campaign_starter_configs`
  - `revalidatePath(\`/c/\${slug}/accounting/starter-setup\`)` (fetch slug from campaign row first)
  - Returns the updated `CampaignStarterConfig`
- [x] **T019** [P1] Add `updatePcStarterConfig(pcId, patch)` to same file:
  - Auth gate: requireAuth + look up PC's campaign + require DM role on that campaign
  - Validate `patch.startingCoins` + `patch.startingItems`
  - **Important**: reject any `patch` that includes `takesStartingLoan` (that's a separate action — T020). Return an error if caller passes it.
  - Admin-client UPDATE; revalidatePath the PC page
- [x] **T020** [P1] Add `setPcTakesStartingLoan(pcId, value)` to same file:
  - Auth gate: requireAuth. Look up PC's campaign.
  - Allow if: `getMembership(campaignId).role` is `'dm' | 'owner'` **OR** the user owns this PC (check `node_pc_owners` or whatever ownership table — see existing `canUserEditPc` helper if present)
  - Reject otherwise
  - Admin-client UPDATE `pc_starter_configs SET takes_starting_loan = $value WHERE pc_id = $pcId`
  - revalidatePath the PC page

**Checkpoint**: three new server actions compile; DM can edit all three; player can only call `setPcTakesStartingLoan` on their own PC.

---

## Phase 6: Apply action (the core of spec-012)

**Purpose**: `applyLoopStartSetup` — two-phase, diff-based,
idempotent.

- [x] **T021** [P1] Add `applyLoopStartSetup(loopNodeId, opts)` to `mat-ucheniya/app/actions/starter-setup.ts`:
  - Signature: `async function applyLoopStartSetup(loopNodeId: string, opts?: { confirmed?: boolean }): Promise<ApplyResult>`
  - Step 1 — auth: requireAuth; load loop node (including its campaign_id); require DM role on campaign
  - Step 2 — load config: `getCampaignStarterConfig` + `getPcStarterConfigsForCampaign` + `getStashNode` (existing from spec-011)
  - Step 3 — compute desired: `resolveDesiredRowSet({ loopNodeId, stashNodeId, campaignId, campaignCfg, pcCfgs })`
  - Step 4 — load existing: `getExistingAutogenRows(loopNodeId)`
  - Step 5 — load tombstones: `getTombstones(loopNodeId)`
  - Step 6 — compute diff: `diffRowSets(desired, existing)`
  - Step 7 — compute affected: `identifyAffectedRows(diff, tombstones)`
  - Step 8 — if `affected.length > 0 && !opts?.confirmed` → `return { needsConfirmation: true, affected }` (no writes!)
  - Step 9 — execute the diff. Use the admin client inside a custom RPC or a `.rpc('exec', ...)`-style transaction; easiest approach: a Postgres function `apply_loop_start_setup(loop_node_id uuid, desired_rows jsonb, rows_to_delete uuid[], tombstone_source uuid)` that wraps the whole thing in a DB transaction with `set local spec012.applying = 'on'` at the top. Call from Node via admin client.
    - Alternative if RPC is painful: sequential admin-client calls, all with the `spec012.applying` setting set. Wrap in a try/catch that rolls back manually on error. BUT we lose atomicity. **Prefer the RPC.**
  - Step 10 — the RPC inserts new rows, updates changed rows (setting `autogen_hand_touched = false` explicitly), deletes obsolete rows, deletes consumed tombstones, commits. Returns a row count summary.
  - Step 11 — `revalidatePath(\`/c/\${slug}/loops\`)` + `revalidatePath(\`/c/\${slug}/accounting\`)`
  - Step 12 — return `{ ok: true, summary }`
  - Error paths: if the RPC throws (e.g. FK violation, connection drop) → rethrow as a user-friendly error
- [x] **T022** [P1] Write the RPC function in a follow-up migration snippet (append to `037_loop_start_setup.sql` or a separate file `037b_apply_rpc.sql` at DM preference; default: append). SQL:
  ```sql
  create or replace function apply_loop_start_setup(
    p_loop_node_id uuid,
    p_to_insert jsonb,   -- array of rows to insert; each element is the full column set
    p_to_update jsonb,   -- array of { id, amount_*, item_qty, item_name, category_slug, comment }
    p_to_delete uuid[]   -- row IDs to delete
  ) returns table(inserted int, updated int, deleted int, tombstones_cleared int)
  language plpgsql
  security definer
  as $$
  declare
    v_inserted int := 0;
    v_updated int := 0;
    v_deleted int := 0;
    v_tomb int := 0;
  begin
    perform set_config('spec012.applying', 'on', true);  -- set local
    -- INSERTs
    if jsonb_array_length(p_to_insert) > 0 then
      insert into transactions (...) select ... from jsonb_to_recordset(p_to_insert) as ...;
      get diagnostics v_inserted = row_count;
    end if;
    -- UPDATEs
    -- (use a loop or a bulk CTE; reset autogen_hand_touched = false)
    -- DELETEs
    if array_length(p_to_delete, 1) > 0 then
      delete from transactions where id = any(p_to_delete);
      get diagnostics v_deleted = row_count;
    end if;
    -- tombstone cleanup
    delete from autogen_tombstones
      where autogen_source_node_id = p_loop_node_id
        and autogen_wizard_key in ('starting_money','starting_loan','stash_seed','starting_items');
    get diagnostics v_tomb = row_count;
    return query select v_inserted, v_updated, v_deleted, v_tomb;
  end;
  $$;
  ```
  - **Call `present_files` after writing** if it's a separate migration file; if appended to `037`, just commit
  - Grant EXECUTE on the function to `authenticated` (the admin client bypasses RLS anyway but the function lives in the DB namespace)
- [x] **T023** [P1] User applies the RPC migration. Wait for confirmation before testing the apply action.

**Checkpoint**: `applyLoopStartSetup` callable from Node; two-phase confirmation works; reapply is idempotent.

---

## Phase 7: PC-create integration

**Purpose**: new PCs get a default `pc_starter_configs` row.

- [x] **T024** [P2] Find the existing PC-create server action (likely `lib/campaign-actions.ts` or `app/actions/node-actions.ts` — grep for `createPcNode` or similar). Add a post-create hook that inserts a default row into `pc_starter_configs`:
  - If the existing code path doesn't have a clean extension point, create `mat-ucheniya/lib/seeds/pc-starter-config.ts` with `ensurePcStarterConfig(supabase, pcId)` — idempotent insert with `on conflict do nothing`
  - Call it from the PC-create flow right after the node is inserted
  - If `createPcNode` is wrapped in a transaction, include the starter-config insert in the same transaction

**Checkpoint**: creating a new PC node results in a new `pc_starter_configs` row with defaults (`takes_starting_loan = true`, zero coins, empty items).

---

## Phase 8: UI — Banner + confirm dialog (P1)

**Purpose**: the DM's first-apply affordance on the loop page.

- [x] **T025** [P1] Create `mat-ucheniya/components/loop-start-setup-banner.tsx` (server component):
  - Props: `{ loopNodeId: string; campaignSlug: string; campaignId: string }`
  - Internal: awaits `getMembership(campaignId)` and `getLoopSetupStatus(loopNodeId)`
  - Returns `null` if role not in `['dm','owner']` OR `hasAutogenRows === true`
  - Otherwise renders the banner markup per plan `## UI Components → DM-facing`, embedding `<ApplyStarterSetupButton>` client component
- [x] **T026** [P1] Create `mat-ucheniya/components/apply-starter-setup-button-client.tsx`:
  - `'use client'`
  - Props: `{ loopNodeId: string }`
  - Local state: `loading`, `confirmData: AffectedRow[] | null`, `error: string | null`
  - `onClick` → calls `applyLoopStartSetup(loopNodeId)`:
    - If `needsConfirmation` → set `confirmData = affected`, open dialog
    - If `ok` → toast success, `router.refresh()`
    - If thrown → show error toast
  - Renders `<button>Применить</button>` + `<ApplyConfirmDialog>` when `confirmData !== null`
- [x] **T027** [P1] Create `mat-ucheniya/components/apply-confirm-dialog.tsx`:
  - `'use client'`
  - Props: `{ affected: AffectedRow[]; onConfirm: () => void; onCancel: () => void }`
  - Renders a modal with a table: actor title | wizard label (localized: «Стартовые деньги», «Стартовый кредит», etc) | current value | станет
  - Two buttons: "Подтвердить и пересобрать" (primary) + "Отмена"
  - Accessibility: esc/backdrop cancels; focus traps; `<button>` semantics
- [x] **T028** [P1] Mount the banner in `mat-ucheniya/app/c/[slug]/loops/page.tsx`:
  - Import `<LoopStartSetupBanner>`
  - Render it in the right pane, immediately above `<LoopProgressBar>`, when `currentLoop` is set. Pass `loopNodeId = currentLoop.nodeId`, `campaignSlug = slug`, `campaignId = campaign.id`.
  - If `currentLoop.nodeId` isn't currently in the `loops` query shape (spec-009's shape might only carry `number`, not `id`), extend the `getLoops` query to include the underlying node id.

**Checkpoint**: navigating to `/loops?loop=N` on a loop with no autogen rows shows the banner; clicking "Применить" generates rows; no banner after success. Hand-edit → reapply → confirm dialog appears with affected row listed.

---

## Phase 9: UI — PC starter config block (P1)

**Purpose**: DM edits starter config per PC; PC owner flips their
loan flag.

- [x] **T029** [P1] Create `mat-ucheniya/components/pc-starter-config-block.tsx` (server component that branches to variants):
  - Props: `{ pcId: string; campaignId: string; mode: 'dm' | 'player' | 'read-only' }`
  - Awaits `getPcStarterConfig(pcId)` (new single-row helper — add it to `lib/starter-setup.ts` if not already there as part of T013)
  - Branches to render the three variants per plan `## UI Components → DM-facing` and `## Player-facing`
  - For `mode='dm'`: embeds client components `<StartingCoinPickerClient>`, `<StartingItemsEditorClient>`, and a full-interactive `<LoanFlagToggleClient>`
  - For `mode='player'`: embeds only `<LoanFlagToggleClient>` (interactive) + a read-only summary of coins + items
  - For `mode='read-only'` (non-owner, non-DM): returns `null` (the block is hidden entirely)
- [x] **T030** [P] [P1] Create `mat-ucheniya/components/loan-flag-toggle-client.tsx`:
  - `'use client'`
  - Props: `{ pcId: string; initialValue: boolean; interactive: boolean }`
  - If not interactive: renders static "Берёт стартовый кредит: ✅ / ❌"
  - If interactive: toggle component with optimistic local state, calls `setPcTakesStartingLoan` on change, reverts on error (toast)
- [x] **T031** [P] [P1] Create `mat-ucheniya/components/starting-coin-picker-client.tsx`:
  - `'use client'`
  - Props: `{ pcId: string; initialCoins: CoinSet }` — or generalize to take an update handler so the same component works for the campaign-level editor (stash seed)
  - 4-input (cp/sp/gp/pp); on save, calls `updatePcStarterConfig({ startingCoins })` or the campaign equivalent (inject via prop)
- [x] **T032** [P] [P1] Create `mat-ucheniya/components/starting-items-editor-client.tsx`:
  - `'use client'`
  - Props: `{ pcId: string; initialItems: StarterItem[]; onSave: (items) => Promise<void> }` — same generalization trick; stash seed reuses this
  - Editable list: add row (name + qty defaulting to 1), edit name/qty inline, remove row
  - Validation via `validateStarterItems` before calling `onSave`
  - Optimistic updates; revert on error
- [x] **T033** [P1] Mount `<PcStarterConfigBlock>` in `mat-ucheniya/app/c/[slug]/catalog/[id]/page.tsx`:
  - Only when the node's `type.slug === 'character'`
  - Compute `mode` from membership + PC ownership:
    - `role in ['dm','owner']` → `'dm'`
    - Else if user owns this PC → `'player'`
    - Else → `'read-only'`
  - Render below the existing Wallet block (per plan device contract)

**Checkpoint**: DM sees the full editor on any PC page; PC owner sees the loan-flag toggle + read-only summary on their own PC; other players see nothing.

---

## Phase 10: UI — Campaign starter config page (P1)

**Purpose**: DM's central place to edit loan amount + stash seed.

- [x] **T034** [P1] Create `mat-ucheniya/app/c/[slug]/accounting/starter-setup/page.tsx`:
  - `export const dynamic = 'force-dynamic'`
  - Auth: requireAuth + getMembership → role must be dm/owner (redirect otherwise)
  - Load: `getCampaignStarterConfig(campaignId)`
  - Renders three cards per plan `## UI Components → CampaignStarterConfigEditor`:
    1. Стартовый кредит (coin picker, reuses `<StartingCoinPickerClient>` with a `saveToCampaign` handler prop)
    2. Общак — стартовые монеты (same component, different handler)
    3. Общак — стартовые предметы (reuses `<StartingItemsEditorClient>`)
  - Page title and breadcrumb: Campaign → Бухгалтерия → Стартовый сетап
- [x] **T035** [P2] Add a nav link "Стартовый сетап" to the accounting section. Find the existing accounting nav (likely in `components/accounting-nav.tsx` or a subnav inside `app/c/[slug]/accounting/layout.tsx`); add an entry pointing at `./starter-setup`. DM-only visibility.

**Checkpoint**: `/c/[slug]/accounting/starter-setup` opens for DM; edits save and revalidate; non-DM gets a 403 / redirect.

---

## Phase 11: UI — Autogen badge + filter chip (P2)

**Purpose**: visibility + filterability of autogen rows.

- [ ] **T036** [P] [P2] Create `mat-ucheniya/components/autogen-badge-client.tsx`:
  - `'use client'`
  - Props: `{ wizardKey: WizardKey; sourceTitle: string }`
  - Renders a tiny "⚙" icon; on hover/tap opens a `<Tooltip>` (existing helper) with one-line text: e.g. "Стартовые деньги · Петля №5"
  - Labels map from `WizardKey` to Russian strings via a const in the component
- [ ] **T037** [P2] Extend `mat-ucheniya/components/transaction-row.tsx` to accept an optional `autogen?: { wizardKey: WizardKey; sourceTitle: string }` prop and render `<AutogenBadge>` before the day chip when set. Do not change row height; add `ml-1` / `mr-1` spacing only.
- [ ] **T038** [P] [P2] Extend `mat-ucheniya/components/ledger-filters.tsx` with the `autogen` filter chip:
  - Three states: `all | only | none` (default `all`)
  - URL-driven: `?autogen=only` etc.
  - When state ≠ `all`, render as an active chip in collapsed-filters view
- [ ] **T039** [P2] Extend `mat-ucheniya/lib/transactions.ts` `getLedgerPage` (or equivalent) to accept the `autogen` filter and append the appropriate `WHERE autogen_wizard_key IS [NOT] NULL` clause. Uses the new partial index.
- [ ] **T040** [P2] Hydrate the `autogen` prop for every row in `transaction-list-client.tsx` (or wherever rows are mapped from query results). Needs the `sourceTitle` — a tiny join (`getNodeTitleById`) or precompute the map in the server component once per page.

**Checkpoint**: autogen rows render with a badge; filter chip toggles visibility; tooltip shows wizard + source.

---

## Phase 12: Close-out

- [ ] **T041** [P1] Run `npm run lint` in `mat-ucheniya/`. Fix every warning.
- [ ] **T042** [P1] Run `npm run test` in `mat-ucheniya/`. All new vitest specs (T006, T008, T010, T012) pass. Re-run after fixing anything.
- [ ] **T043** [P1] Run `npm run build` in `mat-ucheniya/`. Fix every type error. Zero regressions.
- [ ] **T044** [P1] Manual walkthrough against `spec.md` Acceptance Scenarios:
  - US1.1–US1.6 (apply, banner, misclick-safe create)
  - US2.1–US2.3 (loan flag off — Lex case)
  - US3.1–US3.8 (reapply, confirmation dialog, hand-edit, hand-delete, empty-diff reapply)
  - US4 (new PC mid-loop, reapply catches them up)
  - US5 (starter items including unique narrative items)
  - US6 (autogen badge + filter chip)
  - US7 (loop delete cascades autogen rows)
  - Record any gaps in `open_questions` of plan.md, to revisit
- [ ] **T045** [P1] Update `NEXT.md`:
  - Move "spec-012 Loop start setup" from "Следующий приоритет" to "В проде сейчас"
  - Next priority → spec-013 (encounter loot distribution; fifth autogen wizard)
  - Note the `autogen_*` columns and triggers as shared infrastructure
- [ ] **T046** [P1] Add `chatlog/YYYY-MM-DD-chatNN-spec-012-implement.md` per `chatlog/README.md` template
- [ ] **T047** [P1] Commit + push:
  - Descriptive commit messages per phase (single squash OK if preferred)
  - Push to `main`

**Checkpoint**: spec-012 is in production. DM can set up a starter config once per campaign, click "Применить" on new loops, and get a ready-to-play ledger state in < 30 seconds. Player can flip their character's loan flag. Hand-edits are safe (no silent overwrites). Next spec can reuse the autogen layer for encounter loot with zero schema changes.

---

## Parallelizable task groups

| Phase | Tasks that can run in parallel |
|---|---|
| 2 | T003 (types) + T004 (transactions.ts extension) — actually NOT parallelizable: T004 imports from T003 |
| 3 | T005+T006, T007+T008, T009+T010, T011+T012 — four parallel pairs (helper + test each) |
| 5 | T018, T019, T020 — same file but independent functions; OK in parallel if using separate append-commits, else sequential |
| 9 | T030, T031, T032 — three independent client components |
| 11 | T036 + T038 — different files; T037/T039/T040 are dependents |

## Acceptance-scenario → task map (for T044 walkthrough)

| Spec scenario | Verified by |
|---|---|
| US1.1 — Apply generates 20 rows | T021 + T025/T026 + T028 |
| US1.2 — Lex's flag off → 9 credit rows | T020 + T021 + spec-002 resolver semantics (T005) |
| US1.3 — Stash seed generates rows | T005 + T021 |
| US1.4 — Empty config → zero rows, no error | T005 (empty-case test T006) + T021 |
| US1.5 — Prep loop in advance, no rows until click | T025 (banner) + T021 (explicit trigger) |
| US1.6 — Misclick-safe create + delete | T001 cascade on `autogen_source_node_id` |
| US2.* — Loan flag variations | T020 + T005 + T021 |
| US3.1–3.4 — Reapply happy paths | T021 + T007 (diff) |
| US3.5 — Hand-deleted row, confirmation dialog | T001 trigger + T017 + T009 + T027 |
| US3.6 — Force refresh via reapply (add new PC) | T021 + T007 |
| US3.7 — Hand-edited row, confirmation dialog | T001 trigger + T009 + T027 |
| US3.8 — Confirm resets hand-touched flags | T022 RPC `set_config('spec012.applying','on',true)` |
| US4 — New PC mid-loop | T024 + T021 |
| US5 — Starter items including unique names | T032 + T005 |
| US6 — Autogen badge + filter | T036 + T037 + T038 + T039 |
| US7 — Loop delete cascades | T001 FK `on delete cascade` |

