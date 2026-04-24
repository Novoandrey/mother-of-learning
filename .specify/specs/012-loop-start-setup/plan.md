# Implementation Plan: Loop Start Setup

**Branch**: `012-loop-start-setup` | **Date**: 2026-04-24 | **Spec**:
`.specify/specs/012-loop-start-setup/spec.md`

## Summary

**Spec-012 ships three pieces of infrastructure: a general
autogen layer on top of the spec-010 ledger, four concrete
starter-loop wizards that plug into it, and the editors that
let the DM (and, in one narrow case, the player) configure
those wizards.** All three come in one migration (`037`). The
autogen layer is what spec-013 encounter-loot will reuse
next — there is no "autogen framework v2 later"; this is the
framework.

**The autogen marker is two new nullable columns plus a
boolean flag on `transactions`.** `autogen_wizard_key text`
identifies *which* wizard produced the row (`starting_money`,
`starting_loan`, `stash_seed`, `starting_items` in this spec;
`encounter_loot` next); `autogen_source_node_id uuid` points at
*the node the row was generated from* (the loop for spec-012;
the encounter for spec-013); `autogen_hand_touched boolean`
records whether the row has been edited after its initial
generation. A partial index on `(autogen_source_node_id,
autogen_wizard_key)` keeps reconcile lookups O(output-size),
not O(campaign-transactions). Neither autogen column carries a
CHECK constraint on its value — adding a new wizard is always
a code-only change.

**Hand-edit detection is a single database trigger plus one
session-local setting.** `BEFORE UPDATE ON transactions` fires
for any row whose `autogen_wizard_key IS NOT NULL`; the
trigger flips `autogen_hand_touched = true` unless the
transaction setting `spec012.applying = 'on'` is present. The
apply/reapply server action wraps its work in
`SET LOCAL spec012.applying = 'on'` so its own updates don't
flip the flag. Hand-deletes use a parallel mechanism — a
dedicated `autogen_tombstones` table, populated by an
`AFTER DELETE` trigger with the same session-setting guard.
Tombstones are consumed by the reapply action (as "was here,
got hand-deleted") and cleaned up after a successful run.

**Starter configs live in two dedicated tables, not in JSONB
on campaign/PC nodes.** `campaign_starter_configs` (one row
per campaign: starting loan amount, stash seed coins, stash
seed items), `pc_starter_configs` (one row per PC:
`takes_starting_loan` bool, starting coins, starting items).
Separate tables buy us three things: clean RLS (the player's
narrow write-permission on `takes_starting_loan` is one
dedicated server action, not a surgical JSONB patch), cheap
schema evolution (future per-PC loan amount = one `ADD
COLUMN`), and predictable query shape (`getCampaignStarterConfig`
and `getPcStarterConfigs` are plain selects, no JSON parsing).
Starting coin holdings stay denormalised across four int
columns (`cp`, `sp`, `gp`, `pp`) matching the existing
`transactions` schema; starting items are JSONB arrays of
`{name, qty}` because rows of variable length don't model in
columns.

**The trigger is an explicit DM action, not loop creation.**
A new server-rendered `<LoopStartSetupBanner>` mounts on the
existing `/loops` page (right-hand pane, above the progress
bar); it renders only for DM-role users, only when the
currently selected loop has zero `(autogen_wizard_key,
autogen_source_node_id=loop.id)` rows for any of spec-012's
four wizard keys. The banner's one-click "Применить"
invokes `applyLoopStartSetup(loopNodeId)`. First apply and
every reapply share the same server action; the banner
disappears after the first successful apply and is replaced
by a "Пересобрать сетап" button inside the loop's setup
section. Both buttons flow through the same code path and the
same two-phase confirmation pattern.

**Two-phase confirm.** `applyLoopStartSetup(loopId)` computes
the desired row set, diffs against the current state, and —
if any hand-touched or tombstoned rows would be overwritten —
returns `{ needsConfirmation: true, affected: [...] }` without
writing anything. The client opens `<ApplyConfirmDialog>`
listing affected rows with old-vs-new values. The DM's
confirm triggers a second call with `{ confirmed: true }`
which executes the diff. Cancel closes the dialog and makes
no writes. If the affected set is empty, the first call
writes directly — no dialog, single round trip.

**Editors.** The campaign-level starter config lives at
`/c/[slug]/accounting/starter-setup` (sibling to the existing
`/settings/categories`). DM-only. Loan amount + stash seed
coins + stash seed items form. The PC-level starter config
gets a new DM-only block on the PC page
(`/c/[slug]/catalog/[id]` when the node is a PC), titled
"Стартовый сетап петли" — starting coins + starter items
grid. The sole player-editable field, `takes_starting_loan`,
is a lightweight inline toggle in that same block that
renders as interactive for PC owners (player-role), read-only
otherwise. Permission routing: the toggle calls a dedicated
`setPcTakesStartingLoan` action (auth gate: DM or PC owner);
all other edits flow through `updatePcStarterConfig` /
`updateCampaignStarterConfig` (auth gate: DM).

**The autogen badge is a tiny visual + a click affordance.**
Spec-015's `<TransactionRow>` gains one optional leading
element — a small "⚙" (or similar symbol) next to the day
chip — that shows up when the row has `autogen_wizard_key`
set. Hovering or tapping it opens a one-line popover
("Стартовые деньги · петля №5"). The filter bar gets one
new chip group, "Авто: [включены / скрыты]". No new grid
component, no visual overhaul.

**One migration, no data backfill.** `037_loop_start_setup.sql`
does six things: (1) creates `campaign_starter_configs` +
seeds one row per campaign; (2) creates `pc_starter_configs`
+ seeds one row per existing PC (`takes_starting_loan = true`,
coins and items empty); (3) creates `autogen_tombstones`;
(4) adds three columns to `transactions` + the partial index;
(5) installs the two triggers; (6) adds two category slugs
(`starting_money`, `starting_items`) to the default seeds for
every campaign. All idempotent; rollback is plain `DROP TABLE
/ ALTER TABLE DROP COLUMN`.

## Technical Context

**Stack**: Next.js 16 App Router + Supabase (Postgres) +
Tailwind v4. Working dir: `mat-ucheniya/`.

**New runtime dependencies**: none.

**New dev dependencies**: none (vitest already wired in
spec-010).

**Auth/RLS**: Two new tables (`campaign_starter_configs`,
`pc_starter_configs`) get standard member-read + DM-write
policies, mirroring `categories`. The player's
`takes_starting_loan` edit is **not** opened up via RLS —
Postgres does not do column-level RLS, and trying to fake it
with multiple policies invites regression. Instead, the edit
flows through a dedicated server action that checks
"campaign DM OR PC owner" before using the admin client to
update that one column; every other field is DM-only and
enforced by the same action layer. The new triggers on
`transactions` run as `SECURITY DEFINER` owned by the
migration user; they do not consult RLS. The
`autogen_tombstones` table gets `is_member` select + no
direct write policy (tombstones are only inserted by the
trigger and deleted by the apply action via admin client).

**Caching**: the `/loops` page is already
`export const dynamic = 'force-dynamic'`. No additional
caching. The banner status query adds one lightweight
`select 1 from transactions where autogen_source_node_id =
$loop.id limit 1` that uses the new partial index — cheap
enough to run on every render.

**Sidebar cache**: apply/reapply does not change `nodes` or
`node_types`; no sidebar invalidation needed. Starter-config
edits likewise touch neither; no invalidation. (If a future
spec ever surfaces a starter-setup summary in the sidebar,
that's the moment to add a cache bump — not now.)

**Migrations**: one file, `037_loop_start_setup.sql`.

## Constitution Check

- ✅ **I. Loop as core** — spec-012 is the bridge that makes
  loop rollover actually play its intended role. Without
  automated starter state, "new loop = empty" is a 10-minute
  data-entry tax; with it, the loop is the central mechanic
  again. Wipeable state — every autogen row is scoped to a
  loop via `autogen_source_node_id`, the cascade on that FK
  takes care of cleanup when a loop is deleted.
- ✅ **II. Atomicity** — each starter row is one atomic
  transaction. No bundled "starter kit transaction" mega-
  row; no implicit state. The full apply runs as one server
  action (one DB transaction), but the ledger sees individual
  rows, each standalone.
- ✅ **III. Cross-references** — autogen rows reference their
  source node via `autogen_source_node_id` — a plain FK to
  `nodes(id)`. The source node is discoverable; the cascade
  is graph-natural.
- ✅ **III-b. Flat navigation** — the banner sits on the
  existing `/loops` page, not in a new layer. The starter-
  config editors live inside existing catalog (PC page) and
  accounting (campaign settings) pages. No new sidebar
  hierarchy.
- ✅ **IV. Data-first** — the starter config is data;
  reapply recomputes from config; nothing stored derived.
  Every computed state (wallet balances on day 1, stash
  seed) is a function of the config, not cached on the
  node.
- ✅ **V. Event sourcing** — autogen rows are just events.
  Reapply is an event-producing action; history is in the
  ledger; balances are replays. The `autogen_hand_touched`
  flag is metadata on the event, not a parallel truth.
- ✅ **VI. Reader, not dashboard** — no new dashboard. One
  banner (DM), one toggle (player), a bonus filter chip and
  a ledger row badge. Nothing requires the DM to "configure
  starter setup" — the defaults ship empty, which is valid.
- ✅ **VII. Every release is playable** — spec-012 lands and
  immediately saves 10+ minutes per loop rollover. Playable
  on its own. Does not break any spec-010/011 flow.
- ✅ **VIII. Stack simplicity** — one migration, zero new
  runtime deps, zero new dev deps. All of this is plain
  Supabase + Next.js + Tailwind.
- ✅ **IX. Universality** — the autogen layer is campaign-
  agnostic. Spec-012 wizards take no mat-ucheniya-specific
  knowledge. Class-based starter kits, multi-stash seeds,
  per-PC loan amounts are all additions that do not require
  re-architecting.
- ✅ **X. Campaign constitution** — starter setup is the
  mechanical expression of the campaign's "starting
  conditions" narrative section. DMs can write the story in
  the campaign constitution document; spec-012 turns it into
  ledger rows. The two live side by side, same wipe
  semantics.

## Device & Mode Contract

### DM-facing, desktop-primary

- **The banner** (`<LoopStartSetupBanner>`) on `/loops` right
  pane. Big, impossible to miss — a bar spanning the pane
  with a single primary button. No mobile-specific layout
  required; it's a DM tool for prep, almost exclusively used
  on desktop.
- **Campaign starter-config page**
  (`/c/[slug]/accounting/starter-setup`). Form-heavy; desktop
  is the primary surface. Responsive degradation on mobile is
  sufficient (stacked fields); no mobile-first optimisation.
- **PC starter-config block** on the PC page. DM sees full
  editor: starting coins (4-input coin picker), starter items
  (editable list — add row, name, qty, remove row), and the
  `takes_starting_loan` checkbox. Desktop-primary; mobile
  gets the same controls stacked.
- **The confirmation dialog** (`<ApplyConfirmDialog>`) — a
  modal listing hand-touched / tombstoned rows with old/new
  values. Rarely seen in practice; desktop is fine.

### Player-facing, mobile-first

- **The `takes_starting_loan` toggle** on the PC page. The
  *only* player-editable surface in spec-012. Rendered as a
  one-tap switch in the PC's starter block. Big tap target,
  instant save, optimistic update. Players on mobile see the
  rest of the starter-config block as a read-only summary
  ("Стартовые деньги: 100 gp · 3 предмета · берёт кредит").
- **The autogen badge** on ledger rows. Tiny — does not
  change row height, does not steal tap area. Tap reveals a
  one-line popover.

### Both modes

- **The autogen filter chip** in the ledger filter bar. Reads
  "Авто: показать / скрыть". Same component on desktop and
  mobile; a bit lean on mobile (same size as existing filter
  chips).

## Data Model

### New table: `campaign_starter_configs`

One row per campaign. Created idempotently for every existing
campaign in the migration; future campaigns get one via
`initializeCampaignFromTemplate`.

```sql
create table if not exists campaign_starter_configs (
  campaign_id         uuid primary key
                      references campaigns(id) on delete cascade,

  -- starting loan (campaign-level default)
  loan_amount_cp      int  not null default 0,
  loan_amount_sp      int  not null default 0,
  loan_amount_gp      int  not null default 0,
  loan_amount_pp      int  not null default 0,

  -- stash seed (coins only; items live in stash_seed_items)
  stash_seed_cp       int  not null default 0,
  stash_seed_sp       int  not null default 0,
  stash_seed_gp       int  not null default 0,
  stash_seed_pp       int  not null default 0,

  -- stash seed items: [{name: string, qty: int>=1}]
  stash_seed_items    jsonb not null default '[]'::jsonb,

  updated_at          timestamptz not null default now(),

  -- all coin amounts non-negative
  constraint cfg_loan_non_neg check (
    loan_amount_cp >= 0 and loan_amount_sp >= 0 and
    loan_amount_gp >= 0 and loan_amount_pp >= 0
  ),
  constraint cfg_seed_non_neg check (
    stash_seed_cp >= 0 and stash_seed_sp >= 0 and
    stash_seed_gp >= 0 and stash_seed_pp >= 0
  ),
  constraint cfg_seed_items_is_array check (
    jsonb_typeof(stash_seed_items) = 'array'
  )
);
```

**Why a single-row-per-campaign table, not JSONB on
`campaigns`?** The row is the config; queries are simple
selects; the ADD COLUMN path for "per-campaign loan amount
override on a PC" / "multiple loan types" / "loan interest
rate" is trivial. JSONB on an unrelated table would hide the
schema from every tool (typegen, migrations, diff review) and
make RLS fuzzier.

**Validation of `stash_seed_items` contents** — shape is
`[{name: text, qty: int}]`. DB-level validation is the array
check above; shape validation of each element is done in the
server action (`validateStarterItems` pure helper). The CHECK
approach (per-element constraint) is possible with
`jsonb_path_exists` but fragile; doing it in TypeScript is
clearer.

### New table: `pc_starter_configs`

One row per PC node. Created in the migration for every PC
that currently exists; future PCs get one via the PC-create
flow.

```sql
create table if not exists pc_starter_configs (
  pc_id                 uuid primary key
                        references nodes(id) on delete cascade,

  -- The sole player-editable field: does this character
  -- take the campaign-default starting loan at loop start?
  takes_starting_loan   boolean not null default true,

  -- Starting money (coins)
  starting_cp           int not null default 0,
  starting_sp           int not null default 0,
  starting_gp           int not null default 0,
  starting_pp           int not null default 0,

  -- Starting items: [{name: string, qty: int>=1}]
  starting_items        jsonb not null default '[]'::jsonb,

  updated_at            timestamptz not null default now(),

  constraint pc_cfg_coins_non_neg check (
    starting_cp >= 0 and starting_sp >= 0 and
    starting_gp >= 0 and starting_pp >= 0
  ),
  constraint pc_cfg_items_is_array check (
    jsonb_typeof(starting_items) = 'array'
  )
);
```

**PK on `pc_id`** — keeps it one-to-one with the PC node.
Cascade on delete keeps configs tidy when a PC is removed.

**Seed for existing PCs** — migration does:
```sql
insert into pc_starter_configs (pc_id)
select n.id
  from nodes n
  join node_types nt on nt.id = n.type_id
 where nt.slug = 'character'
   and not exists (
     select 1 from pc_starter_configs p where p.pc_id = n.id
   );
```

**PC-create flow hook** — `createPcNode` (wherever it lives
today, probably under `app/actions`) gets a follow-up insert
into `pc_starter_configs`. Small addition; covered by the
existing "after node created" server action.

### New table: `autogen_tombstones`

Records rows that were hand-deleted so the reapply action
can detect them.

```sql
create table if not exists autogen_tombstones (
  id                       uuid primary key default gen_random_uuid(),
  campaign_id              uuid not null
                           references campaigns(id) on delete cascade,
  autogen_wizard_key       text not null,
  autogen_source_node_id   uuid not null
                           references nodes(id) on delete cascade,
  actor_pc_id              uuid
                           references nodes(id) on delete set null,
  kind                     text not null,
  item_name                text,
  deleted_at               timestamptz not null default now()
);

create index if not exists idx_autogen_tombstones_source
  on autogen_tombstones (autogen_source_node_id, autogen_wizard_key);
```

**Why a table, not a soft-delete column on `transactions`?**
Soft-delete means every ledger / wallet / stash query adds a
`where not autogen_soft_deleted` filter. That is:
`getLedgerPage`, `getWallet`, `getStashAggregate`, plus
every PC-side derived view — five queries at minimum, each
with a new, easy-to-forget filter. A separate tombstones
table isolates the concern: reapply consults it, everything
else stays blissfully unaware. Tombstones auto-clean at the
end of a successful apply run (see Server Layer → `runApply`).

**No RLS policies for writes** — tombstones are trigger-
written (ignoring RLS as `SECURITY DEFINER`) and deleted by
the admin client inside `runApply`. Read is gated by
`is_member(campaign_id)`.

### Columns added to `transactions`

```sql
alter table transactions
  add column autogen_wizard_key     text,
  add column autogen_source_node_id uuid
      references nodes(id) on delete cascade,
  add column autogen_hand_touched   boolean not null default false;

-- Partial index: most rows are null; we only index autogen rows.
create index if not exists idx_tx_autogen_source_wizard
  on transactions (autogen_source_node_id, autogen_wizard_key)
  where autogen_source_node_id is not null;
```

**`autogen_wizard_key` text, no CHECK** — open-ended on
purpose (spec FR-008a). A new wizard in spec-013 just writes
a new key. App-layer validation (`isKnownWizardKey`) lives in
TypeScript.

**`autogen_source_node_id uuid references nodes(id) on
delete cascade`** — when the source node is deleted, autogen
rows for it disappear. Matches FR-020 for loops; matches
expected spec-013 behaviour for encounters.

**`autogen_hand_touched boolean default false`** — the flag
that lights up on hand-edit. New rows default to false; the
apply action's inserts stay false; updates go through the
trigger.

**Cascade choice for `autogen_source_node_id`, in contrast to
`actor_pc_id`'s `on delete set null`** — the source node
being gone means the autogen attribution is meaningless; the
row has no purpose without its source. Losing the row is the
right outcome. For `actor_pc_id`, by contrast, history
preservation matters; a deleted PC's rows stay as
`[deleted character]` in the ledger. Different semantics,
different cascades.

### Triggers

Two triggers on `transactions`, both driven by a session-local
setting so the apply action can opt out.

```sql
-- Fires on edits to an autogen row: flip hand_touched on.
create or replace function mark_autogen_hand_touched()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('spec012.applying', true), 'off') = 'on' then
    return new;  -- apply/reapply is running, don't flip
  end if;
  new.autogen_hand_touched := true;
  return new;
end;
$$;

create trigger trg_tx_autogen_hand_touched
  before update on transactions
  for each row
  when (new.autogen_wizard_key is not null
        or old.autogen_wizard_key is not null)
  execute function mark_autogen_hand_touched();
```

```sql
-- Fires on deletes of an autogen row: record a tombstone.
create or replace function record_autogen_tombstone()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('spec012.applying', true), 'off') = 'on' then
    return old;  -- apply/reapply is deleting, don't tombstone
  end if;
  if old.autogen_wizard_key is null or old.autogen_source_node_id is null then
    return old;  -- not an autogen row
  end if;
  insert into autogen_tombstones (
    campaign_id, autogen_wizard_key, autogen_source_node_id,
    actor_pc_id, kind, item_name
  ) values (
    old.campaign_id, old.autogen_wizard_key, old.autogen_source_node_id,
    old.actor_pc_id, old.kind, old.item_name
  );
  return old;
end;
$$;

create trigger trg_tx_autogen_tombstone
  after delete on transactions
  for each row execute function record_autogen_tombstone();
```

**Why `current_setting('spec012.applying', true)`** — the
second argument `true` means "return NULL if the setting is
undefined" instead of erroring. Cheap, safe in every session.

**Why `before update`** (trigger 1) — we mutate `NEW`
in-place. `AFTER` would require a second UPDATE.

**Why `after delete`** (trigger 2) — nothing to mutate; we
just log a side effect.

### RLS

`campaign_starter_configs` and `pc_starter_configs` both get
standard policies:

```sql
alter table campaign_starter_configs enable row level security;

drop policy if exists csc_select on campaign_starter_configs;
create policy csc_select on campaign_starter_configs
  for select to authenticated
  using (is_member(campaign_id));

drop policy if exists csc_modify on campaign_starter_configs;
create policy csc_modify on campaign_starter_configs
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));
```

`pc_starter_configs` — similar, but membership is checked via
the PC's campaign:

```sql
alter table pc_starter_configs enable row level security;

drop policy if exists pcsc_select on pc_starter_configs;
create policy pcsc_select on pc_starter_configs
  for select to authenticated
  using (
    exists (
      select 1 from nodes n
       where n.id = pc_id
         and is_member(n.campaign_id)
    )
  );

drop policy if exists pcsc_modify on pc_starter_configs;
create policy pcsc_modify on pc_starter_configs
  for all to authenticated
  using (
    exists (
      select 1 from nodes n
       where n.id = pc_id
         and is_dm_or_owner(n.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from nodes n
       where n.id = pc_id
         and is_dm_or_owner(n.campaign_id)
    )
  );
```

**The player's narrow `takes_starting_loan` edit does not
show up in RLS**. It goes through
`setPcTakesStartingLoan` (admin-client action, ownership gate
in TypeScript). RLS is the safety net for direct client
writes; the action is the real enforcement.

`autogen_tombstones` — `is_member(campaign_id)` for select,
no public policy for insert/delete/update (admin only).

## Forward-Compat Column Map

Spec-012 deliberately keeps the transactions schema minimal.
Below is the set of columns future specs are expected to add
to `transactions`, what each replaces/augments, and how
spec-012 data behaves post-addition. None of these columns
are added by migration `037`.

| Column | Added by | Nullable | Default | Today's behaviour | Post-addition behaviour |
|---|---|---|---|---|---|
| `item_node_id` | spec-015 | yes | `NULL` | (absent) | If set, row refers to an item node; `item_name` stays as display fallback for pre-spec-015 rows. |
| `item_location_node_id` | future (location-aware items) | yes | `NULL` | (absent) | If set, item physically lives at that location. If `NULL`, item lives at `actor_pc_id` — i.e. today's semantics. Spec-012 rows default to `NULL`, which reads identically to today. |
| `carried_state` | future (equip/carry) | yes | `NULL` | (absent) | `equipped / carried / stored` enum. `NULL` means "unspecified" — today's behaviour. Spec-012 rows default to `NULL`. |

Spec-012 starter-items rows will interpret all three as
`NULL` and continue to read correctly. Adding any of these
columns is one `ALTER TABLE ADD COLUMN ... NULL` — no data
migration, no wizard rewrite, no reconcile-logic change.

**The autogen marker itself stays open-ended.** Spec-013 adds
`encounter_loot` to the `autogen_wizard_key` values space with
no schema change. Future specs do likewise.

## Server Layer

### Types (`lib/starter-setup.ts` and `lib/transactions.ts`)

```ts
// --- Starter configs ---

export type CampaignStarterConfig = {
  campaignId: string;
  loanAmount: CoinSet;          // {cp, sp, gp, pp}
  stashSeedCoins: CoinSet;
  stashSeedItems: StarterItem[];
  updatedAt: string;
};

export type PcStarterConfig = {
  pcId: string;
  takesStartingLoan: boolean;
  startingCoins: CoinSet;
  startingItems: StarterItem[];
  updatedAt: string;
};

export type StarterItem = {
  name: string;
  qty: number;                 // integer >= 1
};

// --- Autogen marker (additions to existing Transaction type) ---

export type WizardKey =
  | 'starting_money'
  | 'starting_loan'
  | 'stash_seed'
  | 'starting_items'
  // future: | 'encounter_loot' | 'rent_debit' | ...
  ;

export type AutogenMarker = {
  wizardKey: WizardKey;
  sourceNodeId: string;
  handTouched: boolean;
};

// Existing Transaction type gets:
//   autogen: AutogenMarker | null;

// --- Apply action contract ---

export type ApplyResult =
  | { ok: true; summary: ApplySummary }
  | { needsConfirmation: true; affected: AffectedRow[] };

export type ApplySummary = {
  insertedCount: number;
  updatedCount: number;
  deletedCount: number;
  tombstonesConsumed: number;
};

export type AffectedRow = {
  wizardKey: WizardKey;
  actorPcId: string;
  actorTitle: string;          // for display
  reason: 'hand_edited' | 'hand_deleted';
  currentValue: string | null; // display-ready; e.g. "+200 gp" or null if deleted
  configValue: string | null;  // display-ready; e.g. "+250 gp" or null if will be deleted
};
```

### Pure helpers (`lib/starter-setup-resolver.ts`)

All pure; fully unit-testable with vitest. No DB access.

```ts
/**
 * Given a loop, a campaign's config, and the configs of every
 * PC in the campaign, compute the deterministic set of rows
 * that the apply action should converge on.
 */
export function resolveDesiredRowSet(params: {
  loopNodeId: string;
  stashNodeId: string;
  campaignId: string;
  campaignCfg: CampaignStarterConfig;
  pcCfgs: PcStarterConfig[];
}): DesiredRow[];

/**
 * Given desired rows and existing rows (from the DB),
 * compute insert / update / delete / leave-alone sets.
 */
export function diffRowSets(
  desired: DesiredRow[],
  existing: ExistingAutogenRow[]
): RowDiff;

/**
 * Identify rows in the diff that require DM confirmation
 * (hand-touched existing rows to be updated/deleted, plus
 * tombstones that indicate hand-deletes).
 */
export function identifyAffectedRows(
  diff: RowDiff,
  tombstones: Tombstone[]
): AffectedRow[];

/**
 * Canonical key for matching desired ↔ existing rows. For
 * every wizard, the key is deterministic and stable:
 *   starting_money:  (wizardKey, actorPcId)
 *   starting_loan:   (wizardKey, actorPcId)
 *   stash_seed:      (wizardKey, actorPcId)   // actor is stash
 *   starting_items:  (wizardKey, actorPcId, item_name)
 */
export function canonicalKey(
  wizardKey: WizardKey,
  row: { actorPcId: string; itemName?: string | null }
): string;
```

**Why a canonical key?** The diff is a bag-join, not a
positional compare. For `starting_items`, the same (actor,
item_name) pair must match across runs even if the row order
changed — the key collapses that into a stable string.

**Why is the key's shape wizard-specific?** Because different
wizards produce different "primary-ish" row features. A PC
has at most one `starting_money` row per loop, but can have
many `starting_items` rows (one per item name). Baking this
into the key is cheaper than diffing with a generic
schemaless matcher.

### Server actions (`app/actions/starter-setup.ts`)

```ts
/**
 * Main entry point. Two-phase:
 *   - First call with { confirmed: false } (default) runs the diff
 *     and returns `needsConfirmation: true` + affected rows if
 *     any confirmation is required. Otherwise writes directly.
 *   - Second call with { confirmed: true } forces execution.
 */
export async function applyLoopStartSetup(
  loopNodeId: string,
  opts?: { confirmed?: boolean }
): Promise<ApplyResult>;

/**
 * DM-only. Updates campaign-level fields in a single row.
 */
export async function updateCampaignStarterConfig(
  campaignId: string,
  patch: Partial<Omit<CampaignStarterConfig, 'campaignId' | 'updatedAt'>>
): Promise<CampaignStarterConfig>;

/**
 * DM-only. Updates every PC-level field EXCEPT takesStartingLoan.
 */
export async function updatePcStarterConfig(
  pcId: string,
  patch: Partial<Omit<PcStarterConfig,
    'pcId' | 'updatedAt' | 'takesStartingLoan'
  >>
): Promise<PcStarterConfig>;

/**
 * DM OR PC owner. Updates only the takes_starting_loan flag.
 */
export async function setPcTakesStartingLoan(
  pcId: string,
  value: boolean
): Promise<PcStarterConfig>;
```

### The apply action, step by step

```
function applyLoopStartSetup(loopNodeId, { confirmed = false }):
  1. Auth:
     - requireAuth()
     - Load loop node; get its campaign_id.
     - Verify requester is DM/owner of that campaign.
  2. Load config:
     - getCampaignStarterConfig(campaign_id)
     - getPcStarterConfigsForCampaign(campaign_id)
     - getStashNode(campaign_id)
  3. Compute desired row set:
     - desired = resolveDesiredRowSet({ loopNodeId, stashNodeId, ... })
  4. Load existing autogen rows for this loop:
     - existing = SELECT * FROM transactions
                   WHERE autogen_source_node_id = $loopNodeId
                     AND autogen_wizard_key IN (spec-012 keys)
  5. Load tombstones for this loop:
     - tombstones = SELECT * FROM autogen_tombstones
                     WHERE autogen_source_node_id = $loopNodeId
                       AND autogen_wizard_key IN (spec-012 keys)
  6. Compute diff:
     - diff = diffRowSets(desired, existing)
  7. Identify affected rows (require confirmation):
     - affected = identifyAffectedRows(diff, tombstones)
  8. If affected.length > 0 && !confirmed:
       return { needsConfirmation: true, affected }
  9. Execute the diff in one DB transaction:
       BEGIN;
       SET LOCAL spec012.applying = 'on';

       -- inserts
       INSERT INTO transactions (...) VALUES (...), (...), ...;

       -- updates (targeted: only the fields that differ + reset hand_touched)
       UPDATE transactions
          SET amount_gp = ..., autogen_hand_touched = false, updated_at = now()
        WHERE id = $id;

       -- deletes
       DELETE FROM transactions WHERE id IN (...);

       -- clean tombstones consumed this run
       DELETE FROM autogen_tombstones
        WHERE autogen_source_node_id = $loopNodeId
          AND autogen_wizard_key IN (spec-012 keys);

       COMMIT;
 10. Return { ok: true, summary }.
```

**Single DB transaction** — the whole diff (inserts +
updates + deletes + tombstone cleanup) runs as one atomic
write. If anything fails, the whole thing rolls back; the
ledger is never in a half-applied state.

**`SET LOCAL spec012.applying = 'on'`** — the key piece. It
tells the two triggers (`mark_autogen_hand_touched`,
`record_autogen_tombstone`) to skip their work for the
duration of this transaction. Without it, the action's own
updates would flip `hand_touched` back on; the action's own
deletes would write new tombstones.

**Tombstone cleanup** — after a successful run, no outstanding
tombstone should remain for this loop/wizard-set. Any
tombstone we consumed has been "resolved" (either the row was
regenerated, or the config said "no row here" and it stays
absent).

**Step 9's INSERT uses `author_user_id = $requester.id`** —
consistent with spec's FR-018 (the user who pressed apply is
the author).

**Error handling** — standard server-action throw/catch. If
the DB transaction fails, the `applyLoopStartSetup` returns
an error result (not a `needsConfirmation`); the client shows
an error toast.

**Performance ceiling** — with 30 PCs and a full starter
config, `desired` is ~150 rows; `existing` is ~150 rows; the
diff runs in memory; the final DB transaction is a small
number of statements (one INSERT with a values list, one
UPDATE with a `WHERE id IN (...)` per-field-group if needed,
one DELETE with an IN list, one tombstone DELETE). Target:
< 1 s wall clock (spec FR-022, FR-023).

### Queries (read side)

- `getCampaignStarterConfig(campaignId)` → single row with
  default fallbacks if row missing (defensive against seeds
  not running).
- `getPcStarterConfigsForCampaign(campaignId)` → joined
  against `nodes` + `node_types` for character slug; returns
  an array keyed by `pcId`.
- `getLoopSetupStatus(loopNodeId)` →
  `{ hasAutogenRows: boolean }`. One indexed `SELECT 1 ...
  LIMIT 1`. Feeds the banner: `hasAutogenRows = false`
  means "show banner".
- `getAutogenAffectedPreview(loopNodeId)` →
  what the confirm dialog shows. Internally calls the same
  `resolveDesiredRowSet` + `diffRowSets` +
  `identifyAffectedRows` pipeline used by `applyLoopStartSetup`
  without the write step. (Callers that want to preview-only
  can use this; the banner flow uses it as part of the
  two-phase call.)

## UI Components

### DM-facing

**`<LoopStartSetupBanner loopNodeId>`** — server component,
mounts in the right pane of `/loops` (below the loop title,
above the existing session progress bar). Queries
`getLoopSetupStatus` once. Returns `null` if the status is
`hasAutogenRows = true` or if the viewer is not a DM.
Otherwise renders:

```jsx
<div className="rounded-md border border-amber-300 bg-amber-50 p-4 flex items-center justify-between">
  <div className="flex items-center gap-3">
    <span className="text-2xl">⚙️</span>
    <div>
      <div className="font-semibold text-amber-900">
        Стартовый сетап ещё не применён
      </div>
      <div className="text-sm text-amber-700">
        Монеты, кредиты и стартовые предметы будут сгенерированы
        на day 1 этой петли.
      </div>
    </div>
  </div>
  <ApplyStarterSetupButton loopNodeId={loopNodeId} />
</div>
```

The button is a client component; it calls
`applyLoopStartSetup` via a server action, handles the
`needsConfirmation` branch by opening `<ApplyConfirmDialog>`.

**`<ApplyConfirmDialog affected onConfirm onCancel>`** —
client component, basic modal. Lists every affected row in a
table with columns: actor | wizard | current value | will
become. The DM confirms or cancels. On confirm, the client
re-calls `applyLoopStartSetup` with `{ confirmed: true }`.

**`<CampaignStarterConfigEditor>`** — full-page editor at
`/c/[slug]/accounting/starter-setup`. Renders three cards:

1. **Стартовый кредит** — coin picker (4-input cp/sp/gp/pp) for
   the campaign default.
2. **Стартовое содержимое общака — монеты** — same coin
   picker.
3. **Стартовое содержимое общака — предметы** — editable
   list: add row, name field, qty input, remove row.

Save triggers `updateCampaignStarterConfig`. Live-preview of
the next-apply delta on the right pane (optional; lean P2 if
it adds friction).

**`<PcStarterConfigBlock pcId mode>`** — a new section in
the PC page (below Wallet block). `mode` is either `'dm'`
(full editor) or `'player'` (toggle + read-only summary).

`dm` variant:
- **Берёт стартовый кредит** — checkbox. Edit calls
  `setPcTakesStartingLoan`.
- **Стартовые деньги** — 4-input coin picker. Edit calls
  `updatePcStarterConfig({ startingCoins })`.
- **Стартовые предметы** — editable list. Edit calls
  `updatePcStarterConfig({ startingItems })`.

`player` variant (PC owner):
- **Берёт стартовый кредит** — toggle, interactive. Edit
  calls `setPcTakesStartingLoan`.
- **Стартовые деньги** — read-only summary
  (`100 gp / 3 предмета`).
- **Стартовые предметы** — read-only list.

`player` variant (non-owner, non-DM): not rendered.

### Player-facing (mobile-first)

The only player-facing thing in spec-012 is the PC block's
`player` variant above. Its `takes_starting_loan` toggle is
big (at least 44px tap target), optimistic (flip updates
local state immediately, save fires in background; on error,
revert + toast). The rest of the block is read-only on
player devices.

### Both

**Autogen badge on ledger rows** — modify `<TransactionRow>`
(spec-011 component) to accept an optional `autogen` prop.
If set, render a small "⚙" before the day chip; tap/hover
opens a one-line popover.

```jsx
// inside TransactionRow:
{row.autogen && (
  <AutogenBadge
    wizardKey={row.autogen.wizardKey}
    sourceTitle={sourceNodeTitle}
  />
)}
```

`<AutogenBadge>` is a tiny client component; the popover uses
the existing tooltip helper (no new library).

**Autogen filter chip** — in the filter bar (`<LedgerFilters>`,
from spec-011 filter collapse), add a new single-select chip:
"Авто: всё / только авто / без авто". Three states. URL-
driven same as other filters (`autogen=all|only|none`).
Default is `all`. The query filter adds
`autogen_wizard_key IS NOT NULL` or `autogen_wizard_key IS
NULL` depending on the state.

## Migration

**One migration file**: `mat-ucheniya/supabase/migrations/
037_loop_start_setup.sql`.

### Structure

```sql
-- Миграция 037: Loop start setup + autogen marker (spec-012).
--
-- Четыре вещи:
--   (1) campaign_starter_configs — campaign-level starter config,
--       one row per campaign. Seeds one row for every existing
--       campaign with defaults (zero loan, empty stash seed).
--   (2) pc_starter_configs — PC-level starter config, one row
--       per PC (slug='character'). Seeds one row for every
--       existing PC with takes_starting_loan=true and empty
--       coins/items.
--   (3) autogen_tombstones — per-hand-delete record, consumed
--       by the apply action. Trigger populated.
--   (4) transactions.autogen_wizard_key / .autogen_source_node_id /
--       .autogen_hand_touched columns + partial index + two
--       triggers (hand-touched detect, tombstone-on-delete).
--   (5) Seed category slugs 'starting_money' and 'starting_items'
--       for mat-ucheniya and (via lib/seeds/categories.ts) future
--       campaigns.
--
-- ⚠️ Идемпотентна. Rollback:
--   drop trigger trg_tx_autogen_tombstone on transactions;
--   drop trigger trg_tx_autogen_hand_touched on transactions;
--   drop function record_autogen_tombstone();
--   drop function mark_autogen_hand_touched();
--   drop index if exists idx_tx_autogen_source_wizard;
--   alter table transactions
--     drop column autogen_hand_touched,
--     drop column autogen_source_node_id,
--     drop column autogen_wizard_key;
--   drop table autogen_tombstones;
--   drop table pc_starter_configs;
--   drop table campaign_starter_configs;

begin;

-- 1. campaign_starter_configs
create table if not exists campaign_starter_configs ( ... );
-- seed one row per existing campaign:
insert into campaign_starter_configs (campaign_id)
select id from campaigns
 where not exists (
   select 1 from campaign_starter_configs c
    where c.campaign_id = campaigns.id
 );

-- RLS
alter table campaign_starter_configs enable row level security;
create policy ... csc_select ...;
create policy ... csc_modify ...;

-- 2. pc_starter_configs (similar)
-- 3. autogen_tombstones (similar)

-- 4. transactions columns + index + triggers
alter table transactions ... add column ...;
create index ... idx_tx_autogen_source_wizard ...;
create or replace function mark_autogen_hand_touched() ...;
create trigger trg_tx_autogen_hand_touched ...;
create or replace function record_autogen_tombstone() ...;
create trigger trg_tx_autogen_tombstone ...;

-- 5. Seed category slugs
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'transaction', 'starting_money', 'Стартовые деньги', 15
  from campaigns c
  on conflict (campaign_id, scope, slug) do nothing;

insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'transaction', 'starting_items', 'Стартовые предметы', 25
  from campaigns c
  on conflict (campaign_id, scope, slug) do nothing;

commit;
```

**After writing, call `present_files` to hand it to the user**
(project rule — every SQL migration).

### `lib/seeds/categories.ts` update

Append two new entries to `DEFAULT_TRANSACTION_CATEGORIES` so
future campaigns get them via `initializeCampaignFromTemplate`:

```ts
export const DEFAULT_TRANSACTION_CATEGORIES = [
  { slug: 'income',          label: 'Доход',              sort_order: 10 },
  { slug: 'starting_money',  label: 'Стартовые деньги',   sort_order: 15 },
  { slug: 'expense',         label: 'Расход',             sort_order: 20 },
  { slug: 'starting_items',  label: 'Стартовые предметы', sort_order: 25 },
  { slug: 'credit',          label: 'Кредит',             sort_order: 30 },
  { slug: 'loot',            label: 'Добыча',             sort_order: 40 },
  { slug: 'transfer',        label: 'Перевод',            sort_order: 50 },
  { slug: 'other',           label: 'Прочее',             sort_order: 100 },
];
```

### `lib/seeds/pc-starter-config.ts` (new)

On PC creation, insert a default row into `pc_starter_configs`.
Small helper called from wherever `createPcNode` lives.

## Invalidation Contract

- **Banner status** — `getLoopSetupStatus(loopNodeId)` is
  called on every `/loops` render with `?loop=N`. Returns
  boolean. No cache needed; the query uses the partial index
  and returns in < 1 ms.
- **Config editors** — server components re-fetch on page
  reload; no cache layer on them. Next.js's App Router handles
  this via `revalidatePath` inside each mutation action.
- **Sidebar** — unchanged. None of spec-012's writes touch
  `nodes` or `node_types`. No sidebar cache bump.
- **Ledger** — autogen filter chip changes URL; page re-fetches
  via `searchParams`. Same pattern as existing filter chips.

Revalidation after writes:
- `updateCampaignStarterConfig` → `revalidatePath('/c/[slug]/
  accounting/starter-setup')`.
- `updatePcStarterConfig` / `setPcTakesStartingLoan` →
  `revalidatePath('/c/[slug]/catalog/[id]')`.
- `applyLoopStartSetup` → `revalidatePath('/c/[slug]/loops')`
  + `revalidatePath('/c/[slug]/accounting')` (ledger changes).

## Validation Rules

Pure helpers in `lib/starter-setup-validation.ts`, unit-tested.

```ts
/** Accepts valid CoinSet with non-negative integers. */
export function validateCoinSet(
  c: CoinSet
): { ok: true } | { ok: false; error: string };

/** Accepts array of {name, qty} where name is non-empty and qty >= 1. */
export function validateStarterItems(
  items: unknown
): { ok: true; value: StarterItem[] } | { ok: false; error: string };

/** Accepts a valid WizardKey string. */
export function isKnownWizardKey(s: string): s is WizardKey;
```

Every server action runs input through the appropriate
validator before touching the DB. Validation errors become
user-facing errors (returned from the action, shown as toast).

## Performance

- **Banner query** (`getLoopSetupStatus`) — `SELECT 1 FROM
  transactions WHERE autogen_source_node_id = $loop LIMIT 1`.
  Uses `idx_tx_autogen_source_wizard`. < 1 ms.
- **Apply** (30 PCs, ~150 rows) — FR-022 budget 1 s. Expected:
  one DB transaction with ~6–10 statements (bulk INSERT, bulk
  UPDATE per-wizard, bulk DELETE, tombstone cleanup). ~200 ms
  round-trip local, ~400 ms production. Comfortable margin.
- **Reapply idle** (no changes, no hand-edits) — diffRowSets
  returns an empty diff; no DB writes; only the read queries
  fire. < 100 ms.
- **Confirm dialog render** — affected rows precomputed during
  the first-phase call; the dialog's render is local state,
  no additional fetches.
- **Ledger filter change** (autogen chip) — partial index hit
  on `autogen_wizard_key IS [NOT] NULL`; no measurable
  regression vs. today.

## Testing

### Pure-unit tests (vitest)

- `lib/starter-setup-resolver.test.ts`
  - `resolveDesiredRowSet` returns the right set for
    (empty / full / partially-filled) configs.
  - Rows are in stable order (for snapshot testability).
  - `takes_starting_loan = false` removes that PC's loan row.
  - Empty coin set for a PC removes that PC's starting-money
    row.
  - Empty starter items for a PC produces zero item rows.
- `diffRowSets`
  - No changes → empty diff.
  - Config amount changed → one update.
  - PC added → new rows.
  - PC removed → rows untouched (orphan handling — spec FR-014).
  - Item name changed → old row deleted + new row inserted.
- `identifyAffectedRows`
  - Hand-touched row in update set → returned as affected.
  - Hand-touched row staying untouched → NOT returned.
  - Tombstone + matching desired row → returned as
    `hand_deleted`.
  - Tombstone + no matching desired row → NOT returned (DM
    hand-deleted *and* the config agrees it shouldn't exist).
- `canonicalKey` stable across inputs.
- `validateCoinSet` / `validateStarterItems` / `isKnownWizardKey`.

### Integration / manual tests

Against spec Acceptance Scenarios:

- US1.1–US1.6 — against a 10-PC mat-ucheniya pilot campaign.
- US2.1–US2.3 — Lex's flag off, verify row absent.
- US3.1–US3.8 — hand-edits, reruns, cancels.
- US4 — add new PC mid-loop, reapply.
- US5 — starter items including unique names ("Документы на
  дом, qty 1").
- US6 — badge + filter.
- US7 — delete loop, verify cascade.

### RLS test

- Player tries to `UPDATE` `campaign_starter_configs` directly
  via anon client → rejected by `csc_modify` policy.
- Player tries to `UPDATE` `pc_starter_configs` directly via
  anon client → rejected.
- Player calls `setPcTakesStartingLoan` on their own PC →
  succeeds.
- Player calls `setPcTakesStartingLoan` on someone else's PC
  → returns 403.
- DM calls any of the three → succeeds.

### Trigger test

- Hand-edit an autogen row via `updateTransaction` → row's
  `autogen_hand_touched` flips to `true`.
- Apply with `SET LOCAL spec012.applying='on'` updates the
  same row → `autogen_hand_touched` stays `false` (or is
  reset to `false` by the action).
- Hand-delete an autogen row → tombstone lands in
  `autogen_tombstones`.
- Delete via the applying path → no tombstone.
- Non-autogen row edits/deletes → no trigger side effects.

## Open Questions

- **Where exactly does the campaign starter-config editor
  route live?** Proposed: `/c/[slug]/accounting/starter-setup`
  (sibling to `/settings/categories`). Alternative:
  `/c/[slug]/settings/starter-setup`. Tasks.md task will pin
  the path; the code change is trivial.
- **Does the `<CampaignStarterConfigEditor>` need a
  live-preview pane** (showing "next apply will produce N
  rows")? P2 at most; ship without, add later if DMs want it.
- **Should the player's read-only summary of their own
  starter items show qty?** ("Longsword × 1 · 20 arrows · 3
  healing potions") — yes, the list is short enough. Handled
  in the player-variant JSX.
- **Category slugs for starter-money and starter-items** —
  chose `starting_money` / `starting_items`. These are
  open-world English identifiers; labels are Russian. If a
  campaign already has a category with one of these slugs, the
  seed `ON CONFLICT DO NOTHING` skips it; their existing
  category wins. Unlikely collision in practice.
- **PC-create flow integration** — need to confirm where
  `createPcNode` currently lives and slot in the
  `pc_starter_configs` default-row insert. Probably
  `lib/seeds/pc-starter-config.ts` + one-line call in the
  node-create action. Implementation task.
- **Handling loop-number-less edge cases** — the loop node
  must have a `loop_number` to be usable. The apply action
  errors gracefully if not; tasks.md will spec the exact UX.
- **Multi-node source semantics for future wizards** — spec-013
  will likely generate rows per encounter; the partial index
  `(autogen_source_node_id, autogen_wizard_key)` is fine for
  that shape. If ever a wizard wanted `source_node_id` to be
  null (e.g. "system-level" autogen), the schema allows it
  (column is nullable) but the partial index excludes those
  rows — that's a future concern.
- **RLS on the apply action itself** — the action checks
  "DM of the campaign" at the top; no RLS gate on the
  transactions INSERT because we use the admin client for the
  whole transaction. Consistent with spec-010's transaction
  creation flow.

