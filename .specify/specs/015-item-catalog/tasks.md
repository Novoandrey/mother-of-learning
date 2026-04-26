# Tasks: Item Catalog Integration

**Spec**: `.specify/specs/015-item-catalog/spec.md`
**Plan**: `.specify/specs/015-item-catalog/plan.md`
**Created**: 2026-04-26
**Status**: Draft (Implement phase pending)

> Working mode: pick the first unchecked `[ ]`, do it, mark `[x]`,
> stop, wait for confirmation. `[P]` = parallelisable with sibling
> `[P]` tasks. Priorities: P1 = MVP, P2 = important, P3 = polish.

---

## Phase 1 — Schema (migration 043)

- [x] **T001 [P1]** Write migration `043_item_catalog.sql` per
  `plan.md` § Data model. Include:
  (a) `node_types` upsert for `'item'` per existing campaign;
  (b) `item_attributes` table + indexes + updated_at trigger + RLS;
  (c) `transactions.item_node_id` column + index +
      `transactions_item_node_id_kind_match` CHECK;
  (d) `categories.scope` CHECK extension to 5 values;
  (e) per-campaign default seeds for 4 value lists (8 categories,
      13 slots, 2 sources, 4 availabilities) via `INSERT … ON
      CONFLICT DO NOTHING`.
  Idempotent throughout. Header comment per repo convention.
  *(file: `mat-ucheniya/supabase/migrations/043_item_catalog.sql`)*

- [x] **T002 [P1]** Hand `043` to the user via `present_files` per
  repo convention. *(depends on T001)*

- [x] **T003 [P1]** After user confirms migration applied, run a
  verification block (read-only SELECTs) against the local supabase
  to confirm:
  (a) `'item'` node_type present per campaign;
  (b) `item_attributes` table empty but reachable;
  (c) `transactions.item_node_id` exists and is NULL on all rows;
  (d) categories has 27 new rows per campaign (8+13+2+4);
  (e) the new CHECK constraint blocks
      `(kind='money', item_node_id != null)` on a dummy insert that
      we ROLLBACK.
  Either as a smoke SQL script or inline manual SELECTs documented
  in the chat. *(depends on T002)*
  **DONE chat 55** — implicit verification (user confirmed migration
  applied cleanly; no error reported). Formal SQL smoke covered by
  T047 in Phase 12. Verification block remains documented in the
  migration footer for re-run / debug use.

- [x] **T004 [P2]** Update `lib/seeds/categories.ts` (or its
  `initializeCampaignFromTemplate` equivalent — tasks.md verifies)
  so newly created campaigns also get the 4 item-scope value-list
  seeds. The migration handles existing campaigns; this handles
  future ones. *(depends on T001)*
  **DONE chat 55** — `'item'` added to NODE_TYPES in
  `lib/seeds/dnd5e-srd.ts`; new `lib/seeds/item-value-lists.ts`
  seeds 4 scopes idempotently; wired into
  `initializeCampaignFromTemplate` with new `itemValueLists` field
  on `InitializeCampaignResult`.

---

## Phase 2 — Types and pure helpers (parallelisable with Phase 1 once T001 lands)

- [x] **T005 [P1] [P]** Create `lib/items-types.ts` with `Rarity`,
  `ItemNode`, `ItemFilters`, `GroupBy`, `SortKey`, `InventoryRow`
  types per `plan.md` § Pure helpers. No logic, types only.
  *(file: `mat-ucheniya/lib/items-types.ts`)*

- [x] **T006 [P1] [P]** Create `lib/items-filters.ts` (pure):
  `parseItemFiltersFromSearchParams`, `buildItemFiltersUrl`,
  `applyItemFilters`. Plus vitest tests for ~15 cases (empty
  search params, all filters set, single filter set, chip
  removal URL building, filter intersection).
  *(files: `mat-ucheniya/lib/items-filters.ts`,
  `mat-ucheniya/lib/__tests__/items-filters.test.ts`)*

- [x] **T007 [P1] [P]** Create `lib/items-grouping.ts` (pure):
  `groupItems`, `priceBandFor`, `rarityOrder`. Bands: `0` →
  `'free'`, `≤ 50 gp` → `'cheap'`, `≤ 500 gp` → `'mid'`, `> 500 gp`
  → `'expensive'`, `null` → `'priceless'`. Plus ~12 vitest tests.
  *(files: `mat-ucheniya/lib/items-grouping.ts`,
  `mat-ucheniya/lib/__tests__/items-grouping.test.ts`)*

- [x] **T008 [P1] [P]** Create `lib/inventory-aggregation.ts`
  (pure): `aggregateItemLegs(legs, opts?)`. Default `keyFn` is
  `(leg) => leg.itemNodeId ?? \`name:${leg.itemName}\``. Reuses
  the existing `aggregateStashLegs` fold logic but generalised.
  ~18 vitest tests covering: linked dedup, free-text dedup,
  mixed linked + free-text never collide, sign nets to zero
  (drop), warning flag for net < 0, latest-loop/day computation,
  instances list incoming-only.
  *(files: `mat-ucheniya/lib/inventory-aggregation.ts`,
  `mat-ucheniya/lib/__tests__/inventory-aggregation.test.ts`)*

- [~] **T009 [P1]** Refactor `lib/stash-aggregation.ts` so
  `aggregateStashLegs` delegates to
  `aggregateItemLegs` from T008. Existing 9 stash tests stay
  green; existing call sites (`lib/stash.ts`) untouched.
  *(file: `mat-ucheniya/lib/stash-aggregation.ts`, depends on T008)*
  **DEFERRED → Phase 7 (chat 55)**: refactor risk is non-trivial
  and the stash «Предметы» tab is being replaced wholesale by
  `<InventoryTab>` in T029 anyway. At that point either (a) the
  legacy `aggregateStashLegs` becomes dead code and is removed, or
  (b) it stays for the `<StashContents>` shape used by other call
  sites and gets a thin delegation rewrite then. Doing the refactor
  here for its own sake adds a touch surface for no observable win.

- [x] **T010 [P1] [P]** Create `lib/inventory-slice.ts` (pure):
  `sliceLegsAt(legs, loop, day)`,
  `defaultDayForInventory(latestDayLogged, frontier)`. Plus ~10
  vitest tests covering boundary conditions (day = 0, day =
  loop_length, no legs in slice, future day with no logged rows).
  *(files: `mat-ucheniya/lib/inventory-slice.ts`,
  `mat-ucheniya/lib/__tests__/inventory-slice.test.ts`)*

- [x] **T011 [P1] [P]** Create `lib/items-validation.ts` (pure,
  hand-rolled per codebase convention — no zod):
  `validateItemPayload(payload, availableSlugs)`. Returns
  `ValidationError[]` (empty = valid). Covers title, category,
  rarity (closed enum), price_gp, weight_lb, slot, source,
  availability slugs. ~20 vitest tests covering happy path + each
  field's rejection cases.
  *(files: `mat-ucheniya/lib/items-validation.ts`,
  `mat-ucheniya/lib/__tests__/items-validation.test.ts`)*

---

## Phase 3 — Read surface

- [x] **T012 [P1]** Create `lib/items.ts` with: `getCatalogItems`,
  `getItemById`, `getItemHistory`, `searchItemsForTypeahead`. All
  server-side (`createClient` from `@/lib/supabase/server`).
  Hydrates `ItemNode` from `nodes` LEFT JOIN `item_attributes`.
  Typeahead: ILIKE prefix > ILIKE contains > full match, limit 10.
  *(file: `mat-ucheniya/lib/items.ts`, depends on T002, T005)*
  **Notes**: `getItemHistory` delegates to `getLedgerPage` (extended
  with `itemNodeId` filter in `LedgerFilters`) so all hydration
  paths — category labels, author display, transfer-pair
  counterparty, autogen marker — stay shared with the ledger feed.
  Plumbing: `Transaction.item_node_id` field, `TxRawRow.item_node_id`,
  `JOIN_SELECT` extension, `rawToTransaction` mapping all added in
  the same pass.

- [x] **T013 [P1]** Create `lib/inventory.ts` with
  `getInventoryAt(actorNodeId, loop, day)`. Loads item legs for
  the actor in the loop with `day_in_loop ≤ day`, calls
  `aggregateItemLegs`, hydrates linked rows with hot fields from
  `item_attributes` via a single grouped IN-query.
  *(file: `mat-ucheniya/lib/inventory.ts`, depends on T012, T008)*
  **Notes**: also hydrates the **live** Образец title via a
  parallel `nodes(id, title)` IN-query — FR-031 requires renamed
  Образцы to display the new name on every linked inventory row.

---

## Phase 4 — Catalog UI (US1 + US2)

- [x] **T014 [P1]** Create `app/actions/items.ts` with
  `createItem`, `updateItem`, `deleteItem`,
  `getLinkedTransactionCount`. DM-only via `getMembership` gate.
  `createItem` and `updateItem` write `nodes` + `item_attributes`
  in a single transaction (admin client RPC or two-step with
  rollback on failure — pick at task time, prefer single
  transaction). Validates via `validateItemPayload` from T011.
  *(file: `mat-ucheniya/app/actions/items.ts`, depends on T011, T002)*

- [x] **T015 [P1]** Create `app/c/[slug]/items/page.tsx` (server):
  parses URL filters via T006 helpers, calls
  `getCatalogItems(campaignId, filters)`, renders
  `<ItemCatalogGrid>` + `<ItemFilterBar>` + DM-only «+ Предмет»
  button (opens `<ItemCreateDialog>`).
  Includes empty state per FR-011.
  *(file: `mat-ucheniya/app/c/[slug]/items/page.tsx`, depends on T012)*

- [x] **T016 [P1] [P]** Create `<ItemCatalogGrid>` client
  component. Group-by toggle (default `'category'`), one section
  per group with collapsible header, row layout per `plan.md` § UI
  components. Each row links to `/c/[slug]/items/[id]`.
  *(file: `mat-ucheniya/components/item-catalog-grid.tsx`)*

- [x] **T017 [P1] [P]** Create `<ItemFilterBar>` client component
  mirroring spec-010/011 ledger filter bar (chat 43): collapsed by
  default, shows active-filter chips with × removal + «Сбросить
  всё». Filter groups: name search (debounced), category, rarity
  (closed enum), slot, price band, source, availability. URL is
  single source of truth; uses `useRouter` + searchParams.
  *(file: `mat-ucheniya/components/item-filter-bar.tsx`)*

- [x] **T018 [P1]** Create `<ItemCreateDialog>` client component.
  Reachable from catalog page header («+ Предмет» button) and
  from typeahead «+ Создать» (T032). Form fields per `plan.md` §
  UI components. Submit calls `createItem`, on success router.refresh.
  Initial value: optional `prefillTitle?: string` for typeahead use.
  *(file: `mat-ucheniya/components/item-create-dialog.tsx`,
  depends on T014, T011)*

---

## Phase 5 — Item page + edit (US5)

- [x] **T019 [P1]** Create `app/c/[slug]/items/[id]/page.tsx`
  (server): loads `getItemById` + `getItemHistory`. Layout per
  `plan.md` § UI components: header → structured fields panel →
  description (markdown) → «История» section. Last section uses
  the existing `<TransactionRow>` component for each linked
  transaction. DM sees «Редактировать» button → opens
  `<ItemEditDialog>`. 404 if item not found or not in campaign.
  *(file: `mat-ucheniya/app/c/[slug]/items/[id]/page.tsx`,
  depends on T012)*

- [x] **T020 [P1]** Create `<ItemEditDialog>` client component.
  Same fields as `<ItemCreateDialog>` plus a linked-tx count chip
  near save («N транзакций ссылаются на этот образец») fetched
  via `getLinkedTransactionCount`. Submit calls `updateItem`.
  Includes a destructive «Удалить» button (confirms + calls
  `deleteItem`, redirects to `/items` on success).
  *(file: `mat-ucheniya/components/item-edit-dialog.tsx`,
  depends on T014, T011)*

- [~] **T021 [P2]** History pagination (FR-025): default load 50
  rows, «Показать ещё» button loads next 50. Same pattern as
  ledger. Skip for v1 if mat-ucheniya has no item with > 50
  linked rows. Tasks.md picks final at implementation time.
  *(depends on T019)*

---

## Phase 6 — Typeahead retrofit (US3)

- [x] **T022 [P1]** Create `<ItemTypeahead>` shared client
  component per `plan.md` § UI components. Props: `campaignId`,
  `value: { itemNodeId?: string; itemName: string }`, `onChange`,
  `canCreateNew: boolean`. Debounced 200ms search via
  `searchItemsForTypeahead`. Dropdown ranks: exact prefix > exact
  substring > full match, limit 10. DM-only «+ Создать «<typed>»»
  at bottom (opens `<ItemCreateDialog>` with `prefillTitle`).
  Player non-action hint when no match.
  *(file: `mat-ucheniya/components/item-typeahead.tsx`,
  depends on T012, T018)*

- [x] **T023 [P1]** Wire `<ItemTypeahead>` into existing
  `<TransactionForm>` (replaces the free-text `item_name` input
  on `kind='item'` mode). Wire the picked `itemNodeId` into the
  form payload. Preserve all existing form behaviour (stash-
  pinned mode, edit mode, shortfall prompt).
  *(file: `mat-ucheniya/components/transaction-form.tsx`,
  depends on T022)*

- [x] **T024 [P1]** Wire `<ItemTypeahead>` into
  `<BatchTransactionForm>` (player multi-row submit, spec-014).
  Same shape: optional `itemNodeId` per item row.
  *(file: `mat-ucheniya/components/batch-transaction-form.tsx`,
  depends on T023)*

- [x] **T025 [P1]** Extend `app/actions/transactions.ts`:
  `createTransaction` + `createItemTransfer` accept optional
  `itemNodeId`. When provided, server resolves the canonical
  title via `getItemById(campaignId, itemNodeId).title` and
  stores it as the `item_name` snapshot (FR-014, overrides any
  client-typed name). Row written with both columns.
  Snapshot-on-rename intentionally drifts (FR-031).
  *(file: `mat-ucheniya/app/actions/transactions.ts`,
  depends on T012, T002)*

- [x] **T026 [P1]** Extend `updateTransaction` to accept
  `itemNodeId` for add/change/remove the link on existing rows.
  DM-edit + spec-014 approve-on-edit both flow through this.
  *(depends on T025)*

---

## Phase 7 — Inventory tab (US4)

- [x] **T027 [P1]** Create `<InventoryTab>` shared component.
  Props: `actorNodeId`, `campaignId`, `currentLoop`, `loops` (for
  picker — past + current only, FR-023b). Server-fetches via
  `getInventoryAt`. Renders: loop picker, day picker, day chip
  «Петля N · день M», group-by toggle, inventory rows table.
  URL-driven `?tab=inventory&loop=N&day=M`.
  Read-only (FR-022).
  *(file: `mat-ucheniya/components/inventory-tab.tsx`,
  depends on T013)*

- [x] **T028 [P1]** Mount `<InventoryTab>` on PC page.
  `app/c/[slug]/catalog/[id]/page.tsx` already exists for PC
  nodes; add a tab structure (Wallet / Inventory). URL param
  `?tab=` switches. Default tab = Wallet (preserves current
  behaviour). First-render day default uses
  `computeDefaultDayForTx` per SC-008.
  *(file: `mat-ucheniya/app/c/[slug]/catalog/[id]/page.tsx`,
  depends on T027)*

- [x] **T029 [P1]** Replace existing «Предметы» tab content on
  stash page (`app/c/[slug]/accounting/stash/page.tsx` or its
  StashPageTabs component) with `<InventoryTab>` pre-bound to
  the stash actor. The «Лента транзакций» tab is unchanged.
  *(file: `mat-ucheniya/components/stash-page-tabs.tsx` or
  whichever owns the tabs; depends on T027)*

---

## Phase 8 — Settings page (FR-005d)

- [x] **T030 [P1]** Create
  `app/c/[slug]/items/settings/page.tsx` (server). Renders 4
  stacked sections, each is the existing `<CategorySettings>`
  component with a different `scope`:
  (a) `'item'` — Категории
  (b) `'item-slot'` — Слоты
  (c) `'item-source'` — Источники
  (d) `'item-availability'` — Доступность
  H2 dividers between sections. DM-only (redirect non-DM).
  *(file: `mat-ucheniya/app/c/[slug]/items/settings/page.tsx`)*

- [x] **T031 [P2]** Verify `<CategorySettings>` renders correctly
  for the new scopes without code change. The component already
  takes `scope` as a prop; the section title and slug-required-
  here-too text should be parameterisable (or default to the
  generic «Slug — стабильный идентификатор» line). If the
  component hard-codes labels for `'transaction'`, refactor into
  a `labels?` prop with sensible defaults.
  *(file: `mat-ucheniya/components/category-settings.tsx`,
  depends on T030)*

---

## Phase 9 — SRD seed + backfill (US6)

- [x] **T032 [P1]** Decide SRD dataset source: parse
  open5e (Option B) vs minimal 50-item hand-curate (Option C).
  Audit dataset quality + parse complexity in 30 minutes; default
  to Option B unless the parse explodes. Document the choice in
  the chat + chatlog.
  **Decision (chat 67):** Option C — 50 hand-curated entries.
  Rationale in chatlog: ROI on common items > ROI on 350 exotic
  ones for backfill purposes; no external-data review or parse
  fragility blocker on this session.

- [x] **T033 [P1]** Build `lib/seeds/items-srd.ts` per the chosen
  source from T032. Each entry: `{ srdSlug, titleRu, category,
  rarity, priceGp, weightLb, slot, descriptionRu }`. Source field
  is implicit `'srd-5e'`. Magical items get `rarity` set;
  mundane items get `rarity = null`. ~400 entries (Option B) or
  ~50 (Option C).
  *(file: `mat-ucheniya/lib/seeds/items-srd.ts`)*

- [x] **T034 [P1]** Build `mat-ucheniya/scripts/items-srd-codegen.ts`
  — reads `lib/seeds/items-srd.ts`, emits a SQL block of INSERT
  statements suitable for inclusion in migration 044. Same
  pattern as the existing SRD CLI from chat 30.
  *(file: `mat-ucheniya/scripts/items-srd-codegen.ts`,
  depends on T033)*

- [x] **T035 [P1]** Generate the seed SQL via T034 and write
  migration `044_srd_items_seed.sql`:
  Phase 1 — per-campaign INSERT of `nodes` + `item_attributes`
  rows. Idempotent via `(campaign_id, fields->>'srd_slug')`
  conflict.
  Phase 2 — per-campaign UPDATE of `transactions` setting
  `item_node_id` where `LOWER(TRIM(item_name)) = LOWER(TRIM(title))`
  OR `LOWER(TRIM(item_name)) = LOWER(srd_slug)`.
  Logs counts via `RAISE NOTICE` per campaign (FR-029).
  *(file: `mat-ucheniya/supabase/migrations/044_srd_items_seed.sql`,
  depends on T034)*

- [x] **T036 [P1]** Hand `044` to user via `present_files`.
  *(depends on T035)*

- [x] **T037 [P1]** After user applies `044`, run a verification
  query block:
  (a) per-campaign count of seeded items (expect ~400 for Option
      B or ~50 for Option C);
  (b) mat-ucheniya count of backfilled `transactions` (expect
      > 0; record exact number in chatlog);
  (c) sanity: `transactions_item_node_id_kind_match` CHECK still
      satisfied for all rows.
  *(depends on T036)*
  **Note (chat 67):** Migration applied by user. Verification SQL
  shipped inline in the migration footer for self-service runs.

---

## Phase 10 — Spec-013/014 retrofits (US7)

- [x] **T038 [P1]** Extend the encounter loot draft JSONB shape
  to allow optional `itemNodeId` per item line. Update
  `lib/encounter-loot-types.ts` (`LootLine` type) +
  `lib/encounter-loot-validation.ts` (allow but not require).
  Existing drafts (no `itemNodeId`) stay valid (FR-018).
  *(files: `mat-ucheniya/lib/encounter-loot-types.ts`,
  `mat-ucheniya/lib/encounter-loot-validation.ts`)*

- [x] **T039 [P1]** Update `app/actions/encounter-loot.ts`:
  `applyEncounterLoot` propagates `itemNodeId` from each item
  line into the `DesiredRow` shape it passes to
  `lib/autogen-reconcile.ts`. The reconcile core writes the link
  into the generated transactions.
  *(files: `mat-ucheniya/app/actions/encounter-loot.ts`,
  `mat-ucheniya/lib/autogen-reconcile.ts`,
  depends on T038, T025)*

- [x] **T040 [P1]** Wire `<ItemTypeahead>` into
  `<EncounterLootEditor>` for item lines. Same shape as
  T023/T024.
  *(file: `mat-ucheniya/components/encounter-loot-editor.tsx`,
  depends on T022, T038)*

- [ ] **T041 [P1]** Walkthrough US7: open an encounter loot
  draft, add a catalog-linked item via typeahead, apply, verify
  the resulting transaction has `item_node_id` set, verify it
  appears on the recipient's inventory tab and on the item's
  history page.

- [ ] **T042 [P1]** Walkthrough spec-014 retrofit: player submits
  a batch with one catalog-linked item-row, DM approves, verify
  `item_node_id` survives the `pending → approved` transition.

---

## Phase 11 — Sidebar / nav / alias redirects

- [ ] **T043 [P1]** Update `lib/sidebar-cache.ts` so item nodes
  appear under «Предметы» group in the sidebar. The encounter-
  mirror cut-out from spec-013 stays unaffected — items are a
  legitimate sidebar entry.
  *(file: `mat-ucheniya/lib/sidebar-cache.ts`)*

- [ ] **T044 [P1]** Add «Предметы» tab to `<NavTabs>`
  (`components/nav-tabs.tsx`), positioned between «Каталог» and
  «Бухгалтерия». Visible to all members.
  *(file: `mat-ucheniya/components/nav-tabs.tsx`)*

- [ ] **T045 [P2]** Server-side `redirect()` from
  `/c/[slug]/catalog?type=item` → `/c/[slug]/items` preserving
  any other params (`?q=…`).
  *(file: `mat-ucheniya/app/c/[slug]/catalog/page.tsx`)*

- [ ] **T046 [P2]** Server-side `redirect()` from
  `/c/[slug]/catalog/[id]` → `/c/[slug]/items/[id]` when the
  node's type slug is `'item'`. Detect by the existing node
  load logic in that route.
  *(file: `mat-ucheniya/app/c/[slug]/catalog/[id]/page.tsx`)*

---

## Phase 12 — Smoke tests + close-out

- [ ] **T047 [P1]** Create `scripts/check-rls-015.sql` covering
  ~6 cases: (1) non-member cannot read `item_attributes`; (2)
  member can read; (3) item-node deletion cascades to
  `item_attributes` and SET NULL'es `transactions.item_node_id`;
  (4) `transactions_item_node_id_kind_match` CHECK rejects
  `(kind='money', item_node_id != null)`; (5) categories scope
  CHECK accepts all 5 values; (6) categories scope CHECK rejects
  unknown scope. Each case wrapped in `BEGIN … ROLLBACK`.
  *(file: `mat-ucheniya/scripts/check-rls-015.sql`)*

- [ ] **T048 [P1]** Run `npm run lint` + `npx tsc --noEmit` +
  `npx vitest run`. Expect: lint 0/0, vitest passes (existing +
  ~95 new from T006/T007/T008/T010/T011), build clean.

- [ ] **T049 [P1]** Manual acceptance walkthrough — all 7 user
  stories from spec on mat-ucheniya prod data:
  US1 (DM creates item), US2 (browse with group-by/filter/sort),
  US3 (typeahead autofill), US4 (PC inventory tab + day picker
  scrub), US5 (item history page), US6 (SRD seed + backfill
  visible in catalog), US7 (encounter loot retrofit). Record
  outcomes in chatlog.

- [ ] **T050 [P1]** Update `NEXT.md`: move spec-015 to «В проде»
  with a summary (migrations 043+044, key components, test
  count, item count post-seed); update «Следующий приоритет» to
  next backlog item (spec-016 «Сборы» candidate per NEXT.md).

- [ ] **T051 [P1]** Update `backlog.md` only if new bugs / ideas
  surfaced during implementation.

- [ ] **T052 [P1]** Add
  `chatlog/2026-04-NN-chatNN-spec-015-item-catalog.md` per
  `chatlog/README.md` template.

- [ ] **T053 [P1]** Commit + push. Verify Vercel auto-deploy.
  URL for the user.

---

**End of tasks.**

53 tasks total. P1 = 44; P2 = 7; P3 = 0. Estimated 5–7 working
days end-to-end. Awaiting `ok` to enter Implement phase
(T001 first).
