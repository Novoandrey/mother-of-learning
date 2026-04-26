# Implementation Plan: Item Catalog Integration

**Spec**: `.specify/specs/015-item-catalog/spec.md`
**Created**: 2026-04-26
**Status**: Draft
**Estimated effort**: 5–7 days (2 migrations — schema + seed/backfill,
~10 pure helper modules with ~120 unit tests, ~12 server actions, new
top-level `/items` route with catalog grid + item page + settings, three
typeahead retrofits — txn form / encounter loot / batch form, inventory
tab on PC + stash, sidebar/nav integration).

---

## Architecture overview

Spec-015 promotes items from free-text strings on `transactions` to
first-class graph nodes (`type='item'`). The structural payoff —
deduplication, autofill, per-item history, real inventory — comes from
a single new column (`transactions.item_node_id`, nullable) and a new
node type. Everything else is read-side: the catalog grid, the
inventory tab, the item page, the typeahead are all lenses on
existing data plus the new id link.

Five architectural seams:

1. **Item nodes live on `nodes`.** A new node type `item` (per
   campaign, seeded by migration) plus a side table
   `item_attributes(node_id PK, …)` for the typed hot fields. JSONB
   `nodes.fields` carries cold fields (description, srd_slug, source
   detail). Decision rationale below in § Hot-field placement.
2. **`transactions.item_node_id uuid REFERENCES nodes(id) ON DELETE
   SET NULL`** — the canonical link. Nullable for back-compat with
   pre-spec-015 rows and for player free-text submissions (FR-013,
   FR-015). `item_name` snapshot stays as the fallback display
   (FR-014, FR-031). Deletion of an Образец cascades to NULL, never
   destroys transactions (FR-032).
3. **Categories scope expansion.** The existing `categories` table
   (CHECK `scope in ('transaction','item')` from migration 034) gets
   three more allowed scopes: `item-slot`, `item-source`,
   `item-availability`. One table, four settings sections, the
   existing `<CategorySettings>` component reused 4× — zero new
   write-side code paths.
4. **Inventory aggregation = pure query of transactions.** No
   inventory table. The pure helper `aggregateItemLegs` (extracted
   from existing `aggregateStashLegs`, FR-021) takes a flat list of
   item legs and folds by `keyFn` — defaults to
   `(leg) => leg.itemNodeId ?? \`name:${leg.itemName}\`` so linked
   items dedupe by node id, free-text by name, never collide. The
   `(loop, day)` slice is a SQL filter on `loop_number` +
   `day_in_loop ≤ day`, applied before the fold.
5. **Day picker is URL-driven, transparent, never policed.**
   Reuses `computeDefaultDayForTx` verbatim for first-render default
   (SC-008 — same helper as wallet block). After first render, the
   user moves wallet and inventory pickers independently — there is
   no synchronisation primitive to maintain.

Read-side discipline:
- `lib/items.ts` is the single read surface for catalog + item page +
  typeahead. Server-side; client receives plain DTOs.
- `lib/inventory.ts` is the inventory read surface (PC + stash both
  consume it). Builds on `lib/items.ts` for hot-field hydration and
  on `aggregateItemLegs` for the fold.
- The catalog grid is server-rendered with URL-driven filters
  (`?category=…&rarity=…&q=…&groupBy=…&sort=…`). Group-by is a
  client-only re-fold — no refetch — to keep the interaction snappy.
- Item history (`«История»` section on the item page) is one extra
  query joined with PCs / loops by id; per FR-Q7=A, only
  `item_node_id = this.id` rows are surfaced. Free-text matches by
  name are NOT included.

Write-side discipline:
- `app/actions/items.ts` — `createItem` / `updateItem` / `deleteItem`
  (DM-only; RLS enforces, action also gates by `getMembership`).
  Deletion is a real `DELETE FROM nodes` — the FK cascades to
  `item_attributes` and SET NULL'es every linked transaction.
- `app/actions/transactions.ts` (existing — extended): every
  create-action accepts an optional `itemNodeId` parameter on
  `kind='item'` calls. When provided, the row is written with both
  `item_node_id` AND `item_name` (FR-014 snapshot). When omitted,
  the existing free-text path is unchanged.
- `app/actions/encounter-loot.ts` (existing — extended):
  `updateEncounterLootDraft` accepts optional `itemNodeId` per item
  line in the JSONB draft. `applyEncounterLoot` propagates the link
  into the generated transactions through the bridge to spec-012's
  reconcile core (`lib/autogen-reconcile.ts`).
- Categories actions (existing) get no new actions — they already
  accept `scope`. Settings page passes the right scope per section.

Routing:
- `/c/[slug]/items` — catalog grid (top-level).
- `/c/[slug]/items/[id]` — item permalink (structured fields +
  description + история).
- `/c/[slug]/items/settings` — value list management (4 sections:
  Категории / Слоты / Источники / Доступность).
- `/c/[slug]/catalog?type=item` — alias; `redirect()` to
  `/c/[slug]/items` server-side preserving any other params.
- `/c/[slug]/catalog/[id]` for `type='item'` nodes — currently
  resolves; we add a redirect to `/items/[id]` for canonical URLs.
- PC page (`/c/[slug]/catalog/[pcId]`) gains an inventory tab; the
  PC page's tab structure is unchanged in URL terms — tab state is
  client-side via `?tab=inventory&loop=…&day=…`. Tab default is
  Wallet, not Inventory (preserves current behaviour).
- Stash page (`/accounting/stash`) gains a third tab «Инвентарь»
  alongside the existing «Предметы» (which we rename to «Сводка»)
  and «Лента». Decision below in § Stash tab structure.

---

## Hot-field placement (Q1 resolution)

**Decision: side table `item_attributes(node_id PK, …)`.**

Considered both options:
- **A. Typed columns on `nodes` directly** — `nodes` gets
  `item_category_slug`, `item_rarity`, `item_price_gp`,
  `item_weight_lb`, `item_slot_slug`, `item_source_slug`,
  `item_availability_slug`. Gated to `type='item'` rows by
  application convention (NULLs everywhere else). Pros: single
  table, no joins, fewer migration steps. Cons: every non-item
  node carries 7 NULL columns forever; future per-type fields
  (encounter, npc, location) compound the pollution; CHECK
  constraints to enforce gating get awkward.
- **B. Side table `item_attributes(node_id PK, …)`.** Pros:
  schema clean, indexes live where they matter, established
  codebase pattern (`encounter_loot_drafts`,
  `pc_starter_configs`, `campaign_starter_configs` — all side
  tables keyed by their owner). Cons: one extra LEFT JOIN
  every catalog read.

Codebase pattern wins. Side table is also the cleaner extension
point for future spec-016+ per-type fields.

---

## Stash tab structure decision

Existing stash page (`/accounting/stash`) has two tabs after chat
42–43: **«Предметы»** (the `<InventoryGrid>` summary) and **«Лента
транзакций»** (the ledger filtered to stash actor). Spec-015
introduces a `(loop, day)` slice with day picker, structured
columns (category, rarity, slot), and group-by — the existing
«Предметы» tab is the natural place for it.

**Decision**: keep the two-tab structure. Replace the existing
«Предметы» tab content with the new spec-015 inventory view —
same component as PC inventory, pre-bound to the stash actor.
The «Лента транзакций» tab is unchanged. No third tab.

The current `<InventoryGrid>` component is already
`itemNodeId`-parameterised via `keyFn` (chat 40, forward-compat
note); spec-015 extends it with the column set, group-by, and day
picker. Same component, no fork.

---

## Data model

### Migration `043_item_catalog.sql` — schema only

Pure additive: one new node type seed mechanism, one new side
table, one new column on `transactions`, three CHECK extensions,
no destructive change.

```sql
-- 043: Spec-015 item catalog schema.
--
-- Layered on top of `nodes` (graph) + `categories` (value lists
-- from 034). Adds:
--
--   * node_types row for 'item' per existing campaign (idempotent
--     UPSERT; new campaigns get it via initializeCampaignFromTemplate)
--   * item_attributes side table, FK to nodes(id), PK on node_id
--   * transactions.item_node_id column, nullable, FK to nodes(id)
--     ON DELETE SET NULL
--   * categories.scope CHECK extension to allow 4 new scopes:
--     'item' (already allowed), 'item-slot', 'item-source',
--     'item-availability'
--   * Per-campaign seeds of slot/source/availability default rows
--     via the same seedCampaignCategories pattern from 034
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- ON CONFLICT DO NOTHING for seed inserts. CHECK extension uses
-- DROP/RECREATE pattern (Postgres can't ALTER CHECK in place).
--
-- Rollback: drop column transactions.item_node_id; drop table
-- item_attributes; restore old categories.scope CHECK.

begin;

-- ─────────────────────────── node_types ───────────────────────────
-- Seed 'item' node type per existing campaign. New campaigns pick
-- this up through initializeCampaignFromTemplate (modified separately
-- in a TS file; this migration only catches existing campaigns).

insert into node_types (campaign_id, slug, label, icon, sort_order)
select c.id, 'item', 'Предметы', 'package', 60
from campaigns c
on conflict (campaign_id, slug) do nothing;

-- ─────────────────────────── item_attributes ───────────────────────────

create table if not exists item_attributes (
  node_id            uuid primary key references nodes(id) on delete cascade,
  category_slug      text not null,                          -- categories(scope='item').slug
  rarity             text                                     -- closed enum, see CHECK below
                       check (rarity in ('common','uncommon','rare','very-rare','legendary','artifact')),
  price_gp           numeric(12,2),                           -- nullable; some items priceless / not for sale
  weight_lb          numeric(8,2),                            -- nullable; same
  slot_slug          text,                                    -- categories(scope='item-slot').slug; nullable
  source_slug        text,                                    -- categories(scope='item-source').slug; nullable
  availability_slug  text,                                    -- categories(scope='item-availability').slug; nullable
  -- srd_slug, description, source_detail live in nodes.fields JSONB
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Indexes for catalog filter / sort / group-by paths.
-- Composite covers the common (category, rarity) browse case.
create index if not exists idx_item_attributes_category_rarity
  on item_attributes (category_slug, rarity);
create index if not exists idx_item_attributes_price
  on item_attributes (price_gp)
  where price_gp is not null;
create index if not exists idx_item_attributes_slot
  on item_attributes (slot_slug)
  where slot_slug is not null;
create index if not exists idx_item_attributes_source
  on item_attributes (source_slug)
  where source_slug is not null;

-- Updated_at trigger (reuses existing trg fn from 034).
drop trigger if exists trg_item_attributes_updated_at on item_attributes;
create trigger trg_item_attributes_updated_at
  before update on item_attributes
  for each row execute function set_updated_at();

-- RLS: read by any campaign member, write by owner/dm only.
-- Item membership is derived through nodes.campaign_id.

alter table item_attributes enable row level security;

drop policy if exists item_attributes_select on item_attributes;
create policy item_attributes_select on item_attributes
  for select to authenticated
  using (
    exists (
      select 1 from nodes n
      where n.id = item_attributes.node_id
        and is_member(n.campaign_id)
    )
  );

-- Writes happen via admin client / server actions (matching the
-- existing pattern from 034). No insert/update/delete policy here.

-- ─────────────────────────── transactions.item_node_id ───────────────────────────

alter table transactions
  add column if not exists item_node_id uuid
    references nodes(id) on delete set null;

create index if not exists idx_transactions_item_node_id
  on transactions (item_node_id)
  where item_node_id is not null;

-- Constraint: item_node_id MUST be NULL when kind != 'item'.
-- Enforced at the DB layer because application code is too easy to
-- bypass (raw SQL / future DM tools).
alter table transactions
  drop constraint if exists transactions_item_node_id_kind_match;
alter table transactions
  add constraint transactions_item_node_id_kind_match
  check (
    (kind = 'item' and (item_node_id is null or item_node_id is not null))
    or (kind != 'item' and item_node_id is null)
  );

-- ─────────────────────────── categories scope expansion ───────────────────────────

alter table categories
  drop constraint if exists categories_scope_check;
alter table categories
  add constraint categories_scope_check
  check (scope in (
    'transaction',
    'item',
    'item-slot',
    'item-source',
    'item-availability'
  ));

-- ─────────────────────────── per-campaign default seeds ───────────────────────────

-- Item categories (FR-004): 8 default buckets per campaign.
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item', s.slug, s.label, s.sort_order
from campaigns c, (values
  ('weapon',     'Оружие',          10),
  ('armor',      'Доспехи',         20),
  ('consumable', 'Расходники',      30),
  ('magic-item', 'Магические',      40),
  ('wondrous',   'Чудесные',        50),
  ('tool',       'Инструменты',     60),
  ('treasure',   'Сокровища',       70),
  ('misc',       'Прочее',          80)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

-- Item slots (FR-005a): 13 default slots per campaign.
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item-slot', s.slug, s.label, s.sort_order
from campaigns c, (values
  ('ring',      'Кольцо',           10),
  ('cloak',     'Плащ',             20),
  ('amulet',    'Амулет',           30),
  ('boots',     'Обувь',            40),
  ('gloves',    'Перчатки',         50),
  ('headwear',  'Головной убор',    60),
  ('belt',      'Пояс',             70),
  ('body',      'Тело',             80),
  ('shield',    'Щит',              90),
  ('1-handed',  'Одноручное',      100),
  ('2-handed',  'Двуручное',       110),
  ('versatile', 'Универсальное',   120),
  ('ranged',    'Дальнобойное',    130)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

-- Item sources (FR-005b): SRD + homebrew default per campaign.
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item-source', s.slug, s.label, s.sort_order
from campaigns c, (values
  ('srd-5e',   'SRD 5e',   10),
  ('homebrew', 'Хоумбрю',  20)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

-- Item availabilities (FR-005c): 4 default tiers per campaign.
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item-availability', s.slug, s.label, s.sort_order
from campaigns c, (values
  ('for-sale', 'Свободно купить',  10),
  ('quest',    'Квестовый',        20),
  ('unique',   'Уникум',           30),
  ('starter',  'Стартовый',        40)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

commit;
```

### Migration `044_srd_items_seed.sql` — data only

Separate file because it's data, not schema. Idempotent via slug
upsert; runs once on deploy and is safe to re-run.

Two phases inside the migration:
1. **Seed**: for every existing campaign, insert ~400 SRD items as
   `(nodes, item_attributes)` pairs keyed by `srd_slug` in
   `nodes.fields`. ON CONFLICT — match by
   `(campaign_id, fields->>'srd_slug')` — DO NOTHING to keep
   idempotent. The seed dataset itself is provided by a TS-generated
   SQL file: `lib/seeds/items-srd.ts` produces the INSERT statements
   from a structured array. (Same pattern as
   `lib/seeds/dnd5e-srd.ts` from chat 30.)
2. **Backfill**: for every existing item-transaction with
   `item_node_id IS NULL`, look up the item by
   `LOWER(TRIM(transactions.item_name)) = LOWER(TRIM(nodes.title))`
   OR `LOWER(TRIM(transactions.item_name)) = LOWER(item_attributes.fields->>'srd_slug')`
   in the same campaign. If found, set `item_node_id`. (FR-027(d),
   strict per Q4=B.)

The migration logs three counts per campaign at end via `RAISE
NOTICE`: items seeded, transactions backfilled, transactions left
unlinked. (FR-029.)

The SRD dataset is the largest implementation cost in this spec.
Sourcing options:
- **Option A**: hand-curate ~400 entries from the open-licence SRD
  text. Truth on the page; tedious but authoritative.
- **Option B**: parse the existing `mat-ucheniya/scripts/`
  monster-block parser as a reference and adapt for items from a
  publicly-available 5e SRD JSON dataset (e.g. open5e). Faster, but
  requires verification.
- **Option C**: minimal seed (~50 most-used items) for chat-1
  release, expand later via DM-add. Fastest to ship; pushes seed
  scope into a follow-up.

Plan recommends **Option B** with **Option C as fallback** if the
parsing turns out to be more than 1 day. The seed lives in
`lib/seeds/items-srd.ts`; tasks.md picks the exact source dataset.

---

## Pure helpers (`lib/`)

All testable in isolation, no Supabase imports, vitest-compatible.

### `lib/items-types.ts`
TypeScript types only:
```ts
export type Rarity = 'common'|'uncommon'|'rare'|'very-rare'|'legendary'|'artifact';
export type ItemNode = {
  id: string;
  title: string;          // nodes.title (display, ru)
  campaignId: string;
  // hot fields from item_attributes:
  categorySlug: string;
  rarity: Rarity | null;
  priceGp: number | null;
  weightLb: number | null;
  slotSlug: string | null;
  sourceSlug: string | null;
  availabilitySlug: string | null;
  // cold fields from nodes.fields:
  srdSlug: string | null;
  description: string | null;
  sourceDetail: string | null;
};
export type ItemFilters = { ... };  // for catalog URL parser
export type GroupBy = 'category' | 'rarity' | 'slot' | 'priceBand' | 'source' | 'availability';
export type SortKey = 'name' | 'price' | 'weight' | 'rarity';
```

### `lib/items-filters.ts` (pure)
- `parseItemFiltersFromSearchParams(sp)` → `ItemFilters`
- `buildItemFiltersUrl(base, filters)` → string (for chip removal)
- `applyItemFilters(items, filters)` → filtered list (in-memory; for
  the client-side group-by re-fold without refetch)
- ~15 unit tests.

### `lib/items-grouping.ts` (pure)
- `groupItems(items, groupBy)` → `{ key: string, label: string,
  items: ItemNode[] }[]`
- `priceBandFor(priceGp)` → `'free' | 'cheap' | 'mid' | 'expensive' | 'priceless'`
  (bands: 0 → free, ≤ 50 → cheap, ≤ 500 → mid, > 500 → expensive,
  null → priceless)
- `rarityOrder(rarity)` → number (canonical 5e ladder; for sort)
- ~12 unit tests.

### `lib/inventory-aggregation.ts` (pure)
- `aggregateItemLegs(legs, opts)` → `InventoryRow[]` where
  `keyFn` defaults to
  `(leg) => leg.itemNodeId ?? \`name:${leg.itemName}\``
- This is the **upgrade** of `aggregateStashLegs` from
  `lib/stash-aggregation.ts` (chat 40 + 42). Decision: instead of a
  parallel implementation, refactor `aggregateStashLegs` to delegate
  to `aggregateItemLegs` so stash and PC inventory share the fold.
- New `InventoryRow` type carries optional hydrated `ItemNode`
  fields (`category`, `rarity`, etc.) for catalog-linked rows; for
  free-text rows those are NULL and the UI degrades gracefully.
- ~18 unit tests, including: linked + unlinked dedup, sign nets to
  zero, day-slice filter respect.

### `lib/inventory-slice.ts` (pure-ish — takes legs, returns rows)
- `sliceLegsAt(legs, loop, day)` → legs filtered to
  `loop_number === loop && day_in_loop ≤ day`
- `defaultDayForInventory(latestDayLogged, frontier)` →
  delegates to the existing `computeDefaultDayForTx` logic but as a
  pure function for unit testing (the I/O wrapper stays in
  `lib/transactions.ts`).
- ~10 unit tests.

### `lib/items-validation.ts` (pure)
- Hand-rolled validators (no zod, codebase convention) for the
  item-create / item-update payload:
  - title required, ≤ 200 chars
  - category_slug required, must exist in campaign's categories
  - rarity in closed enum or null
  - price_gp ≥ 0 or null
  - weight_lb ≥ 0 or null
  - slot/source/availability slugs validated against campaign's
    value lists (passed in as available-slugs sets)
- ~20 unit tests.

### `lib/items-seed-generator.ts` (build-time helper)
Used at the migration generation step, not at runtime. Takes the
SRD JSON dataset, emits the SQL INSERT statements that
`044_srd_items_seed.sql` includes. Saved as a script under
`mat-ucheniya/scripts/items-srd-codegen.ts`.

### `lib/items.ts` (read surface — has Supabase imports, NOT in pure-helpers list)
- `getCatalogItems(campaignId, filters)` → `ItemNode[]` (server)
- `getItemById(campaignId, itemId)` → `ItemNode | null`
- `getItemHistory(itemNodeId)` → `TransactionWithRelations[]`
- `searchItemsForTypeahead(campaignId, query)` → `ItemNode[]`
  (limit 10, ranked: exact prefix > exact substring > full match,
  ILIKE-based; revisit if NFR-002 misses)

### `lib/inventory.ts` (read surface)
- `getInventoryAt(actorNodeId, loop, day)` → `InventoryRow[]`
  Loads legs + delegates to `aggregateItemLegs` + hydrates with
  catalog hot fields via a single `nodes` JOIN.
- Used by both PC inventory tab and stash inventory tab.

---

## Server actions (`app/actions/`)

### `app/actions/items.ts` — NEW
- `createItem(campaignId, payload)` → DM-only; inserts node +
  item_attributes in a transaction.
- `updateItem(itemNodeId, payload)` → DM-only; updates node + item
  attributes in a transaction. Logs the linked-tx count for FR-030
  preview UI.
- `deleteItem(itemNodeId)` → DM-only; deletes the node, FK cascades
  to item_attributes, transactions get SET NULL on item_node_id
  per FR-013/032.
- `getLinkedTransactionCount(itemNodeId)` → DM-only; returns the
  count for the FR-030 preview chip.

### `app/actions/transactions.ts` — EXTENDED (existing module)
- All three create-actions (`createTransaction`, `createTransfer`,
  `createItemTransfer`) gain optional `itemNodeId?: string` on
  item-shaped calls. When provided:
  - server resolves the canonical title via
    `getItemById(campaignId, itemNodeId).title` and stores it as
    the `item_name` snapshot (FR-014). This is intentional — the
    client-typed name is discarded in favour of the canonical one
    when a node is picked.
  - the row is written with `item_node_id` set.
- `updateTransaction` accepts `itemNodeId` to add/change/remove the
  link on existing rows (DM-edit + spec-014 approve-on-edit).
- No DB-level enforcement that the snapshotted `item_name` matches
  the linked node's title — the snapshot can intentionally drift
  when the Образец is renamed (FR-031).

### `app/actions/encounter-loot.ts` — EXTENDED (existing module)
- The JSONB draft shape adds optional `itemNodeId` per item line:
  `{ name, qty, recipient, itemNodeId? }`.
- `updateEncounterLootDraft` validator accepts the new field.
- `applyEncounterLoot` propagates `itemNodeId` from each item line
  into the `DesiredRow` shape it passes to spec-012's reconcile
  core. The reconcile core writes the link into the generated
  transactions.
- Existing drafts (no `itemNodeId`) keep working: the field is
  optional, falsy values skip the link.

### `app/actions/categories.ts` — UNCHANGED
Existing actions already accept `scope` parameter. The new scopes
work without code change (after the CHECK extension in 043).

---

## UI components (`components/` and `app/c/[slug]/items/`)

### Catalog grid — `app/c/[slug]/items/page.tsx`
Server component. Reads URL filters, calls `getCatalogItems`,
renders `<ItemCatalogGrid>` (client island for group-by toggle and
expand-row).

### `<ItemCatalogGrid>` — client component
- Receives the full filtered list as a prop. Group-by is client-side
  (no refetch).
- Renders one section per group with collapsible header (count +
  toggle).
- Each row: name (link to item page) · category · rarity · slot ·
  price · weight · source · availability · (DM-only) edit link.
- Empty state per FR-011.
- Density target: spreadsheet-like; row height ~28px.

### `<ItemFilterBar>` — client component
- Mirrors the spec-010/011 ledger filter bar (chat 43): collapsed by
  default, shows active-filter chips with × removal, "Сбросить всё".
- Filter groups: name search, category, rarity (closed enum), slot,
  price band, source, availability.
- URL is single source of truth.

### Item page — `app/c/[slug]/items/[id]/page.tsx`
Server component. Layout:
1. Header: title (h1), category chip, rarity chip, source chip.
2. Structured fields panel: price, weight, slot, availability,
   srd_slug.
3. Description (markdown — reuse existing `<Markdown>` component).
4. **«История»** section: chronological list of linked
   transactions, each row uses the existing `<TransactionRow>`
   component (spec-011 polish, chat 42) with a link to the
   filtered ledger.
5. DM-only «Редактировать» button → opens
   `<ItemEditDialog>`.

### `<ItemEditDialog>` — client component
- Reachable only from the item page (FR-030 friction).
- Shows linked-tx count chip near the save button: «N транзакций
  ссылаются на этот образец — изменения отразятся в каталоге и
  ленте». Non-blocking note.
- Form fields: title, category, rarity, price_gp, weight_lb, slot,
  source, availability, description (markdown).
- Save → `updateItem` action → router.refresh.

### `<ItemCreateDialog>` — client component
- Reachable from the catalog page header («+ Предмет» button,
  DM-only) and from the typeahead «+ Создать» affordance
  (DM-only) — same component, prefills `title` if invoked from
  typeahead.
- Same fields as edit dialog minus the linked-tx chip.

### Settings page — `app/c/[slug]/items/settings/page.tsx`
Server component. Renders 4 sections, each is the existing
`<CategorySettings>` component with a different `scope` prop:
1. Категории (`scope='item'`)
2. Слоты (`scope='item-slot'`)
3. Источники (`scope='item-source'`)
4. Доступность (`scope='item-availability'`)

Layout: stacked sections with H2 dividers. Reuses existing
component verbatim — no new write code.

### Typeahead retrofit — `<ItemTypeahead>` — client component
- New shared component used by:
  - Existing `<TransactionForm>` (replaces the current free-text
    `item_name` input on `kind='item'` mode)
  - Existing `<BatchTransactionForm>` (same swap on item rows)
  - Existing encounter loot editor (`<EncounterLootEditor>` item
    line)
- Props: `campaignId`, `value: { itemNodeId?: string, itemName: string }`,
  `onChange`, `canCreateNew: boolean` (DM=true, player=false).
- Behaviour:
  - Debounced 200ms search (`searchItemsForTypeahead`).
  - Dropdown shows up to 10 ranked matches.
  - On pick: fills both `itemNodeId` and `itemName` (canonical).
  - On free-text submit: `itemNodeId` stays null,
    `itemName = typed`.
  - DM-only «+ Создать «<typed>»» row at the dropdown bottom
    opens `<ItemCreateDialog>` with `title=<typed>`.
  - Player-only hint: «не нашлось в каталоге — оставить как
    текст» (non-action).

### Inventory tab — shared component `<InventoryTab>`
- Mounted as a tab on:
  - PC page (`/c/[slug]/catalog/[pcId]?tab=inventory`)
  - Stash page (`/c/[slug]/accounting/stash` — replaces existing
    «Предметы» tab content)
- Server-fetches via `getInventoryAt(actorNodeId, loop, day)`.
- Renders:
  - Loop picker (past + current loops only, FR-023b).
  - Day picker (1..loop_length, no block).
  - Day chip subtitle: «Петля N · день M» (FR-023a).
  - Group-by toggle (default category).
  - Inventory rows table (analogous to catalog grid; columns:
    name, category, rarity, slot, qty, total_weight, total_value).
- URL-driven `?tab=inventory&loop=N&day=M` (FR-023).
- Read-only (FR-022) — no edit affordances.

### Sidebar / nav integration
- Sidebar (`lib/sidebar-cache.ts`): item nodes appear under the
  «Предметы» group, same pattern as other node types. Encounter
  mirror cut-out from spec-013 stays — the new item nodes have no
  such filter.
- Nav tabs (`components/nav-tabs.tsx`): add «Предметы» tab between
  «Каталог» and «Бухгалтерия». DM-only badge for items needing
  attention (TBD — out of scope for spec-015 v1).
- `/c/[slug]/catalog?type=item` → server-side `redirect()` to
  `/c/[slug]/items` preserving `?q=…`.
- `/c/[slug]/catalog/[id]` for item nodes → server-side
  `redirect()` to `/c/[slug]/items/[id]`. (Detect by querying the
  node's type slug.)

---

## Phase ordering (Implement)

The phases below are designed so **each phase is shippable**: at the
end of any phase the build is green, tests pass, and prod can absorb
it without breaking existing flows. This matches constitution VII
("each release is playable"). Hand-off after each phase per
spec-kit hard rule.

**Phase 1 — Migration 043 (schema)**
Creates the item node type, item_attributes table, item_node_id
column, scope expansion, default value-list seeds. After this
phase, the DB is ready but UI shows nothing new.

**Phase 2 — Pure helpers + tests**
`items-types`, `items-filters`, `items-grouping`,
`inventory-aggregation`, `inventory-slice`, `items-validation`.
~80 unit tests. Refactor `aggregateStashLegs` to delegate to
`aggregateItemLegs`; existing 9 stash tests keep passing.

**Phase 3 — Read surface (`lib/items.ts` + `lib/inventory.ts`)**
Server-only queries. Gated behind RLS via existing patterns. No UI
yet.

**Phase 4 — Catalog UI (US1 + US2)**
Catalog page, grid, filter bar, group-by, sort, pagination
strategy. DM creates items via `<ItemCreateDialog>`. End of this
phase: DM has a working, empty-by-default catalog.

**Phase 5 — Item page + edit (US5 + Образец edit semantics)**
Item permalink, история section, `<ItemEditDialog>` with
linked-tx count chip. End: full DM-side catalog management.

**Phase 6 — Typeahead retrofit (US3)**
`<ItemTypeahead>` shared component. Wired into `<TransactionForm>`,
`<BatchTransactionForm>`, encounter loot editor. Existing free-text
submissions still work (back-compat path). After this phase, every
new item-transaction CAN carry `item_node_id` if DM picks one.

**Phase 7 — Inventory tab (US4)**
`<InventoryTab>` shared component. Mounted on PC page (new tab) and
stash page (replaces existing «Предметы» content). Day picker, loop
picker, group-by, all URL-driven. End: players see their inventory
as structured table.

**Phase 8 — Settings page (FR-005d)**
4-section page reusing `<CategorySettings>`. End: DM can manage all
4 value lists per campaign.

**Phase 9 — Migration 044 (SRD seed + backfill)**
Run after Phase 8 because the settings infrastructure must exist
first (DM may need to manage seeded sources). The SRD dataset
parsing happens here. Migration logs counts per campaign.

**Phase 10 — Spec-013/014 retrofits explicitly verified (US7)**
Walkthroughs:
- Encounter loot apply with linked item → check `item_node_id`
  propagates.
- Player batch submission with linked item → approve → check
  `item_node_id` survives the pending→approved transition.

**Phase 11 — Sidebar / nav / alias redirects**
`lib/sidebar-cache.ts` invalidate, nav-tabs entry, catalog→items
redirects.

**Phase 12 — Smoke tests + close-out**
SQL smoke `scripts/check-rls-015.sql` (item_attributes RLS, FK
cascade-set-null on item_node_id, scope CHECK), manual walkthrough
covering all 7 user stories on mat-ucheniya prod data.

---

## Open decisions deferred to `tasks.md`

Per spec FRs that explicitly say "exact behaviour `plan.md`" but
which are tactical enough to live in the task breakdown:

1. **SRD dataset source** (Q3 / FR-027): Option A (hand-curate),
   Option B (parse open5e), Option C (minimal 50-item seed).
   Recommendation in plan: Option B with C fallback. Tasks.md
   picks final based on dataset audit.
2. **Catalog pagination strategy** (FR-012): virtualisation
   (`react-virtuoso`?), infinite scroll, or page-N. Recommendation:
   plain server-render of first 200 + client-side virtualisation
   if NFR-001 misses at 500. Mat-ucheniya is well under 500 today.
3. **Catalog default sort** (FR-010): name ascending vs category
   then name. Recommendation: category ascending (sort_order) →
   name ascending.
4. **Price band thresholds** (FR-008 group-by): specified in plan
   (0/50/500/>500/null). Tasks.md MAY tune.
5. **Settings page layout** (FR-005d): 4 stacked sections vs
   tabs. Recommendation: stacked (page is shorter than the
   transaction settings page).
6. **Image / icon for item nodes**: spec doesn't mandate. Skip
   for v1; node icon picker exists already if DM wants per-item.
7. **Item history pagination**: linked-tx count is unbounded.
   Recommendation: load latest 50 + «Показать ещё» — same pattern
   as ledger.
8. **Free-text → linked promotion UX in spec-014 edit form**:
   spec defers to spec-014's existing edit mechanics. Verify the
   typeahead component works inside the edit dialog without
   special-casing.

---

## Risks & mitigations

- **R1 — SRD dataset parsing eats a day.** Mitigation: the seed
  migration (044) is independent of the schema migration (043);
  Phases 1–8 ship without it. Fallback to Option C (50-item seed)
  removes the risk entirely.
- **R2 — Catalog feels slow at 500 items.** Mitigation: typed
  hot-field columns + composite indexes (043). Plan budget allows
  for client-side virtualisation in Phase 4 if SSR render is the
  bottleneck.
- **R3 — Existing `aggregateStashLegs` users break under the
  refactor.** Mitigation: 9 existing stash tests + 7
  computeShortfall tests are the regression safety net. Refactor
  is a delegate (existing function calls the new generalised
  one), not a rewrite.
- **R4 — `transactions_item_node_id_kind_match` CHECK rejects
  legitimate edits.** The CHECK as drafted allows
  `(kind='item', item_node_id IS NULL)` (back-compat) and
  `(kind='item', item_node_id IS NOT NULL)` (linked) and rejects
  only `kind != 'item' AND item_node_id IS NOT NULL`. Mitigation:
  unit-test the boundary in Phase 1 + add SQL smoke check.
- **R5 — Player typeahead surfaces every catalog item, including
  unique/quest items the DM didn't want them to see yet.**
  Spec is silent — items are read-by-all per FR-003. Out of
  scope for v1; if it becomes a problem, a future spec adds
  `availability='hidden'` filter for non-DM views.
- **R6 — Day picker URL collides with wallet's existing
  `?day=` URL on the same page.** Mitigation: tab-namespaced
  URL params (`?tab=inventory&loop=N&day=M`); wallet tab uses
  `?tab=wallet&day=…` if it ever URL-encodes its day (today it
  doesn't — defaults are server-computed).

---

## Test plan summary

- **Pure-helper tests** (vitest): ~80 new tests across 6 modules.
  Listed per-helper above.
- **Integration walkthroughs** (manual): 7 user stories from spec
  + edge cases section (~12 scenarios). Run on mat-ucheniya prod
  data after Phase 9.
- **SQL smoke** (Supabase Dashboard): RLS sanity, FK cascades,
  CHECK constraints. ~6 cases in `scripts/check-rls-015.sql`.
- **Backfill telemetry**: FR-029 RAISE NOTICE counts captured in
  the migration deploy log; checked manually post-deploy that the
  numbers are sane (total seeded = ~400 per campaign, backfilled
  count > 0 for mat-ucheniya, unlinked count is residual typos).

---

## Out of scope

(See spec § Out of Scope for the full list. Plan-level reminders:)

- No location inventory.
- No bulk relinking tool.
- No marketplace / shop simulation.
- No item identification / hidden-fields-from-players mechanic.
- No item charges / consumable counters.
- No item-to-item edges in the catalog UI.
- No cross-campaign item library.

---

**End of plan.md.** Status: **Draft**, awaiting user OK before
proceeding to `tasks.md` (per spec-kit hard rule).
