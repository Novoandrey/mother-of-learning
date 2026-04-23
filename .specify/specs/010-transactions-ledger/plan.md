# Implementation Plan: Transactions Ledger

**Branch**: `010-transactions-ledger` | **Date**: 2026-04-23 | **Spec**:
`.specify/specs/010-transactions-ledger/spec.md`

## Summary

**Architecture shift (clarified post-plan-v1).** "Бухгалтерия"
is a **top-level section** — an app-over-data — not a pair of
loose routes. Everything lives under `/c/[slug]/accounting/*`:
the ledger in `page.tsx`, DM category settings in
`settings/categories/`, and future sub-routes from the
bookkeeping roadmap (spec-011 stash, spec-013 loot, spec-014
approvals, spec-015 items) plug in as siblings without
restructuring. A "Бухгалтерия" link is added to the campaign's
top-level nav. Players see the ledger; DMs additionally see
category settings via a gated link inside the section.

**Data model stays flat.** Two new tables: a **scoped
`categories`** table (scope = `'transaction'` for spec-010,
`'item'` once spec-015 lands — no schema change) and
`transactions`. No hardcoded-enum taxonomies where editability
matters. The two CHECK'd enums that do stay hardcoded — `kind`
(money/item/transfer) and `status`
(pending/approved/rejected) — are structural invariants of the
model (each requires dedicated code paths), not
user-facing taxonomy.

**Temporal anchor is the in-game day** (spec Q1): every row
stores `loop_number` and `day_in_loop`; `session_id` is optional
metadata. Auto-fill for the form's day defaults to the PC's
**character frontier** (already computed by
`getCharacterFrontier()` from spec-009).

**Coin handling** is "smallest-first, no breaking" (spec Q3):
every money row stores exact `{cp, sp, gp, pp}` integer counts
(signed), wallets are computed by `SUM()` per denomination per
`(pc, loop_number)`. Primary form input is a single gp-equivalent
amount; at save time the server resolves the per-denom deduction
from the actor's current holdings. The D&D-5e denomination
ratios live in a single const map (`DENOMINATIONS`,
`GP_WEIGHT`) so the resolver and formatter iterate rather than
open-code each denom — adding a homebrew coin later is one
const + one migration, not a rewrite.

**Categories** are the scoped taxonomy (spec Q2): `slug` (en,
stable) + `label` (campaign language), seeded on campaign
creation, DM-editable, soft-deletable. Spec-010 reads/writes
only `scope='transaction'` rows; spec-015 will add
`scope='item'` rows via the same UI filtered by scope.

Writes go through server actions using the admin client plus
explicit ownership checks (mirrors
`updateSessionParticipants`) — RLS handles reads only. No
sidebar cache invalidation needed (new tables are not in the
sidebar cache).

## Technical Context

**Stack**: Next.js 16 App Router + Supabase (Postgres) +
Tailwind v4. Working dir: `mat-ucheniya/`.

**New runtime dependencies**: none. Uses existing
`@supabase/ssr`, `lucide-react`, React 19.

**New dev dependencies**: `vitest` (+ `@vitest/ui` optional).
Pure utilities (coin resolver, formatter, validation) are
unit-testable without a DB — cheap insurance at ~3–4 files of
setup. `npm run test` will wire into CI later. Placed under
`lib/__tests__/`.

**Auth/RLS**: new policies for `transactions` and `categories`
(see below). Reuse existing helpers: `is_member`,
`is_dm_or_owner`, `can_edit_node`.

**Caching**: none new. Transactions don't touch `nodes` or
`node_types`, so `sidebar-cache` is untouched. Both new
accounting routes (`/c/[slug]/accounting` and
`/c/[slug]/accounting/settings/categories`) are `export const
dynamic = 'force-dynamic'`.
PC-page Wallet block is hydrated by the PC detail route, which
is already dynamic.

**Migrations**: one file, `034_transactions_ledger.sql`. Matches
the project norm (one migration per spec, occasionally two).

## Constitution Check

- ✅ **I. Loop as core** — `loop_number` is required on every
  row; wallet is scoped to `(pc, loop_number)` by default.
- ✅ **II. Atomicity** — each transaction is one atomic row; a
  transfer is a logical pair linked by `transfer_group_id`,
  mutated only as a unit.
- ✅ **III. Cross-refs** — `actor_pc_id` (PC), `session_id`
  (session), `category_slug` (taxonomy); all rendered as links
  where meaningful.
- ✅ **III-b. Flat navigation** — transactions are their own
  table, not nodes; categories are a taxonomy table, not nodes.
  The "Бухгалтерия" section is a **navigation lens over flat
  data**, not a new hierarchy inside it. Grouping in the ledger
  (by PC / loop / category) is a view configuration, not
  structural.
- ✅ **IV. Data-first** — wallet is derived, not stored; the
  ledger page is a query; the "Бухгалтерия" tab is UI
  scaffolding around the same data everyone else reads. One
  taxonomy table serves both transactions (now) and items
  (spec-015) via `scope`.
- ✅ **V. Event sourcing** — transactions are the events;
  balances are the replay. Edit/delete are explicit corrections
  (not silent rewrites).
- ✅ **VI. Reader** — mobile form with ≤ 3 visible fields in the
  common case; day/loop/session live behind an expandable
  caption.
- ✅ **VII. Every release shippable** — P1 stories (US1–US4)
  ship as MVP; P2 stories (US5 transfer, US6 item, US7 category
  settings) can land in the same PR or follow-up.
- ✅ **VIII. Simple stack** — no new libraries for runtime; a
  small vitest dev-dep for pure utilities.
- ✅ **IX. Universal** — no mat-ucheniya-specific hardcoding in
  the schema. Categories are per-campaign, DM-editable, and
  scoped so the same table serves future taxonomies without a
  migration. Denomination ratios live in one const map
  (`DENOMINATIONS` / `GP_WEIGHT`) used by every pure helper —
  adding a homebrew coin is a const entry + one column, not a
  rewrite. The 4 D&D-5e columns remain as the MVP physical
  baseline (spec-level assumption); the future hook is
  `campaign_settings.currency_model`.

### What stays hardcoded (and why)

Two enums live as CHECK constraints in the `transactions` table
and are NOT user-editable:

- `kind ∈ (money, item, transfer)` — each kind drives a
  distinct code path (coin resolver for money, item-name
  validation for item, group-id linkage for transfer). Adding a
  kind requires new logic, not new data.
- `status ∈ (pending, approved, rejected)` — structural for the
  spec-014 approval flow. Adding a status requires code, not a
  settings edit.

Both are deliberate structural invariants, not gaps in editability.

## Device & Mode Contract

Constitution is explicit (Часть I → Два режима): **игрок =
читалка на телефоне, ДМ = рабочий стол**. Same data, different
lenses. Spec-010 has both kinds of flows; I split them here
rather than hope responsive CSS figures it out.

### Player-facing, mobile-first (required on phone)

- **Transaction form sheet** (`<TransactionFormSheet>` +
  `<TransactionForm>`). Opens as a bottom sheet on small
  viewports, a centered modal on `md+`. Three-field common case
  (amount, category, comment) — already set by FR-009.
- **PC Wallet block** (`<WalletBlock>`). Renders on
  `/c/[slug]/catalog/[id]` which is the player's home. Balance
  + top-10 transactions + "+ Transaction" button. Single-column
  layout on mobile, widened on `md+`.
- **Ledger row** (`<LedgerRow>`). Single-column stacked layout
  on mobile (amount → actor → comment → metadata); table-like
  row on `md+`.
- **Amount input**, **category dropdown**, **transfer
  recipient picker** — all mobile-first, big tap targets,
  no hover-dependent affordances.
- **Edit / delete own transaction from the Wallet block** —
  works the same on phone as on desktop; this is the player's
  "I mistyped 500 instead of 5" loop.

### DM-facing, desktop-primary (PC-only)

- **`/c/[slug]/accounting` ledger feed** with the full filter
  bar (`<LedgerFilters>`), multi-select PC / loop / category,
  day range, kind toggles. Filter bar is persistent on `md+`;
  on mobile it collapses to a single "Filters" button that
  opens a bottom sheet (so the page isn't broken on phone, but
  it's not the intended experience).
- **`/c/[slug]/accounting/settings/categories`**. DM settings
  page. Desktop-primary. On mobile, renders plainly without
  polish — nobody curates taxonomies at the table.
- **Bulk edits / multi-select in the ledger** — out of scope
  for spec-010, but when they land they're desktop-only by
  default.

### Both devices, same component

The Wallet block's "+ Transaction" button and the ledger's
"+ Transaction" button open the **same** form sheet. The form
doesn't care where it was opened from — only about its
auto-fill context (FR-010). The responsive breakpoint lives in
the sheet wrapper, not in the form body.

### What this means in practice

Tailwind breakpoints: default (mobile) styling is the
player-facing baseline; `md:` and `lg:` are opt-ins for the
DM-rich views. No separate mobile components and desktop
components — same components, responsive utility classes. This
matches the "one data, two lenses" principle and avoids the
dual-maintenance tax.

When a component can render on both but the user experience
differs (e.g. `<LedgerList>`), the difference is implemented as
CSS + conditional rendering inside one file. No `useIsMobile()`
hook — it's all media queries.

## Data Model

### Table: `categories` (new, multi-scope)

```sql
create table categories (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  scope         text not null default 'transaction'
                 check (scope in ('transaction','item')),
  slug          text not null,
  label         text not null,
  sort_order    int  not null default 0,
  is_deleted    boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (campaign_id, scope, slug)
);
create index idx_categories_campaign_scope
  on categories (campaign_id, scope)
  where is_deleted = false;
```

- `scope` — taxonomy domain. Spec-010 only writes/reads
  `'transaction'`. Spec-015 (items as nodes) will add `'item'`
  rows via the same UI filtered by scope. The CHECK constraint
  constrains the valid set today; a future migration can add
  new scopes (`alter table … drop constraint … add constraint`)
  without touching data.
- `slug` — stable English identifier, used in joins and URLs.
- `label` — display string in campaign language (Russian for
  mat-ucheniya).
- `is_deleted` — soft-delete. Categories that have historical
  rows stay queryable (for label rendering) but disappear from
  dropdowns for new entries.
- `sort_order` — DM-defined ordering in the settings UI and
  dropdown. Reordering UI is a stretch goal; MVP inserts in
  creation order.
- `unique (campaign_id, scope, slug)` — the same slug can exist
  under two different scopes (e.g. `expense` under
  `transaction` and, hypothetically, `expense` under `item`
  wouldn't collide). Ordinarily scopes have disjoint slugs, but
  the constraint keeps the door open.

Seeded per campaign by
`initializeCampaignFromTemplate` (see Server Layer → Hooks),
scope = `'transaction'`:

| slug       | label     | sort |
|------------|-----------|------|
| income     | Доход     | 10   |
| expense    | Расход    | 20   |
| credit     | Кредит    | 30   |
| loot       | Добыча    | 40   |
| transfer   | Перевод   | 50   |
| other      | Прочее    | 100  |

For mat-ucheniya (pre-existing campaign), the migration also
inserts these rows directly (idempotent, `on conflict do nothing`).

### Table: `transactions` (new)

```sql
create table transactions (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references campaigns(id) on delete cascade,

  -- actor & kind
  actor_pc_id        uuid references nodes(id) on delete set null,
  kind               text not null check (kind in ('money','item','transfer')),

  -- money amounts (signed; 0 for kind='item')
  amount_cp          int  not null default 0,
  amount_sp          int  not null default 0,
  amount_gp          int  not null default 0,
  amount_pp          int  not null default 0,

  -- item metadata
  item_name          text,  -- required iff kind='item', null otherwise

  -- classification + notes
  category_slug      text not null,
  comment            text not null default '',

  -- temporal anchor (day is primary; session is optional metadata)
  loop_number        int  not null,
  day_in_loop        int  not null,
  session_id         uuid references nodes(id) on delete set null,

  -- transfer linkage (both legs share this id)
  transfer_group_id  uuid,

  -- approval (for spec-014 future-proofing)
  status             text not null default 'approved'
                     check (status in ('pending','approved','rejected')),

  -- authorship & timestamps
  author_user_id     uuid not null references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- kind ↔ amount consistency
alter table transactions add constraint transactions_item_has_no_coins
  check (kind <> 'item'
         or (amount_cp = 0 and amount_sp = 0 and amount_gp = 0 and amount_pp = 0));

alter table transactions add constraint transactions_item_has_name
  check (kind <> 'item' or (item_name is not null and length(item_name) > 0));

alter table transactions add constraint transactions_money_no_item_name
  check (kind = 'item' or item_name is null);

-- money / transfer must have some non-zero amount
alter table transactions add constraint transactions_money_nonzero
  check (kind = 'item'
         or amount_cp <> 0 or amount_sp <> 0 or amount_gp <> 0 or amount_pp <> 0);

-- transfer has a group id
alter table transactions add constraint transactions_transfer_has_group
  check (kind <> 'transfer' or transfer_group_id is not null);

-- day in valid range (loop length check happens at the app layer)
alter table transactions add constraint transactions_day_range
  check (day_in_loop between 1 and 365);
```

**FK choices.** `actor_pc_id` is `SET NULL` on delete (spec edge
case: ledger renders "[deleted character]"). Same for
`session_id`. `campaign_id` is CASCADE — if the campaign goes,
all its transactions go. `author_user_id` is `SET NULL` because
user rows rarely disappear, but if they do, the ledger should
render "[unknown author]" rather than die.

**No FK on `category_slug`.** We join to `categories` at read
time by `(campaign_id, scope='transaction', category_slug)`. An
FK would force `categories` to enforce uniqueness on `slug`
alone (it currently isn't — uniqueness is per scope), and would
complicate soft-delete. The join is cheap.

**No FK on `loop_number`.** Roadmap convention: store the number
directly. If a loop node is renamed or renumbered (rare), we
accept drift — a follow-up migration can reconcile. Alternative
(`loop_id uuid` FK nodes) considered and rejected: joining
loops-by-id on every display query wastes a round-trip, and
`loop_number` is the thing humans type and link by.

### Indexes

```sql
-- Primary ledger query: campaign feed, newest first
create index idx_tx_campaign_created
  on transactions (campaign_id, created_at desc);

-- Wallet aggregate: balance per (pc, loop)
create index idx_tx_pc_loop
  on transactions (actor_pc_id, loop_number, status)
  where actor_pc_id is not null;

-- Session drill-down ("all transactions on this session")
create index idx_tx_session
  on transactions (session_id)
  where session_id is not null;

-- Transfer pair lookup ("fetch the other leg")
create index idx_tx_transfer_group
  on transactions (transfer_group_id)
  where transfer_group_id is not null;

-- Filter by category in the ledger
create index idx_tx_campaign_category
  on transactions (campaign_id, category_slug);
```

### `updated_at` trigger

```sql
create or replace function touch_transactions_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_transactions_updated_at
  before update on transactions
  for each row execute function touch_transactions_updated_at();
```

### RLS

```sql
alter table categories enable row level security;

create policy categories_select on categories
  for select to authenticated
  using (is_member(campaign_id));

-- All writes via server actions (admin client). We still declare
-- a narrow policy so direct-from-client inserts can't happen even
-- if a future route forgets to use admin.
create policy categories_modify on categories
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

alter table transactions enable row level security;

create policy tx_select on transactions
  for select to authenticated
  using (is_member(campaign_id));

-- Same reasoning: writes happen via admin client in server
-- actions. This policy is a safety net.
create policy tx_modify on transactions
  for all to authenticated
  using (
    is_dm_or_owner(campaign_id)
    or author_user_id = auth.uid()
  )
  with check (
    is_dm_or_owner(campaign_id)
    or author_user_id = auth.uid()
  );
```

**Note**: the policy's `with check` on `transactions` is
intentionally permissive (author can always write their own).
Finer control (player may only actor on their own PCs, transfer
counter-leg is ok even though they don't own the recipient, etc.)
is enforced in server-action code. Expressing it purely in SQL
is fragile; the app layer is the single source of truth.

## Server Layer

### Types — `lib/transactions.ts` (new)

```ts
export type CoinSet = {
  cp: number
  sp: number
  gp: number
  pp: number
}

export type TransactionKind = 'money' | 'item' | 'transfer'
export type TransactionStatus = 'pending' | 'approved' | 'rejected'

export type Transaction = {
  id: string
  campaign_id: string
  actor_pc_id: string | null
  kind: TransactionKind
  coins: CoinSet              // always present; all zeros for kind='item'
  item_name: string | null
  category_slug: string
  comment: string
  loop_number: number
  day_in_loop: number
  session_id: string | null
  transfer_group_id: string | null
  status: TransactionStatus
  author_user_id: string | null
  created_at: string
  updated_at: string
}

export type TransactionWithRelations = Transaction & {
  actor_pc_title: string | null       // '[deleted character]' if null
  session_title: string | null
  session_number: number | null
  category_label: string              // resolved from categories (scope='transaction')
  author_display_name: string | null
}

export type Wallet = {
  coins: CoinSet                      // signed per-denom balance
  aggregate_gp: number                // cp*0.01 + sp*0.1 + gp + pp*10
}

export type Category = {
  slug: string
  label: string
  sort_order: number
  is_deleted: boolean
}
```

### Pure utilities

**`lib/transaction-resolver.ts`** (new, pure, unit-tested):

```ts
import type { CoinSet } from './transactions'

/**
 * Denominations ordered smallest-to-largest. The whole resolver
 * + formatter iterate over this array; adding a homebrew coin
 * later is one entry here + one column in the migration, not a
 * code rewrite.
 */
export type Denom = 'cp' | 'sp' | 'gp' | 'pp'
export const DENOMINATIONS: readonly Denom[] = ['cp', 'sp', 'gp', 'pp']
export const GP_WEIGHT: Readonly<Record<Denom, number>> = {
  cp: 0.01,
  sp: 0.1,
  gp: 1,
  pp: 10,
}

export function aggregateGp(coins: CoinSet): number {
  return DENOMINATIONS.reduce((sum, d) => sum + coins[d] * GP_WEIGHT[d], 0)
}

/**
 * Resolve a spend: decide which coins to remove from holdings to
 * cover `target_gp` of outflow. Smallest denomination first, whole
 * coins only — never splits a larger coin into smaller ones.
 * Returns the negated coin set (all values ≤ 0) to be added to a
 * transaction row. If holdings cannot cover the target, the
 * returned set reflects only what was available; the caller is
 * responsible for the negative-balance display.
 */
export function resolveSpend(
  holdings: CoinSet,
  target_gp: number,
): CoinSet { /* iterate DENOMINATIONS in order */ }

/**
 * Resolve an earn: positive amount, credited to gp by default.
 */
export function resolveEarn(target_gp: number): CoinSet {
  return { cp: 0, sp: 0, gp: Math.round(target_gp * 100) / 100, pp: 0 }
  // Rounding note: 0.01-precision round to the hundredth, since
  // cp is the smallest unit. If target_gp has sub-cp precision,
  // the extra is rounded out (documented).
}

export function signedCoinsToStored(negate: boolean, coins: CoinSet): CoinSet {
  if (!negate) return coins
  return DENOMINATIONS.reduce(
    (acc, d) => ({ ...acc, [d]: -coins[d] }),
    {} as CoinSet,
  )
}
```

**`lib/transaction-format.ts`** (new, pure):

```ts
import type { CoinSet } from './transactions'
import { DENOMINATIONS } from './transaction-resolver'

/**
 * Format a signed coin set for display:
 *   { gp: 5 }                       → "5 GP"
 *   { cp: 100, sp: 20, gp: 2 }      → "5 GP (2 g, 20 s, 100 c)"
 *   { gp: -5 }                      → "−5 GP"
 *   { cp: 0, sp: 0, gp: 0, pp: 0 }  → "—"
 *
 * The aggregate gp value is always primary. The detail is appended
 * in parentheses only when more than one denomination is non-zero.
 * Sign is rendered once at the aggregate level; the parenthetical
 * breakdown uses absolute values. Iterates over DENOMINATIONS —
 * adding a coin is one const entry, not a format rewrite.
 */
export function formatAmount(coins: CoinSet): string { /* ... */ }

/**
 * Short single-denom labels: g, s, c, p.
 * Matches the "5 GP (2 g, 20 s, 100 c)" convention from the spec
 * clarifications.
 */
export const DENOM_SHORT: Record<keyof CoinSet, string> = {
  cp: 'c', sp: 's', gp: 'g', pp: 'p',
}
```

**`lib/transaction-validation.ts`** (new, pure):

```ts
export type ValidationError = string

export function validateAmountSign(amount_gp: number | null): ValidationError | null
export function validateDayInLoop(day: number, loopLength: number): ValidationError | null
export function validateTransfer(
  senderId: string, recipientId: string, loopA: number, loopB: number,
): ValidationError | null
```

All three exported back-to-back for client + server import.

### Query helpers — `lib/transactions.ts`

```ts
// List categories (excluding soft-deleted unless asked)
export async function listCategories(
  campaignId: string,
  opts?: { includeDeleted?: boolean },
): Promise<Category[]>

// Wallet for a (pc, loop) pair
export async function getWallet(
  pcId: string,
  loopNumber: number,
): Promise<Wallet>

// Recent N transactions for a PC in a loop (for the Wallet block)
export async function getRecentByPc(
  pcId: string,
  loopNumber: number,
  limit: number,
): Promise<TransactionWithRelations[]>

// Ledger page query — filters + cursor pagination
export type LedgerFilters = {
  pc?: string[]
  loop?: number[]
  dayFrom?: number
  dayTo?: number
  category?: string[]        // slugs
  kind?: TransactionKind[]
}
export type LedgerPage = {
  rows: TransactionWithRelations[]
  totals: { count: number; distinctPcs: number; netAggregateGp: number }
  nextCursor: string | null  // opaque, encodes (created_at, id)
}
export async function getLedgerPage(
  campaignId: string,
  filters: LedgerFilters,
  cursor: string | null,
  pageSize: number,
): Promise<LedgerPage>

// Single transaction (for edit view)
export async function getTransactionById(id: string): Promise<TransactionWithRelations | null>

// Transfer pair (both legs by group id)
export async function getTransferPair(groupId: string): Promise<
  [TransactionWithRelations, TransactionWithRelations] | null
>
```

All of these use `unwrapOne` / `unwrapMany` from
`lib/supabase/joins.ts` for joined shapes.

### Server actions — `app/actions/transactions.ts` (new)

```ts
'use server'

export type CreateTransactionInput = {
  campaignId: string
  actorPcId: string
  kind: 'money' | 'item'
  amountGp?: number          // for kind='money'; signed
  perDenomOverride?: CoinSet // rare path: explicit per-denom input
  itemName?: string          // for kind='item'
  categorySlug: string
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}

export async function createTransaction(input: CreateTransactionInput):
  Promise<{ ok: true; id: string } | { ok: false; error: string }>

export type UpdateTransactionInput = /* same shape as Create, plus id */

export async function updateTransaction(id: string, input: Partial<CreateTransactionInput>):
  Promise<{ ok: true } | { ok: false; error: string }>

export async function deleteTransaction(id: string):
  Promise<{ ok: true } | { ok: false; error: string }>

export type TransferInput = {
  campaignId: string
  senderPcId: string
  recipientPcId: string
  amountGp: number           // positive; sign is applied inside
  perDenomOverride?: CoinSet
  categorySlug: string       // defaults to 'transfer' in UI
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}

export async function createTransfer(input: TransferInput):
  Promise<{ ok: true; groupId: string } | { ok: false; error: string }>

export async function updateTransfer(groupId: string, input: Partial<TransferInput>):
  Promise<{ ok: true } | { ok: false; error: string }>

export async function deleteTransfer(groupId: string):
  Promise<{ ok: true } | { ok: false; error: string }>
```

**Ownership enforcement** inside every write action (pattern from
`updateSessionParticipants`):

1. Load `campaign_id` of the row(s).
2. Load `role` via `campaign_members`.
3. Branch:
   - `owner | dm` — proceed.
   - `player` — check `author_user_id = auth.uid()` (for updates/deletes)
     AND for creates, verify `actor_pc_id IN (SELECT node_id FROM node_pc_owners WHERE user_id = auth.uid())`. For transfers, the player must own the **sender** PC; the recipient PC check is skipped (the recipient is deliberately a PC they don't own).
4. Write via `createAdminClient()` (bypasses RLS; ok because we
   just did an explicit check).

**Resolver wiring for money creates/updates**:

1. If `perDenomOverride` present, use it (subject to sign rules).
2. Else, load current wallet (`getWallet(pcId, loopNumber)`),
   compute `resolveSpend(wallet.coins, -amountGp)` for spends or
   `resolveEarn(amountGp)` for earns, negate for spends, use that
   as the stored coin row.
3. Validate with `validateAmountSign` first.

**Transfer write path** (atomic-enough):

1. Validate `senderPcId != recipientPcId`, amounts, day range,
   same-loop rule.
2. Generate `transfer_group_id = crypto.randomUUID()`.
3. Resolve sender's coin outflow via `resolveSpend`.
4. Insert two rows in one `.insert([legA, legB])` call — Supabase
   batches into a single statement. Both rows share
   `transfer_group_id`. If the insert fails partway (rare),
   Postgres rolls back the single statement.
5. No explicit transaction block — we rely on the single
   multi-row insert being atomic.

**Edits of transfers** fetch both legs by `transfer_group_id`,
apply changes to both, issue one UPDATE per leg (two statements
— acceptable, last-write-wins on collisions per project
convention).

### Server actions — `app/actions/categories.ts` (new)

```ts
'use server'

export async function listCategoriesAction(campaignId: string, includeDeleted?: boolean):
  Promise<Category[]>

export async function createCategoryAction(campaignId: string, slug: string, label: string):
  Promise<{ ok: true; slug: string } | { ok: false; error: string }>

export async function renameCategoryAction(campaignId: string, slug: string, newLabel: string):
  Promise<{ ok: true } | { ok: false; error: string }>

export async function softDeleteCategoryAction(campaignId: string, slug: string):
  Promise<{ ok: true } | { ok: false; error: string }>

// MVP does not expose reorder; sort_order is only seeded.
```

All four gate on `is_dm_or_owner` via `getMembership`.

### Hook into `initializeCampaignFromTemplate`

Extend `lib/campaign-actions.ts` so a freshly-created campaign
also gets the default category seed:

```ts
// after seedCampaignSrd(supabase, campaignId)
await seedCampaignCategories(supabase, campaignId)
```

`seedCampaignCategories(supabase, campaignId)` lives in
`lib/seeds/categories.ts` (new), is idempotent (`on conflict
do nothing`), and inserts the six defaults above with
`scope='transaction'`. The existing mat-ucheniya campaign gets
the same six rows via the migration, not via this hook (because
`initializeCampaignFromTemplate` is only called for *new*
campaigns; mat-ucheniya is pre-existing).

## UI Components

### `components/transaction-form-sheet.tsx` (new, client)

**Device: mobile-first** (bottom sheet on small viewports;
centered modal on `md+`). Responsive breakpoint lives here, not
inside `<TransactionForm>`.

Mobile bottom-sheet wrapper that hosts the form. Props:

```ts
type Props = {
  open: boolean
  onClose: () => void
  campaignId: string
  actorPcId: string         // defaulted from parent context
  defaultLoopNumber: number
  defaultDayInLoop: number
  defaultSessionId: string | null
  initialKind?: 'money' | 'item' | 'transfer'
  editing?: TransactionWithRelations | null  // edit-mode seed
}
```

Internally uses the standard form tokens from STYLE.md. On
success, fires `onClose()` and triggers a router refresh so the
PC page / ledger page pick up the new row on the next render.

### `components/transaction-form.tsx` (new, client)

The actual form body. Default layout (kind='money'):

```
[  amount input (with +/− toggle)   ]     // FR-009 slot 1
[  category dropdown                ]     // FR-009 slot 2
[  comment (single line)            ]     // FR-009 slot 3

↓ "Loop 4 · day 9 · no session" (expand)  // auto-filled caption
     when tapped, reveals inline editors for loop/day/session
```

Kind switcher is a small tab control above the fields. "Item"
kind swaps the amount input for an item-name input. "Transfer"
kind adds a recipient PC picker.

Per-denom mode is an affordance inside the amount input (small
"… per coin" link that expands 4 numeric inputs inline).

### `components/wallet-block.tsx` (new, server)

**Device: mobile-first** (player's home is the PC page on a
phone; this block is the first thing they see).

Rendered on a PC's catalog detail page (`type='character'`).
Shows:

- Aggregate balance (e.g. `75.00 GP`) with the per-denom
  breakdown as a subtle caption (e.g. `0 c · 3 s · 75 g · 0 p`).
- Top 10 recent transactions (newest first) as compact rows,
  each with amount + category + comment + day + session link (if
  present).
- "View all →" link to the pre-filtered accounting section
  (`/c/[slug]/accounting?pc=<id>`).
- Empty state if zero transactions in the current loop.
- "+ Transaction" button (opens the sheet).

Layout: single column on mobile (stacked entries), two-column
(balance | recent list) on `md+`. Uses tokens from STYLE.md.

Fetched server-side in a single `Promise.all([getWallet,
getRecentByPc])` call.

### `components/ledger-list.tsx` (new, server + client)

**Device: desktop-primary**, responsive. On mobile, filter bar
collapses to a single "Filters" button opening a bottom sheet;
rows stack single-column (see `<LedgerRow>` below). On `md+`,
filter bar persists on top, rows laid out as a denser table.

Server component fetches the first page + initial filters from
URL params. Wraps a client component for the "Load more" button
and filter bar (URL-synced). Row rendering uses
`components/ledger-row.tsx`.

Filter bar (`components/ledger-filters.tsx`, client):

- PC filter: multi-select dropdown (fetched via
  `getCampaignPCs` — reuse from spec-009 / `app/actions/characters.ts`).
- Loop filter: multi-select of loop numbers.
- Day range: two numeric inputs.
- Category: multi-select dropdown.
- Kind: 3 checkboxes.
- "Clear filters" button.

State is synced to URL params (`?pc=<id>,<id>&loop=4&…`).
URL is the source of truth — the component reads `useSearchParams`.

### `components/category-settings.tsx` (new, client)

**Device: desktop-primary**, DM-only route. Renders plainly on
mobile without polish (nobody curates taxonomies at the table).

Rendered on `/c/[slug]/accounting/settings/categories` only when
`canEdit = true` (owner/dm). Lists active categories with inline
rename + soft-delete controls; a row of soft-deleted categories
appears below (collapsed by default). An "+ Add" affordance
opens an inline form with slug + label fields and basic slug
validation (lowercase, ASCII, `-`/`_`, no spaces). Takes a
`scope` prop (`'transaction'` for spec-010); spec-015 will
mount the same component at an item-categories route with
`scope='item'`.

### `components/amount-input.tsx` (new, client)

A composite input that by default shows one "gp-equivalent"
numeric field with a +/− toggle. A small link ("per-coin
details…") expands four numeric inputs (cp/sp/gp/pp) below,
collapses on blur-away. Controlled component; exposes the
current value as either `{ mode: 'gp', amount: number } | {
mode: 'denom', coins: CoinSet }` via `onChange`.

### `components/transfer-recipient-picker.tsx` (new, client)

Searchable dropdown of PC nodes in the campaign, excluding the
sender. Reuses the `getCampaignPCs` action. Small — this is a
single-select variant of the spec-009 `ParticipantsPicker`.

### `components/wallet-balance.tsx` (new, pure client)

Presentation-only: takes a `Wallet` and renders the aggregate gp
+ per-denom caption. Used by `WalletBlock` and possibly by the
ledger row's PC-cell tooltip in the future.

### `components/ledger-row.tsx` (new, server)

**Device: responsive.** Single-column stacked layout on mobile
(amount → actor → comment → metadata); two-column table-like
row on `md+`.

One row of the ledger. Columns (desktop view):

```
[ Loop 4 · Day 9 ]  [ Marcus ]  [ money / expense ]
                   -5 GP (2 g, 20 s, 100 c)
                   "potion at the market"
                   Session #27  ·  Marcus (you)
                   [ edit ] [ delete ]                (if allowed)
```

Edit/delete controls render conditionally:
`can_edit = isDmOrOwner || row.author_user_id === currentUserId`.

### Modifying existing files

- `app/c/[slug]/catalog/[id]/page.tsx` — if the node is
  `type='character'`, render `<WalletBlock>` above the existing
  detail UI.
- `app/c/[slug]/sessions/[id]/page.tsx` — add a compact
  "Transactions" section showing this session's rows (stretch;
  not a P1 blocker).
- `app/c/[slug]/layout.tsx` — add a **"Бухгалтерия"** link in
  the top-level navigation, pointing at `/c/[slug]/accounting`.
  Visible to every member (players need ledger access for their
  own bookkeeping). The category-settings sub-route is
  discoverable only from inside the section.
- `lib/campaign-actions.ts` — after `seedCampaignSrd`, call
  `seedCampaignCategories(supabase, campaignId)` so new
  campaigns auto-seed the six defaults with `scope='transaction'`.

### Section index behaviour

For spec-010, `/c/[slug]/accounting/page.tsx` **is** the ledger
— no separate redirect, no placeholder index. When spec-011
(stash) lands, that page either gains a top-row "Stash"
summary card (cheap) or gets split into
`/accounting/ledger` + `/accounting/stash` with a new index
dashboard. Both paths are cheap; we pick based on what spec-011
actually needs. This spec does NOT pre-build an empty index page.

## Migration

### `034_transactions_ledger.sql` (new)

Structure:

1. `create table categories` with the `scope` CHECK + the
   `(campaign_id, scope, slug)` uniqueness (+ index).
2. `create table transactions` (+ CHECK constraints, + indexes,
   + `updated_at` trigger).
3. Enable RLS + policies on both tables.
4. Seed `categories` (scope='transaction') for the mat-ucheniya
   campaign (scoped via `select c.id from campaigns c where
   c.slug = 'mat-ucheniya'`, idempotent via `on conflict do nothing`).

Idempotent and non-destructive (no `alter` on existing tables).
Rollback = `drop table transactions; drop table categories;`
(also drops the seed).

## File Plan

```
mat-ucheniya/
├── supabase/migrations/
│   └── 034_transactions_ledger.sql            (new)
├── lib/
│   ├── transactions.ts                        (new — types, queries)
│   ├── transaction-resolver.ts                (new — pure coin logic + DENOMINATIONS)
│   ├── transaction-format.ts                  (new — pure display)
│   ├── transaction-validation.ts              (new — pure validators)
│   ├── categories.ts                          (new — scoped category queries)
│   ├── seeds/
│   │   └── categories.ts                      (new — idempotent seed, scope='transaction')
│   ├── campaign-actions.ts                    (modify — call seed)
│   └── __tests__/
│       ├── transaction-resolver.test.ts       (new — vitest)
│       ├── transaction-format.test.ts         (new — vitest)
│       └── transaction-validation.test.ts     (new — vitest)
├── app/
│   ├── actions/
│   │   ├── transactions.ts                    (new — create/update/delete/transfer)
│   │   └── categories.ts                      (new — DM CRUD; scoped)
│   └── c/[slug]/
│       ├── accounting/
│       │   ├── page.tsx                       (new — ledger: list + filters)
│       │   └── settings/
│       │       └── categories/
│       │           └── page.tsx               (new — DM settings, scope='transaction')
│       ├── catalog/[id]/page.tsx              (modify — mount WalletBlock)
│       ├── sessions/[id]/page.tsx             (modify — transactions section, stretch)
│       └── layout.tsx                         (modify — «Бухгалтерия» nav link)
├── components/
│   ├── transaction-form.tsx                   (new, client)
│   ├── transaction-form-sheet.tsx             (new, client — mobile bottom-sheet)
│   ├── amount-input.tsx                       (new, client)
│   ├── category-dropdown.tsx                  (new, client — takes scope prop)
│   ├── transfer-recipient-picker.tsx          (new, client)
│   ├── wallet-block.tsx                       (new, server)
│   ├── wallet-balance.tsx                     (new, client)
│   ├── ledger-list.tsx                        (new, server + client)
│   ├── ledger-filters.tsx                     (new, client)
│   ├── ledger-row.tsx                         (new, server)
│   └── category-settings.tsx                  (new, client — takes scope prop)
├── package.json                               (modify — add vitest, script)
└── vitest.config.ts                           (new — minimal setup)
```

Note: `components/category-dropdown.tsx` and
`components/category-settings.tsx` both take a `scope` prop so
spec-015 can mount them at `/accounting/settings/items` (or
wherever item-categories live) with zero new component code.

## Invalidation Contract

Transactions and categories do not appear in the sidebar cache
(`lib/sidebar-cache.ts` — only `node_types` and `nodes` titles).
Therefore **no `invalidateSidebar` calls** are needed from any
transaction or category action.

- `/c/[slug]/accounting/page.tsx` (ledger): `export const
  dynamic = 'force-dynamic'`. No caching to bust.
- `/c/[slug]/accounting/settings/categories/page.tsx`: same.
- PC catalog detail page: already dynamic; picks up Wallet
  changes on next render.

If we later add caching on the ledger feed (`unstable_cache`
with a tag), we'll extend `AGENTS.md` with the invalidation
contract (pattern from spec-009 / sidebar cache). **Not in this
spec.**

## Validation Rules (central)

Single source of truth in `lib/transaction-validation.ts`, used
by both the client form (inline error) and the server action
(defense in depth):

```ts
// Zero amount is invalid for money / transfer
validateAmountSign(amountGp: number | null): string | null

// day_in_loop must be within the loop's length_days
validateDayInLoop(day: number, loopLength: number): string | null

// Transfer legs must share the same loop_number; sender != recipient
validateTransfer(senderId, recipientId, senderLoop, recipientLoop): string | null

// Per-denom: all values integer, no negative zero, at least one nonzero
validateCoinSet(coins: CoinSet): string | null
```

Loop length for validation is read from the `loop` node's
`fields.length_days` (from spec-009), falling back to 30. The
same helper `parseLengthDays` from `lib/loop-length.ts` is
imported where needed.

## Performance

MVP volume (≤ 500 transactions per campaign, 29 PCs):

- Wallet aggregate: one indexed SELECT with `SUM()` over 4
  columns, scoped to `(actor_pc_id, loop_number, status)`.
  Expected rows per PC/loop: ≤ 50. TTFB well under 100 ms.
- Ledger feed: index `(campaign_id, created_at desc)` handles
  both the "no filter" case and "PC filter" (post-filter on a
  small result set). For tight filters (category, loop) we rely
  on the composite index `(campaign_id, category_slug)` plus
  the `campaign_id` index on PC.
- Ledger summary: computed inside the paginated query as a
  second SELECT (same filter WHERE clause) to avoid N+1 on the
  row loop.

**Re-evaluate** if profiling on mat-ucheniya production shows >
500 ms TTFB on ledger-page first render: escalation path is a
materialized view `wallet_balances (pc, loop, cp, sp, gp, pp,
aggregate_gp)` refreshed on write. Not in this spec.

## Testing

`vitest` + pure utility tests:

- **`transaction-resolver.test.ts`**
  - exact match (500cp for 5gp)
  - small-only partial (100cp + 1gp for 2gp)
  - no small coins (deducts from gp)
  - insufficient holdings (returns partial, signals caller)
  - earn path (positive → gp pile)
  - rounding at cp precision

- **`transaction-format.test.ts`**
  - single denomination collapses (`5 GP`, not `5 GP (5 g)`)
  - multi-denom renders breakdown (`5 GP (2 g, 20 s, 100 c)`)
  - negative sign on aggregate only (`−5 GP (…)`)
  - zero coin set (`—`)

- **`transaction-validation.test.ts`**
  - zero amount rejected
  - day out of range rejected
  - transfer to self rejected
  - cross-loop transfer rejected

Wire-up: `npm run test` runs `vitest run`. CI wiring is not in
scope (the project has no CI yet).

No E2E or integration tests in this spec — we rely on hand
walkthroughs on mat-ucheniya production (spec-009 followed the
same convention).

## Open Questions

None blocking. Two follow-ups I'm parking for later (not this
spec):

1. **Collapsed transfer row in the ledger.** Currently a
   transfer renders as two rows. A future "collapse" view
   ("Marcus → Lex: 10 GP") is nice but adds branching to
   ledger-row rendering. Defer until the double-row display
   feels noisy in practice.
2. **Loop renumbering.** Since we store `loop_number` directly,
   renumbering a loop (rare) would orphan its historical
   transactions from that loop's display. If this becomes real,
   a small reconciliation script (`scripts/renumber-loop.ts`)
   will do the UPDATE.
