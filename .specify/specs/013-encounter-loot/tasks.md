# Tasks: Encounter Loot Distribution

**Input**: `spec.md`, `plan.md` in `specs/013-encounter-loot/`
**Created**: 2026-04-25
**Tests**: `vitest` on pure utilities (coin-split, resolver,
validation). Everything else = manual walkthrough against
Acceptance Scenarios in `spec.md` (same convention as spec-009 –
spec-012).

## Organization

**Phase 1** is a **prep query**: verify no `(campaign_id,
title)` duplicates among existing encounters in mat-ucheniya
production data. The migration's backfill matches by this pair;
duplicates require a tiebreaker pass before the migration can
ship safely. Blocks Phase 2.

**Phase 2** is the migration: mirror-node infrastructure +
`encounter_loot_drafts` table in one file (`039_*`). Blocks
every follow-up — the helpers, actions, and UI all need the
schema to exist.

**Phase 3** is a **carve-out refactor of spec-012**: extract
the reconcile core from `apply-loop-start-setup.ts` into a
shared `lib/autogen-reconcile.ts`. Spec-012 must continue to
work bit-for-bit — the 135 existing vitest tests are the
proof. Blocks Phase 5–6.

**Phase 4** is **parallelisable pure code**: types + helpers +
validators with vitest specs. All `[P]` within the phase. Zero
Supabase imports.

**Phase 5** is the **sequential backend spine**: read queries
→ draft-edit actions → the apply action. Later tasks import
earlier ones.

**Phase 6** is **UI integration**: the panel (DM-only) + the
read-only summary (player) + the line editors + the wiring on
the encounter page.

**Phase 7** is **cross-cutting filters**: encounter mirror
nodes must be hidden from sidebar / catalog / typeaheads.
Independent of UI; can ship in parallel with Phase 6.

**Phase 8** is **smoke + RLS + trigger tests** + manual
acceptance walkthrough.

**Phase 9** is close-out.

Device contract (from plan `## Device & Mode Contract`): the
DM panel is **desktop-primary** (inline on encounter page,
right column on `lg+`, below grid on smaller). The
player-facing summary is **mobile-first** — small, read-only,
links out to the ledger. The autogen badge is unchanged
from spec-012 (already both modes).

## Format: `[ID] [P?] [Priority] Description (file: path)`

`[P]` = can run in parallel with other `[P]` tasks in the
same phase (no shared file). Priority: P1 = MVP, P2 =
important, P3 = stretch.

A task is `[x]` only when its acceptance check passes:
- migrations: applied + verified via SQL probes
- pure helpers: vitest green
- server actions: smoke-tested against the deployed migration
- UI: rendered + clicked through against an Acceptance
  Scenario from spec.md

---

## Phase 1 — Pre-migration verification

- [x] **T001** [P1] Verify no `(campaign_id, title)` duplicates
  in `encounters` table (file: `mat-ucheniya/scripts/verify-encounter-titles.sql`)
  - Ran on prod (2026-04-25): 10 encounters total, 0 duplicates.
  - T002 backfill uses straight CTE without row_number() tiebreaker.

---

## Phase 2 — Migration

- [x] **T002** [P1] Write migration `039_encounter_mirror_and_loot_drafts.sql`
  (file: `mat-ucheniya/supabase/migrations/039_encounter_mirror_and_loot_drafts.sql`)
  - Section 1: seed `encounter` node_type per existing campaign
    (idempotent, skip if exists)
  - Section 2: `alter table encounters add column node_id uuid`
  - Section 3: backfill mirror nodes via CTE; if T001 found
    duplicates, use the row_number() tiebreaker variant
  - Section 3a: defensive verification — raise exception if any
    encounter still has `node_id IS NULL`
  - Section 4: `node_id NOT NULL` + FK to `nodes(id) ON DELETE
    RESTRICT` + unique index `idx_encounters_node_id`
  - Section 5: three trigger functions + their triggers
    (`create_encounter_mirror_node` BEFORE INSERT,
    `sync_encounter_title_to_mirror` AFTER UPDATE OF title,
    `delete_encounter_mirror_node` AFTER DELETE)
  - Section 6: `encounter_loot_drafts` table + index +
    `set_updated_at` trigger
  - All wrapped in single `begin / commit`
  - Rollback section as comment block at the bottom
- [x] **T003** [P1] Apply migration locally + present file to user
  for production apply (file: same as T002)
  - Applied to prod 2026-04-25 (chat 50). 4/4 smoke checks pass:
    no orphans, mirror has correct type+title, title sync trigger
    works on rename, delete trigger removes mirror.

---

## Phase 3 — Spec-012 reconcile carve-out (refactor)

- [x] **T004** [P1] Extract reconcile core from
  `apply-loop-start-setup.ts` into shared helper
  (files: `mat-ucheniya/lib/autogen-reconcile.ts` (new),
  `mat-ucheniya/app/actions/starter-setup.ts` (modified),
  `mat-ucheniya/lib/starter-setup.ts` (removed `getExistingAutogenRows`/
  `getTombstones`, exported `SPEC_012_WIZARD_KEYS`))
  - 135/135 vitest baseline → 135/135 after refactor.
  - lint 0/0 (one warning on unused canonicalKey import — fixed).
  - applyLoopStartSetup сократился с ~230 до ~90 строк, делегирует
    `computeAutogenDiff` + `applyAutogenDiff`. wizardKeys теперь
    параметризован через `readonly string[]` — spec-013 будет
    передавать `['encounter_loot']`.

---

## Phase 4 — Pure helpers (parallelisable)

- [ ] **T005** [P] [P1] Create types module
  (file: `mat-ucheniya/lib/encounter-loot-types.ts`)
  - Export: `LootLineId`, `CoinLine`, `ItemLine`, `LootLine`
    discriminated union, `LootDraft`, `DesiredRow`
  - Per plan.md `## Data Model § encounter_loot_drafts`
- [ ] **T006** [P] [P1] Create coin-split helper + tests
  (files: `mat-ucheniya/lib/coin-split.ts`,
  `mat-ucheniya/lib/__tests__/coin-split.test.ts`)
  - `splitCoinsEvenly(totals, recipientCount)` per plan.md
  - Floor-cp + remainder distribution + greedy denomination
    output
  - Tests: 0/1/2/3/4 recipients × various totals; 31gp/3 case
    explicitly; zero-amount case; pp-only case
  - Target: ≥ 8 tests
- [ ] **T007** [P] [P1] Create resolver + tests
  (files: `mat-ucheniya/lib/encounter-loot-resolver.ts`,
  `mat-ucheniya/lib/__tests__/encounter-loot-resolver.test.ts`)
  - `resolveEncounterLootDesiredRows({draft, participantPcIds,
    stashNodeId})` per plan.md
  - Expand each line according to recipient_mode → DesiredRow[]
  - Merge by content key `(actor_pc_id, kind, item_name | null)`
  - Drop zero-result rows after merge
  - Tests per plan.md `## Testing`: empty draft, single coin
    line PC/stash/split, uneven split, mixed, merge-by-key for
    coins and items, zero-after-merge drops
  - Target: ≥ 12 tests
- [ ] **T008** [P] [P1] Create validation module + tests
  (files: `mat-ucheniya/lib/encounter-loot-validation.ts`,
  `mat-ucheniya/lib/__tests__/encounter-loot-validation.test.ts`)
  - Zod schemas: `coinLineSchema`, `itemLineSchema`,
    `lootDraftSchema`
  - `validateLootDraft(draft, encounter, participants)` —
    cross-line invariants per plan.md
  - Tests: each per-line invariant, each cross-line invariant,
    happy path
  - Target: ≥ 10 tests
- [ ] **T009** [P] [P1] Register `encounter_loot` wizard key
  (file: `mat-ucheniya/lib/starter-setup.ts` — modify
  `isKnownWizardKey`)
  - Add `'encounter_loot'` to the legal keys list
  - Update the existing test
    `lib/__tests__/starter-setup-validation.test.ts` line ~120
    that asserts `isKnownWizardKey('encounter_loot')` returns
    `false` → flip to `true`

---

## Phase 5 — Server actions (sequential)

- [ ] **T010** [P1] `getEncounterLootDraft` action
  (file: `mat-ucheniya/app/actions/encounter-loot.ts`)
  - Member-read auth gate
  - Returns `LootDraft | null`
  - Lazy-creates an empty draft row on first call (no error if
    insert race with another tab — use upsert with
    `on conflict do nothing` then re-select)
- [ ] **T011** [P1] `getEncounterLootSummary(encounterId)` query
  (file: `mat-ucheniya/lib/queries/encounter-loot-summary.ts`)
  - Single query for `{rowCount, lastAppliedAt, mirrorNodeId}`
  - Member-read; uses spec-012 partial index
  - Per plan.md `## Server Layer § Queries`
- [ ] **T012** [P1] `updateEncounterLootDraft` action
  (file: `mat-ucheniya/app/actions/encounter-loot.ts`)
  - DM-only auth gate (admin client after role check)
  - Zod validation via T008
  - Patch shape: `Partial<Pick<LootDraft, 'lines' |
    'loop_number' | 'day_in_loop'>>`
  - Lifts `updated_at` and `updated_by` (current user id)
  - `revalidatePath` for encounter page only
- [ ] **T013** [P1] `setAllToStashShortcut` action
  (file: `mat-ucheniya/app/actions/encounter-loot.ts`)
  - DM-only
  - Loads draft, rewrites every line's `recipient_mode='stash'`
    + `recipient_pc_id=null`
  - Returns `{ok: true, updatedLines: N}`
- [ ] **T014** [P1] `applyEncounterLoot` action
  (file: `mat-ucheniya/app/actions/encounter-loot.ts`)
  - DM-only
  - Flow per plan.md `## Server Layer § Server actions`:
    1. auth gate
    2. load draft, validate
    3. resolve participants from `encounter_participants`
       ordered correctly, filter to PCs
    4. resolve stash node id
    5. compute desired rows via T007 resolver
    6. compute diff via T004's `computeAutogenDiff`
    7. if affected hand-touched / tombstoned and not confirmed
       → return `needsConfirmation`
    8. else apply diff inside `SET LOCAL spec012.applying='on'`
       transaction
    9. `revalidatePath` for encounter page, `/accounting`,
       `/accounting/stash` (if any stash recipient), and each
       affected PC's catalog page

---

## Phase 6 — UI

- [ ] **T015** [P1] `<EncounterLootSummaryReadOnly>` component
  (file: `mat-ucheniya/components/encounter-loot-summary-read-only.tsx`)
  - Server component, renders three states
  - Reads `getEncounterLootSummary` (T011)
  - Link to `/accounting?autogen=only&source=<mirrorNodeId>`
- [ ] **T016** [P1] `<EncounterLootPanel>` server frame
  (file: `mat-ucheniya/components/encounter-loot-panel.tsx`)
  - DM-only render guard (server-side role check)
  - Hides itself when `encounter.status === 'active'`
  - Loads draft + summary, computes panel state (`empty |
    drafting | applied`)
  - Renders header + day picker (when needed) + line list +
    apply button + «Всё в общак» shortcut
  - Mounts client island `<EncounterLootLineEditor>`
- [ ] **T017** [P1] `<EncounterLootLineEditor>` client island
  (file: `mat-ucheniya/components/encounter-loot-line-editor.tsx`)
  - State: local `lines: LootLine[]` mirroring server
  - Optimistic update on edit; debounced call to T012
    `updateEncounterLootDraft`
  - Renders `<CoinLineRow>` and `<ItemLineRow>` per line
  - "Add coin line" / "Add item line" buttons
- [ ] **T018** [P2] `<CoinLineRow>` component
  (file: `mat-ucheniya/components/encounter-loot-coin-line-row.tsx`)
  - Amount inputs (cp/sp/gp/pp like spec-010 `<AmountInput>`)
  - Recipient picker: PC dropdown / «В общак» / «Поровну»
  - When `'split_evenly'`: live preview "по ~7.5 gp каждому ·
    остаток 1 cp → Mirian (init 18)"
  - Reuses `<AmountInput>` from spec-010 (`mat-ucheniya/components/amount-input.tsx`)
- [ ] **T019** [P2] `<ItemLineRow>` component
  (file: `mat-ucheniya/components/encounter-loot-item-line-row.tsx`)
  - Free-text name input + qty input
  - Recipient picker: PC dropdown / «В общак»
- [ ] **T020** [P2] Day picker in panel header
  (file: `mat-ucheniya/components/encounter-loot-panel.tsx`)
  - Two number inputs (loop + day) shown when
    `draft.loop_number === null || draft.day_in_loop === null`
  - Apply button disabled until both filled
- [ ] **T021** [P1] Apply button + confirm dialog wiring
  (files: `mat-ucheniya/components/encounter-loot-panel.tsx`,
  reuses `mat-ucheniya/components/apply-confirm-dialog.tsx`)
  - Adapter for spec-012's `<ApplyConfirmDialog>`:
    - Title: «Пересобрать лут»
    - Body label: «Затронутые ручные правки и удаления»
    - On confirm: re-call T014 with `{confirmed: true}`
  - Toast on success: «Лут распределён · N строк»
- [ ] **T022** [P2] «Всё в общак» button wiring
  (file: `mat-ucheniya/components/encounter-loot-panel.tsx`)
  - Calls T013 action
  - Toast «N строк переадресовано в общак»
  - No undo (per plan Open Questions decision)
- [ ] **T023** [P1] Register `encounter_loot` in autogen badge label map
  (file: `mat-ucheniya/components/transaction-row.tsx`)
  - Add `encounter_loot: 'Лут энкаунтера'` to `WIZARD_LABELS`
- [ ] **T024** [P1] Mount panel + read-only summary on encounter page
  (file: `mat-ucheniya/app/c/[slug]/encounter/[encounterId]/page.tsx`
  or wherever the encounter page server component lives)
  - DM branch: `<EncounterLootPanel>`
  - Player branch: `<EncounterLootSummaryReadOnly>`
  - Both pass `encounterId` and the resolved mirror `nodeId`

---

## Phase 7 — Cross-cutting filters

- [ ] **T025** [P] [P1] Filter encounter mirrors from sidebar
  (file: `mat-ucheniya/lib/sidebar/sidebar-data.ts`)
  - Add `and node_types.slug != 'encounter'` to the sidebar
    tree query
  - Verify locally: an existing encounter's mirror does NOT
    appear in sidebar
- [ ] **T026** [P] [P1] Filter encounter mirrors from catalog grid
  (files: catalog page server queries — find via
  `grep -rn "node_types" mat-ucheniya/app/c/`)
  - Add the same filter clause
  - Verify locally: catalog grid does NOT list mirrors
- [ ] **T027** [P] [P1] Filter encounter mirrors from node typeaheads
  (file: `mat-ucheniya/lib/queries/node-typeahead.ts` or
  equivalent — find via grep)
  - Add the filter clause
  - Verify: node-pickers (e.g. catalog edge-add UI) do not
    suggest mirrors

---

## Phase 8 — Tests + acceptance walkthrough

- [ ] **T028** [P2] RLS test script
  (file: `mat-ucheniya/scripts/check-rls-013.ts`)
  - Player-role: cannot update draft, cannot apply, can read
    summary
  - DM-role: full access
  - Non-member: cannot read draft or summary
  - Pattern from spec-012's RLS test
- [ ] **T029** [P2] Trigger test script
  (file: `mat-ucheniya/scripts/check-encounter-mirror-triggers.ts`)
  - Insert encounter → mirror exists with matching title
  - Update title → mirror title syncs
  - Update other fields (status, current_round) → mirror title
    unchanged
  - Delete encounter → mirror gone
  - Try DELETE on mirror node → FK RESTRICT errors
- [ ] **T030** [P2] Manual acceptance walkthrough — User Story 1
  (Acceptance Scenarios 1–4 of US1)
  - Empty draft + apply → no rows, no error
  - 30gp split across 4 PCs → 4 rows summing to 30gp
  - Item line to PC → 1 item row
  - Uneven split (31gp/3) → exact remainder rule
- [ ] **T031** [P2] Manual acceptance walkthrough — User Story 2
  (US2 reapply scenarios 1–4)
  - Unchanged draft → 0 writes
  - Single recipient swap → exactly one row delta
  - Add line → exactly one new row
  - Remove line → exactly one deletion
- [ ] **T032** [P3] Manual acceptance walkthrough — US3, US4, US7
  - US3: stash recipient + «Всё в общак» preset
  - US4: even-split + participant change between applies
  - US7: encounter delete cascades autogen rows + mirror
- [ ] **T033** [P3] Manual acceptance walkthrough — US5, US6
  - US5: badge tooltip resolves to encounter title; rename
    propagates without reapply
  - US6: hand-edit + reapply → confirm dialog → confirm path
    + cancel path

---

## Phase 9 — Close-out

- [ ] **T034** [P1] Lint + typecheck + vitest + next build
  - `npm run lint` → 0/0
  - `npx vitest run` → all green (135 spec-012 tests + new
    spec-013 tests)
  - `npm run build` → clean
- [ ] **T035** [P3] Update `NEXT.md`
  - Move "spec-013 in progress" → "in prod" section
  - Note migration `039_*` as latest applied
  - Update next priority (spec-014 approval flow / spec-016
    Сборы / whatever's next)
- [ ] **T036** [P3] Add chatlog entry
  (file: `chatlog/YYYY-MM-DD-chatNN-spec013-implement.md`)
  - Per `chatlog/README.md` template
- [ ] **T037** [P3] Commit + push
  - All migrations, code, tests, NEXT.md, backlog.md updates,
    chatlog in one or two coherent commits

---

## Risk register

- **T001 finds duplicates** → T002 backfill needs row_number()
  tiebreaker. Doable but adds a bit of SQL. ~30 min extra.
- **T004 refactor breaks spec-012** → 135 vitest tests catch
  most things; manual smoke on `/loops` page covers the rest.
  Mitigation: don't combine T004 with anything else in a
  single PR.
- **Mirror trigger fires on encounter clone** (e.g. test
  fixtures, copy-from-template) → trigger always creates a new
  mirror, even for clones. This is correct behaviour (each
  encounter instance is independent) but worth testing.
- **JSONB validation drift** between Zod schema and Postgres
  reality — there's no DB CHECK, so a malformed write through
  raw SQL bypasses validation. Acceptable risk: only the
  `updateEncounterLootDraft` action writes to this table, and
  it always validates. Documented in plan.md.
- **Performance miss on apply** (FR-024 budget 500 ms) — if
  10-line apply exceeds budget, fall back to the
  `apply_encounter_loot` Postgres RPC (parallel to spec-012's
  `apply_loop_start_setup`). Decision deferred to T014
  implementation.
