# Implementation Plan: Encounter Loot Distribution

**Branch**: `013-encounter-loot` | **Date**: 2026-04-25 | **Spec**:
`.specify/specs/013-encounter-loot/spec.md`

## Summary

**Spec-013 ships three pieces of code: a one-to-one mirror node
attached to every encounter, an editable loot draft persisted in
a dedicated table, and a single server action that reconciles the
ledger against that draft using spec-012's autogen primitive.**
All three come in one migration (`039`). No new autogen layer, no
new reconcile algorithm — every reused piece is a function call
into `lib/starter-setup-*` helpers parameterised by a different
wizard key (`encounter_loot`) and a different source node id
(the encounter's mirror).

**The encounter mirror is one nullable column promoted to NOT
NULL.** `encounters` gains `node_id uuid references nodes(id) on
delete restrict`. A `BEFORE INSERT` trigger creates the mirror
node automatically before the encounter row lands; an
`AFTER UPDATE` trigger syncs `title` from encounter to mirror;
an `AFTER DELETE` trigger removes the mirror after the encounter
is gone. The mirror's node_type is the per-campaign `encounter`
slug (seeded by the migration into every existing campaign and
by an `ensureCampaignEncounterType` helper for new campaigns). The
mirror carries `id`, `title`, `campaign_id`, `type_id` only — its
attribute and edge surfaces stay empty for spec-013, reserved
for spec-018's encounter-as-canonical-node rework. Catalog,
sidebar, and node-typeahead pickers gain one `WHERE
node_type.slug != 'encounter'` clause.

**The loot draft is a dedicated table, one row per encounter.**
`encounter_loot_drafts` has `encounter_id` PK + a JSONB `lines`
array (each line is `{id, kind, ...recipient, ...payload}`) +
`loop_number int` and `day_in_loop int` (both nullable until
the DM picks them) + standard timestamps + `updated_by`. JSONB
chosen over per-line table for the same reason spec-012 chose
JSONB for `pc_starter_configs.starting_items`: variable-length
list, no per-line filtering at query time, atomic updates. The
draft persists across page reloads, across status flips
(`active`↔`completed`), and across reapplies. RLS policy:
member-read, DM-write through a server action.

**The apply path reuses spec-012's reconcile, parameterised.**
`applyEncounterLoot(encounterId)` resolves the mirror node id,
loads the draft, expands the lines into a `DesiredRow[]` with
the same shape spec-012's `resolveDesiredRows()` returns, and
hands the result to a generic `reconcileAutogenRows(input)`
helper (factored out of `apply-loop-start-setup.ts` in this
spec — net code change is "split function in two, call the
inner from two places"). The two-phase confirm dialog is the
same component spec-012 ships, parameterised on a label
("стартовый сетап" vs "распределение лута") and the affected-
row formatter.

**The matching key for reconcile is content, not line-id.** A
desired row is keyed by the tuple `(actor_pc_id, kind,
item_name | null)` — `day_in_loop` is fixed per draft (stored
at the draft level, not per line), so it doesn't enter the
key. Multiple draft lines that hash to the same key are merged
(summed `qty` for items, summed denominations for coins) before
reconcile. This deliberately does **not** persist a per-line
identifier into `transactions` — keeping the schema change
within spec-012's promise of "no schema change for new
wizards".

**The DM panel is inline, always mounted on the encounter
page.** `<EncounterLootPanel>` lives in the encounter-page right
column (or below the grid on narrow viewports — same breakpoint
the existing tracker uses). It renders three states:
**empty** (no draft, no autogen rows) — empty-state with "+
Добавить строку"; **drafting** (draft has lines, no autogen
rows yet) — line editor + "Применить"; **applied** (autogen
rows exist) — line editor + "Пересобрать" + per-line "applied
↔ pending" indicator. Players see a read-only
`<EncounterLootSummaryReadOnly>` block with "Лут распределён ·
N строк" + a link to the encounter-filtered `/accounting`
view; nothing more. The panel is hidden entirely when the
encounter status is `active` (per spec FR-010).

**One migration, one backfill, no data loss.**
`039_encounter_mirror_and_loot_drafts.sql` does five things:
(1) seeds `encounter` node_type per campaign, (2) adds
`encounters.node_id` (nullable initially), (3) backfills one
mirror node per existing encounter and points `node_id` at it,
(4) flips `node_id` to NOT NULL with FK + RESTRICT cascade,
(5) installs the three encounter↔mirror triggers and the
`encounter_loot_drafts` table with its index. All idempotent;
rollback is plain DROP TABLE / ALTER TABLE DROP COLUMN +
DELETE FROM nodes WHERE node_type='encounter'.

## Technical Context

**Stack**: Next.js 16 App Router + Supabase (Postgres) +
Tailwind v4. Working dir: `mat-ucheniya/`.

**New runtime dependencies**: none.

**New dev dependencies**: none (vitest already wired).

**Auth/RLS**: One new table (`encounter_loot_drafts`) gets
standard `is_member` select + DM-write through server actions
(the table itself has no INSERT/UPDATE/DELETE policy — writes
go through the admin client in actions, gated by role check).
The mirror nodes inherit existing `nodes` RLS — members of the
campaign can read; the catalog/sidebar UI filters them out by
type slug. The three encounter↔mirror triggers run as
`SECURITY DEFINER`. No column-level RLS needed.

**Caching**: encounter pages already render dynamically (no
ISR). The panel reads draft + autogen-row count inline; both
are O(small) selects on indexed paths. No new cache layer.

**Sidebar cache**: encounter mirror nodes are filtered out of
the sidebar, so the sidebar's `nodes`-revision counter does
not need bumping when a mirror appears or its title syncs.
The catalog tab listing includes a new `WHERE node_type.slug !=
'encounter'` clause; the existing per-tab cache keys do not
need to change because the filter is server-side and applies
uniformly.

**Migrations**: one file, `039_encounter_mirror_and_loot_drafts.sql`.

## Constitution Check

| Principle | Status | Note |
|-----------|--------|------|
| I. Loop as core | ✅ | Loot rows carry `(loop_number, day_in_loop)`; mirror is wipeable-source-aware (encounter belongs to a loop). |
| II. Atomicity | ✅ | Apply wraps multi-row write in a single RPC. |
| III. Cross-references | ✅ | Mirror node bridges encounter → graph; loot rows link PC ↔ encounter via mirror. |
| IV. Data first | ✅ | Draft persists in DB; UI reads. |
| V. Event sourcing | ✅ | Applied rows are events; draft is recipe; ledger is replay. |
| VI. Reader UI | ✅ | Player view is read-only summary. |
| VII. Each release playable | ✅ | Ships a complete loot-distribution feature end-to-end. |
| VIII. Stack simplicity | ✅ | Reuses spec-012 layer; no new libraries. |
| IX. Universality | ✅ | Mirror node + draft mechanism works for any campaign with PCs and a stash. |

No violations.

## Device & Mode Contract

### DM-facing, desktop-primary

- **Encounter page** (existing): right-column panel
  `<EncounterLootPanel>` mounts when status = `completed`. Below
  the grid on `<lg`. Inline editor: line list + add-line
  controls + recipient picker (PC dropdown / stash button /
  «Поровну» toggle for coin lines) + day picker (only required
  when encounter has no session-derived day). Apply button is
  in the panel header.
- **Confirm dialog** (reused from spec-012): only opens when
  reapply detects hand-touched / tombstoned rows.
- **Catalog & sidebar**: encounter mirror nodes are hidden;
  no new affordance for them.

### Player-facing, mobile-first

- **Encounter page**: read-only summary block
  `<EncounterLootSummaryReadOnly>` — "Лут распределён · N
  строк" or "Лут не распределён" + a link to the ledger
  filtered by `?autogen=only&source=<mirror_id>`. No edit
  affordances.
- **PC ledger pages, stash page, /accounting**: loot rows
  appear with the spec-012 autogen badge; tooltip resolves to
  the encounter title.

### Both

- Hand-edits to applied loot rows go through the existing
  spec-012 `<TransactionForm>` with the `autogen_hand_touched`
  trigger flipping the flag; on next reapply, the spec-012
  confirm dialog surfaces them.
- Encounter delete cascades the mirror (via trigger) which
  cascades the autogen rows (via spec-012's
  `autogen_source_node_id ON DELETE CASCADE` FK).

## Data Model

### Mirror node infrastructure

**Per-campaign node_type seed.**

```sql
-- in 039 migration: one row per existing campaign
insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select id, 'encounter', 'Энкаунтер', '⚔️', '{}'::jsonb, 60
from campaigns
where not exists (
  select 1 from node_types nt
  where nt.campaign_id = campaigns.id and nt.slug = 'encounter'
);
```

For new campaigns: a sibling helper `ensureCampaignEncounterType()`
in `lib/seeds/encounter-mirror.ts` mirrors `ensureCampaignStash()`
in `lib/seeds/stash.ts` — called from the encounter creation
trigger if the type is somehow missing (defence in depth — in
practice the migration covers all campaigns and the trigger
finds the type on every insert).

**Column on `encounters`.**

```sql
alter table encounters add column node_id uuid;

-- backfill: insert one mirror per existing encounter
insert into nodes (id, campaign_id, type_id, title, ...)
select gen_random_uuid(), e.campaign_id,
       (select id from node_types
        where campaign_id = e.campaign_id and slug = 'encounter'),
       e.title, ...
from encounters e
where e.node_id is null
returning id, ...;
-- then UPDATE encounters set node_id = ... matching by some link
-- (in practice: do this in a single CTE with INSERT...RETURNING)

alter table encounters
  alter column node_id set not null,
  add constraint encounters_node_id_fkey
    foreign key (node_id) references nodes(id) on delete restrict;
create unique index idx_encounters_node_id on encounters(node_id);
```

The CTE-style backfill keeps it atomic per encounter — no
intermediate state where some encounters have no mirror.

`ON DELETE RESTRICT` on the FK is deliberate: deleting the
mirror directly is forbidden (the user shouldn't be able to,
since the mirror is hidden, but defence in depth). Encounter
deletion cascades to the mirror via the AFTER DELETE trigger
below — single direction, no cycle.

**Triggers.**

```sql
-- Create mirror on encounter insert.
create or replace function create_encounter_mirror_node()
returns trigger language plpgsql security definer as $$
declare
  v_type_id uuid;
  v_node_id uuid;
begin
  -- Resolve the campaign's 'encounter' node_type.
  select id into v_type_id
  from node_types
  where campaign_id = new.campaign_id and slug = 'encounter';

  if v_type_id is null then
    -- Defence: lazy-seed the type if the migration somehow missed it
    -- (e.g. a brand-new campaign created after migration ran).
    insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
    values (new.campaign_id, 'encounter', 'Энкаунтер', '⚔️', '{}'::jsonb, 60)
    returning id into v_type_id;
  end if;

  -- Create the mirror node and capture its id.
  insert into nodes (campaign_id, type_id, title)
  values (new.campaign_id, v_type_id, new.title)
  returning id into v_node_id;

  new.node_id := v_node_id;
  return new;
end;
$$;

create trigger trg_encounter_create_mirror
  before insert on encounters
  for each row
  execute function create_encounter_mirror_node();

-- Sync title on encounter update.
create or replace function sync_encounter_title_to_mirror()
returns trigger language plpgsql security definer as $$
begin
  if new.title is distinct from old.title then
    update nodes set title = new.title where id = new.node_id;
  end if;
  return new;
end;
$$;

create trigger trg_encounter_sync_title
  after update of title on encounters
  for each row
  execute function sync_encounter_title_to_mirror();

-- Delete mirror after encounter delete.
create or replace function delete_encounter_mirror_node()
returns trigger language plpgsql security definer as $$
begin
  delete from nodes where id = old.node_id;
  return old;
end;
$$;

create trigger trg_encounter_delete_mirror
  after delete on encounters
  for each row
  execute function delete_encounter_mirror_node();
```

**Catalog filter.**

Every catalog/sidebar/typeahead query on `nodes` joined with
`node_types` adds `and nt.slug != 'encounter'`. Concretely
touched files:

- `lib/sidebar/sidebar-data.ts` — sidebar tree query
- `app/c/[slug]/catalog/*` — catalog grid query
- `lib/queries/node-typeahead.ts` (if exists) — autocomplete

Tasks.md will enumerate each. No central filter helper —
explicit per-call filter is more obvious than a magic exclude.

### New table: `encounter_loot_drafts`

```sql
create table encounter_loot_drafts (
  encounter_id   uuid primary key references encounters(id) on delete cascade,
  lines          jsonb not null default '[]'::jsonb,
  loop_number    int,
  day_in_loop    int check (day_in_loop is null or (day_in_loop between 1 and 30)),
  updated_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_loot_drafts_encounter on encounter_loot_drafts(encounter_id);

create trigger trg_encounter_loot_drafts_updated_at
  before update on encounter_loot_drafts
  for each row
  execute function set_updated_at();  -- existing helper
```

**`lines` JSONB shape** — TypeScript types in `lib/encounter-loot.ts`:

```ts
export type LootLineId = string  // uuid v4, generated at line-add time

export type CoinLine = {
  id: LootLineId
  kind: 'coin'
  cp: number; sp: number; gp: number; pp: number
  recipient_mode: 'pc' | 'stash' | 'split_evenly'
  recipient_pc_id: string | null  // required when mode='pc'; null otherwise
}

export type ItemLine = {
  id: LootLineId
  kind: 'item'
  name: string  // free text, may match an item-node later in spec-015
  qty: number   // positive integer
  recipient_mode: 'pc' | 'stash'
  recipient_pc_id: string | null  // required when mode='pc'; null otherwise
}

export type LootLine = CoinLine | ItemLine

export type LootDraft = {
  encounter_id: string
  lines: LootLine[]
  loop_number: number | null
  day_in_loop: number | null
  updated_by: string | null
  created_at: string
  updated_at: string
}
```

Validation lives in app code (Zod schema in
`lib/encounter-loot-validation.ts`) — Postgres CHECK on JSONB
shape would be brittle and a pain to evolve; one schema per
spec is cheaper. The `updateEncounterLootDraft` action runs Zod
parse before writing.

**`loop_number` and `day_in_loop` are top-level draft fields,
not per-line.** Reasoning: loot from a single encounter
materialises on a single (loop, day) — the encounter happened
once. Per-line day would invite weird states ("this sword from
the same encounter is dated to day 5, but the coin to day 7")
and complicate reconcile. spec-013 keeps them flat; future
specs can add per-line override if a use case appears.

**Default day resolution at draft-edit time** (FR-016):

1. If the encounter is bound to a session (currently no FK
   exists for encounter→session — encounter_log links via
   participants, but encounters themselves are session-less in
   the current schema). For spec-013, we assume there is no
   reliable encounter→session link and **always require the DM
   to pick the day** in the draft when no day is set yet. (When
   spec-021's DM session control lands, the default can read
   from `campaigns.current_day_in_loop` — that's a single-line
   change in `<EncounterLootPanel>`.)
2. If `loop_number` and `day_in_loop` are set on the draft —
   use them.
3. If unset — disable the apply button, show a banner in the
   panel: "Укажите петлю и день перед применением".

### Reuses from spec-012 (no changes)

`transactions.autogen_wizard_key`, `autogen_source_node_id`,
`autogen_hand_touched`, the partial index, the
`mark_autogen_hand_touched` trigger, the
`autogen_tombstones` table, the
`mark_autogen_tombstone` trigger — all unchanged. The new
wizard key is an application-layer constant; no DB changes.

### Forward-Compat for spec-018 / spec-019

**spec-018 (encounter-as-canonical-node) consumes the mirror.**
When spec-018 lands, the mirror nodes get attributes (canonical
enemy list, structured loot template, day-of-loop default,
edges to locations and templates). spec-013 reserves zero
attributes — so spec-018 has a clean slate. The mirror's
`type_id` is already set; spec-018 can extend `node_types`
with `default_fields` for the encounter type without touching
spec-013 code. The encounter-loot wizard's contract with the
mirror is exactly "give me a node id" — spec-018's enrichment
is invisible to it.

**spec-019 (DM sandbox) toggles visibility on the mirror.**
When spec-019 adds a `visibility` column to `nodes` (or its
chosen mechanism), encounter mirrors inherit it for free. A
draft encounter (status = `'draft'`) has a draft mirror; loot
rows for it have the same visibility as the mirror — players
don't see them until the DM publishes. spec-013 does not
preempt this; it just doesn't fight it.

**spec-021 (DM session control) reads draft defaults from
campaign state.** When spec-021 introduces
`campaigns.current_day_in_loop`, the panel's default day
picker can pre-fill from there. One-line change in the
`<EncounterLootPanel>` initial-state computation; no schema or
draft format change needed.

## Server Layer

### Types (`lib/encounter-loot.ts`)

```ts
import type { LootLine, LootDraft } from './encounter-loot-types'

export const ENCOUNTER_LOOT_WIZARD_KEY = 'encounter_loot' as const

// Extends spec-012's isKnownWizardKey list — single source of truth
// for valid wizard keys.
export function isKnownWizardKey(key: string): boolean {
  return [
    'starting_money',
    'starting_loan',
    'stash_seed',
    'starting_items',
    'encounter_loot',  // new in spec-013
  ].includes(key)
}
```

### Pure helpers

**`lib/encounter-loot-resolver.ts`** — expand a draft into a
list of desired rows. Mirrors spec-012's
`lib/starter-setup-resolver.ts`.

```ts
type DesiredRow =
  | { kind: 'money'; actor_pc_id: string; cp: number; sp: number; gp: number; pp: number }
  | { kind: 'item';  actor_pc_id: string; item_name: string; item_qty: number }

export function resolveEncounterLootDesiredRows(input: {
  draft: LootDraft
  participantPcIds: string[]   // initiative-ordered, NULLS LAST → sort_order → created_at
  stashNodeId: string
}): DesiredRow[] {
  // 1. expand each line:
  //    - 'pc' coin → 1 row to recipient_pc_id
  //    - 'stash' coin → 1 row to stashNodeId
  //    - 'split_evenly' coin → N rows to participantPcIds with floor-cp + remainder rule
  //    - 'pc' item → 1 row to recipient_pc_id
  //    - 'stash' item → 1 row to stashNodeId
  // 2. merge by (kind, actor_pc_id, item_name | null)
  //    - sum cp/sp/gp/pp for coin rows
  //    - sum item_qty for item rows
  // 3. drop zero-amount rows (after merge — could happen if two lines
  //    cancel each other in some malformed draft)
}
```

**`lib/coin-split.ts`** — pure helper for the floor-cp + remainder
rule. Used inline by the resolver.

```ts
export function splitCoinsEvenly(
  totals: { cp: number; sp: number; gp: number; pp: number },
  recipientCount: number,
): { cp: number; sp: number; gp: number; pp: number }[] {
  // Convert all to cp, floor-divide, distribute remainder cp-by-cp
  // to recipients in input order. Return per-recipient denomination
  // breakdown (preferring larger denominations: greedy 1pp=1000cp,
  // then 1gp=100cp, then 1sp=10cp, then cp).
}
```

Note on the "preferring larger denominations" output — this is
a presentation choice for the row. The DM might want to see "10
gp" instead of "1000 cp". Keeping the greedy denomination split
deterministic + obvious in the output. (If a DM wants "100 cp"
exactly because the campaign has weight rules, that's
out-of-scope — they hand-edit after apply.)

**`lib/encounter-loot-validation.ts`** — Zod schema for the
draft + per-line invariants:

```ts
export const lootDraftSchema = z.object({
  lines: z.array(z.discriminatedUnion('kind', [
    coinLineSchema,
    itemLineSchema,
  ])),
  loop_number: z.number().int().positive().nullable(),
  day_in_loop: z.number().int().min(1).max(30).nullable(),
})
```

Cross-line invariants checked separately in
`validateLootDraft(draft, encounter, participants)`:

- Every `recipient_pc_id` references a PC node in this
  campaign.
- Every `recipient_pc_id` is a campaign PC (not necessarily a
  participant — see Edge Case in spec).
- `recipient_mode = 'split_evenly'` only on coin lines, and only
  when the encounter has ≥ 1 participant at apply time
  (validated again at apply, since participant set may change).
- `qty > 0` on item lines (zero-qty lines must be removed by
  the editor, not silently kept).

### Generic reconcile (factored out of spec-012)

**Refactor**: `app/actions/starter-setup.ts` currently calls a
private function `reconcileLoopStartSetup()`. Spec-013 extracts
the reconcile core into a generic helper:

```ts
// lib/autogen-reconcile.ts (new in spec-013, moved from spec-012's apply)

export type AutogenInput = {
  wizardKey: string
  sourceNodeId: string
  desiredRows: DesiredRow[]
  context: {
    loopNumber: number
    dayInLoop: number
    sessionId: string | null
    triggeredByUserId: string
    campaignId: string
  }
}

export type AutogenDiff = {
  toInsert: DesiredRow[]
  toUpdate: { row_id: string; from: ...; to: ... }[]
  toDelete: string[]   // existing autogen row ids
  affectedHandTouched: { row_id: string; ... }[]
  tombstoned: { ... }[]
}

export async function computeAutogenDiff(input: AutogenInput): Promise<AutogenDiff>
export async function applyAutogenDiff(diff: AutogenDiff, context): Promise<void>
```

The existing `applyLoopStartSetup` is rewritten to call
`computeAutogenDiff` + (if no confirmation needed)
`applyAutogenDiff`. spec-013's `applyEncounterLoot` calls the
same two functions with `wizardKey='encounter_loot'`.

This refactor is one task in `tasks.md`, sized as "split the
function in two and verify spec-012 tests still pass". No spec-
012 behaviour changes. The 135 vitest tests from spec-012 are
the proof.

### Server actions (`app/actions/encounter-loot.ts`)

```ts
'use server'

export async function getEncounterLootDraft(
  encounterId: string
): Promise<LootDraft | null>

export async function updateEncounterLootDraft(
  encounterId: string,
  patch: Partial<Pick<LootDraft, 'lines' | 'loop_number' | 'day_in_loop'>>
): Promise<{ ok: true } | { ok: false; error: string }>

export async function applyEncounterLoot(
  encounterId: string,
  options?: { confirmed?: boolean }
): Promise<
  | { ok: true; rowsAffected: number }
  | { ok: false; needsConfirmation: true; affected: AffectedRow[] }
  | { ok: false; error: string }
>

export async function setAllToStashShortcut(
  encounterId: string
): Promise<{ ok: true; updatedLines: number } | { ok: false; error: string }>
```

**`getEncounterLootDraft`** — member-read; returns null if no
draft exists yet. Lazily-creates an empty draft on first
panel-mount via the action layer (cheap insert; no point
forcing the trigger path).

**`updateEncounterLootDraft`** — DM-only; partial patch (full
lines array on lines edit, individual day fields). Validates
via Zod before writing. Lifts the draft's `updated_at` and
`updated_by`.

**`applyEncounterLoot`** — DM-only. The flow:
1. Auth gate: caller is DM of the campaign.
2. Load the draft. Validate (lines + day set + participants
   resolvable).
3. Resolve participants from `encounter_participants` ordered
   by `(initiative DESC NULLS LAST, sort_order, created_at)`.
   Filter to PCs (those with `node_id` matching a `character`-
   typed node — the existing PC filter pattern).
4. Resolve stash node id via `getCampaignStash(campaignId)`
   (existing helper).
5. Compute desired rows via
   `resolveEncounterLootDesiredRows(draft, participants, stashNodeId)`.
6. Build `AutogenInput` and call `computeAutogenDiff`.
7. If `affectedHandTouched.length > 0` or `tombstoned.length > 0`
   AND `options.confirmed !== true`: return
   `needsConfirmation` with the affected list. **No writes.**
8. Otherwise (or with `confirmed=true`): call
   `applyAutogenDiff` inside a transaction with `SET LOCAL
   spec012.applying = 'on'`. Return success.
9. Refresh the encounter-page route segment via
   `revalidatePath`.

**`setAllToStashShortcut`** — DM-only. Loads the draft,
rewrites every line's `recipient_mode` to `'stash'` and
`recipient_pc_id` to `null`, writes back. Returns the count of
updated lines for a toast confirmation. Does not apply.

### RPC (optional)

For parity with spec-012's `apply_loop_start_setup` RPC, we
**don't** add a Postgres RPC for spec-013. Reasons:

- spec-012's RPC was added because the apply ran ~150 rows in
  one shot and we wanted server-side transactionality with no
  network round trips per row. spec-013 typically runs ~10
  rows; the same transactionality is obtainable by wrapping
  the inserts in a single Supabase RPC OR by batching them in
  one `insert(...)` call in JS. Given the volume, JS-batched
  with manual `BEGIN ... COMMIT` (or implicit transaction in a
  single insert) is fine.
- Adding the RPC would duplicate logic that already exists in
  TypeScript helpers — not net code-saving.

`tasks.md` will revisit this if performance testing finds
> 500 ms (FR-024). The fallback is to add an RPC; the panel
code path doesn't change.

### Queries (read side)

**`getEncounterLootSummary(encounterId)`** —
member-read; returns the count of autogen rows + the latest
applied timestamp. Used by both the DM panel
(`applied | drafting | empty` state computation) and the
player-facing read-only summary.

```ts
export async function getEncounterLootSummary(encounterId: string)
  : Promise<{ rowCount: number; lastAppliedAt: string | null; mirrorNodeId: string }>
```

Single query: `select count(*), max(created_at), node_id from
transactions left join encounters on encounters.node_id =
transactions.autogen_source_node_id where encounter_id = ...
and autogen_wizard_key = 'encounter_loot'`. Uses the partial
index from spec-012.

**Hydration of autogen badge tooltip on ledger pages.**
Spec-012's `LedgerListClient` already hydrates `autogen.sourceTitle`
from a Map keyed by `sourceNodeId`. The server collects unique
ids from the page rows and runs a batched `select id, title
from nodes where id in (...)`. This already works for encounter
mirror nodes — they're rows in `nodes` with a title. spec-013
does not need to touch this code. (Confirmed by reading
spec-012 chat 48 / T040 description in NEXT.md.)

## UI Components

### DM-facing

**`<EncounterLootPanel>`** (new, `components/encounter-loot-panel.tsx`):

- Server component for the static frame (fetches draft +
  summary via the actions above).
- Client island for line editing
  (`<EncounterLootLineEditor>`).
- Header: title + apply button + status indicator
  («Не применено» / «Применено · N строк, последний раз DD.MM
  HH:MM»).
- Body:
  - Day picker (loop + day, two number inputs) when draft has
    no day set yet — disabled apply until both filled.
  - Line list with per-line `<CoinLineRow>` /
    `<ItemLineRow>`:
    - For coin: amount inputs (cp/sp/gp/pp like spec-010's
      `<AmountInput>`), recipient picker (PC dropdown / «В
      общак» / «Поровну»). When `'split_evenly'`: live
      preview "по ~7.5 gp каждому · остаток 1 cp →
      Mirian (init 18)".
    - For item: name input, qty input, recipient picker.
  - "Add coin line" + "Add item line" buttons at the end.
- Sidebar shortcut: «Всё в общак» button (calls
  `setAllToStashShortcut`).
- Apply button: opens the spec-012 confirm dialog if
  `needsConfirmation`; otherwise applies directly and shows a
  toast.

**Hidden when `encounter.status === 'active'`** — replaced by a
disabled placeholder: "Распределение лута доступно после
завершения боя".

### Player-facing

**`<EncounterLootSummaryReadOnly>`** (new,
`components/encounter-loot-summary-read-only.tsx`):

- Server-rendered, pure display.
- Three states:
  - "Лут не распределён" (gray, neutral) when no autogen rows.
  - "Лут распределён · N строк" (subtle accent) with a "Показать
    в ленте →" link.
  - Hidden when the encounter has no draft AND no rows AND the
    panel is in active-state — keeps the page clean for fights
    where no loot was relevant.

### Reused

- **Two-phase confirm dialog** from spec-012:
  `<ApplyConfirmDialog>` with prop adapters — labels,
  dialog title, success/cancel handlers. One small parameterisation
  task in tasks.md.
- **Autogen badge** from spec-012's `<TransactionRow>`:
  inherits unchanged. The `wizardLabel` map gets one new entry:

  ```ts
  const WIZARD_LABELS: Record<string, string> = {
    starting_money: 'Стартовые деньги',
    starting_loan: 'Стартовый кредит',
    stash_seed: 'Сид общака',
    starting_items: 'Стартовые предметы',
    encounter_loot: 'Лут энкаунтера',  // new
  }
  ```

  One file edit, no new component.

## Migration

### Structure

`039_encounter_mirror_and_loot_drafts.sql`:

```sql
begin;

-- 1. Seed 'encounter' node_type per existing campaign.
insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select id, 'encounter', 'Энкаунтер', '⚔️', '{}'::jsonb, 60
from campaigns
where not exists (
  select 1 from node_types nt
  where nt.campaign_id = campaigns.id and nt.slug = 'encounter'
);

-- 2. Add nullable node_id column.
alter table encounters add column node_id uuid;

-- 3. Backfill mirror nodes for every existing encounter.
with new_mirrors as (
  insert into nodes (campaign_id, type_id, title)
  select e.campaign_id,
         (select id from node_types
          where campaign_id = e.campaign_id and slug = 'encounter'),
         e.title
  from encounters e
  where e.node_id is null
  returning id, campaign_id, title
)
update encounters e
set node_id = nm.id
from new_mirrors nm
where e.node_id is null
  and nm.campaign_id = e.campaign_id
  and nm.title = e.title;
-- Caveat: matches by (campaign_id, title). If two encounters share both,
-- one mirror will mismatch. Mitigation: verify post-migration that every
-- encounter has a unique node_id; spec-012's pattern of "verify count"
-- in the migration is good practice.

-- 3a. Defensive verification.
do $$
declare v_count int;
begin
  select count(*) into v_count from encounters where node_id is null;
  if v_count > 0 then
    raise exception 'Migration 039 failed: % encounter(s) without node_id', v_count;
  end if;
end $$;

-- 4. Make node_id NOT NULL with FK.
alter table encounters
  alter column node_id set not null,
  add constraint encounters_node_id_fkey
    foreign key (node_id) references nodes(id) on delete restrict;
create unique index idx_encounters_node_id on encounters(node_id);

-- 5. Triggers (functions defined inline as above).
-- ... create_encounter_mirror_node + trigger
-- ... sync_encounter_title_to_mirror + trigger
-- ... delete_encounter_mirror_node + trigger

-- 6. encounter_loot_drafts table + index + updated_at trigger.

commit;
```

**The backfill caveat** — matching by `(campaign_id, title)`
fails if two encounters in the same campaign share the same
title. Current mat-ucheniya state: ~50 encounters; need to
verify uniqueness during migration prep. If duplicates exist,
the migration adds a tiebreaker (e.g. `created_at` matching) or
a one-time SQL-script step in the migration to handle the
duplicates explicitly.

**Mitigation if duplicates found**: replace the simple JOIN-by-
title with a row_number() per `(campaign_id, title)` window and
match in the same order on both sides. Tasks.md will include a
preparatory "verify no duplicate (campaign_id, title)
encounters" check.

### Rollback

```sql
drop trigger trg_encounter_delete_mirror on encounters;
drop trigger trg_encounter_sync_title on encounters;
drop trigger trg_encounter_create_mirror on encounters;
drop function delete_encounter_mirror_node;
drop function sync_encounter_title_to_mirror;
drop function create_encounter_mirror_node;

drop table encounter_loot_drafts;

alter table encounters drop constraint encounters_node_id_fkey;
alter table encounters drop column node_id;

delete from nodes where type_id in (
  select id from node_types where slug = 'encounter'
);
delete from node_types where slug = 'encounter';
```

## Invalidation Contract

| Action | Cache to bump |
|--------|---------------|
| Encounter create | none — mirror appears but is filtered from sidebar |
| Encounter rename | none — mirror is filtered from sidebar |
| Encounter delete | per-encounter ledger views (revalidate /accounting, PC ledger pages of recipients) |
| Apply loot | per-encounter ledger views (revalidate /accounting, PC pages, stash page) |
| Update draft | encounter page only |

`revalidatePath` calls per action:
- `applyEncounterLoot`: revalidate
  `/c/[slug]/encounter/[id]`,
  `/c/[slug]/accounting`,
  `/c/[slug]/accounting/stash` (only if any line had stash recipient),
  `/c/[slug]/catalog/[pcId]` for each affected PC.
- `updateEncounterLootDraft`: revalidate
  `/c/[slug]/encounter/[id]` only.
- `setAllToStashShortcut`: same as updateDraft.

No sidebar invalidation (mirrors are filtered out).

## Validation Rules

- **Per-line**: amounts non-negative integers; qty > 0; coin
  line has at least one non-zero denomination; item name
  non-empty after trim.
- **Per-line recipient**: when `recipient_mode='pc'`,
  `recipient_pc_id` must be a PC node (`character`-type) in the
  campaign; verified at update-time and at apply-time.
- **Draft-level**: `loop_number > 0`; `day_in_loop ∈ [1, 30]`;
  both required before apply.
- **Apply-time**: at least one participant exists if any line
  is `'split_evenly'`; participants are PC nodes (the existing
  PC filter); stash node exists for the campaign.
- **Apply-time guard**: encounter status must be `'completed'`
  to apply.

Validation failures are surfaced inline in the panel (not
dialog popups) — small `<ValidationBanner>` at the top of the
panel listing the issues.

## Performance

- **Apply on a 10-line draft, 4 participants** → expected ~10
  generated rows. Single transaction with batched `insert`
  + targeted `update`/`delete` for the diff. Target ≤ 500 ms
  (FR-024); measured locally during T-implementation.
- **Reapply unchanged** → diff is empty, zero writes (FR-025).
  The diff computation is one indexed select on `(autogen_source_node_id,
  autogen_wizard_key)` + in-memory comparison.
- **Encounter mirror trigger overhead** → one extra INSERT per
  encounter create + one extra UPDATE per encounter rename.
  Negligible (encounter creation is rare, rename even rarer).

## Testing

### Pure-unit tests (vitest)

`lib/__tests__/`:

- **`encounter-loot-resolver.test.ts`** — given a draft +
  participants + stash, assert exact `DesiredRow[]` output for:
  - empty draft → []
  - single coin line, recipient='pc' → 1 row
  - single coin line, recipient='split_evenly', 4 participants
    → 4 rows summing to total
  - uneven split (31gp / 3 PCs) → exact remainder distribution
  - mixed PC + stash + split → all rows correct
  - merge: two coin lines for same PC → 1 row summed
  - merge: two item lines, same name + same recipient → 1 row
    with qty summed
  - zero-result rows dropped after merge
- **`coin-split.test.ts`** — splitCoinsEvenly across 1..N
  participants with various totals.
- **`encounter-loot-validation.test.ts`** — Zod schema +
  cross-line invariants for valid/invalid drafts.
- **`autogen-reconcile.test.ts`** (new, factored from spec-012's
  existing `starter-setup-resolver.test.ts`) — re-verify all
  spec-012 reconcile paths after the extraction refactor.

Target: ≥ 25 new tests in spec-013, plus full reuse of spec-012's
existing tests passing unchanged.

### Integration / manual tests

- Apply a fresh draft on a sandbox encounter, verify rows in
  `/accounting`.
- Reapply unchanged → 0 changes.
- Reapply with one PC swapped → exactly 1 update (or 1 del +
  1 ins).
- Hand-edit a row → reapply triggers the confirm dialog.
- Delete the encounter → autogen rows + mirror gone.
- Encounter rename → mirror title syncs (verify via SQL).
- Catalog and sidebar do NOT show encounter mirrors.

### RLS test

`scripts/check-rls-013.ts` (extending spec-012's pattern):
- player-role: cannot update the draft, cannot apply, can read
  the summary.
- DM-role: full access to all spec-013 endpoints.
- non-member: cannot read draft or summary.

### Trigger test

`scripts/check-encounter-mirror-triggers.ts`:
- Insert encounter → mirror exists with matching title.
- Update encounter title → mirror title syncs.
- Update encounter status → mirror title unchanged.
- Delete encounter → mirror gone, no orphan in `nodes`.
- Try to delete mirror directly → FK RESTRICT errors.

## Open Questions

- **`encounter_loot_drafts` updated_by attribution.** Should
  hand-tweaks via «Всё в общак» preset count as the same author
  as the next apply, or should it just be the draft's
  `updated_by`? Plan: `updated_by` is purely informational on
  the draft; the apply action stamps the row author from
  `auth.user()`, ignoring the draft's `updated_by`. (Same
  pattern as spec-012.)
- **What if a campaign has zero PCs and the DM creates an
  encounter and tries to apply loot?** Apply errors with "no
  recipients available" before any write. Already covered by
  validation (split_evenly requires ≥ 1 participant; pc-mode
  lines require recipient_pc_id which must reference an
  existing PC). The error message is in the panel banner, not
  a dialog.
- **Should the panel offer an undo for the «Всё в общак»
  shortcut?** A toast with "Undo" within ~5 seconds is the
  cheapest version. Tasks.md will include or skip based on the
  apparent friction during implementation. (Lean: skip; the
  preset modifies the draft only, the DM can re-pick PCs
  manually before pressing Применить — there's no irreversible
  step.)
- **Multi-encounter loot bulk apply** (out of scope). If users
  ask, the design lift is small — a "select N encounters,
  apply each" loop in the action — but UX needs thought
  (which encounter is the source for the badge tooltip?).
  Park.
