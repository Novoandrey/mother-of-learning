# Implementation Plan: Common Stash (Общак)

**Branch**: `011-common-stash` | **Date**: 2026-04-24 | **Spec**:
`.specify/specs/011-common-stash/spec.md`

## Summary

**The stash is a node** of a new `is_base` type `stash`, one per
campaign. It plugs into spec-010 unchanged: `actor_pc_id` on
`transactions` already allows any node id (the column was named
for PCs but its FK is `nodes(id)`), so a money/item transfer
with one leg on the stash is a regular transfer pair — no new
kinds, no extra FKs. The column stays named `actor_pc_id` for
now; renaming it to `actor_node_id` is a TECH task (see Open
Questions), not a blocker for this spec.

**Schema delta is one migration (`035`) that does three things**:
(1) registers the `stash` `node_type` globally and seeds one
stash node for every existing campaign; (2) adds
`transactions.item_qty int not null default 1 check (item_qty
>= 1)` — the only column change in this spec; (3) updates the
`kind='item'` CHECK so item transactions keep qty as
meaningful metadata. Forward-compat with spec-015 is preserved
by *not* adding `item_node_id` yet — a later migration adds it
nullable with no backfill.

**Item transfers are a new writer path, not a schema change.**
`createTransfer` from spec-010 is money-only (it hardcodes
`kind='transfer'`). Spec-011 adds a sibling action
`createItemTransfer` that writes a pair of `kind='item'` rows
sharing a `transfer_group_id` — same shape on the wire, same
atomicity guarantees, different kind. Spec-015 will upgrade
this path in place by threading `item_node_id` through.

**The stash-page UI is a composition of two generic pieces**: a
`<WalletBlock>` (already exists — we widen its prop to accept
any node as the actor, not just a PC) and a new
`<InventoryGrid>` (new, generic). The grid's aggregation takes
an abstract key function so spec-015 can widen it from
`item_name` to `(item_node_id, item_name)` without touching the
component. The page lives at `/c/[slug]/accounting/stash` as a
sibling of the ledger, fitting the "accounting is a top-level
section" decision from spec-010's plan-v2.

**Two small UX pieces close the gap**: `<StashButtons>`
(put/take, rendered on every PC page and on the ledger actor
bar) and `<ShortfallPrompt>` (inline prompt inside the existing
transaction form when a money expense would overdraw). Both
wrap existing primitives; no new data flows.

**One new server-only helper** encapsulates the shortfall
arithmetic: `computeShortfall(walletGp, expenseGp, stashGp)`
returns `{ toBorrow, remainderNegative }` — pure, unit-tested.
The corresponding action `createExpenseWithStashShortfall` does
two writes (transfer pair + expense) in sequence from a single
server action; last-write-wins on any partial failure, same as
the rest of the project.

## Technical Context

**Stack**: Next.js 16 App Router + Supabase (Postgres) + Tailwind
v4. Working dir: `mat-ucheniya/`.

**New runtime dependencies**: none.

**New dev dependencies**: none (vitest already wired in
spec-010).

**Auth/RLS**: no new policies. The existing `tx_modify` policy
on `transactions` (`is_dm_or_owner OR author_user_id =
auth.uid()`) covers every write path in spec-011 as long as the
author is the user who initiated the action. No new policy on
the stash node itself — it's a regular `nodes` row; the
existing `nodes` RLS already gates read/write by campaign
membership. Ownership enforcement ("player may only initiate
stash transfers involving one of their own PCs") happens in the
app layer, same pattern as spec-010's transfer ownership check.

**Caching**: the stash page is `export const dynamic =
'force-dynamic'` — the item grid is a live aggregation, no
caching. Sidebar cache: **one invalidation moment**, when the
stash node is first created (migration 035 and the
`ensureCampaignStash` seeder). After that, stash transactions
touch neither `nodes` nor `node_types`, so no further
invalidations.

**Migrations**: one file, `035_stash_and_item_qty.sql`.

## Constitution Check

- ✅ **I. Loop as core** — stash is a wipeable-state actor; its
  current contents = replay of transactions where
  `loop_number = current`. Symmetric to PC wallet behaviour from
  spec-010. Spec-012 will fill the empty-new-loop gap.
- ✅ **II. Atomicity** — each transaction is one atomic row.
  Item transfer = two rows with a shared group id (same as
  money transfer in spec-010). Shortfall shortcut = one server
  action producing three rows; failures rolled back cleanly
  because we use a single multi-row insert for the transfer
  pair and a separate single-row insert for the expense.
- ✅ **III. Cross-refs** — stash is a real node, linkable from
  the ledger, from the sidebar, from the catalog. The item grid
  rows link back to the underlying transactions (transaction id
  → deep link on the ledger).
- ✅ **III-b. Flat nav** — stash is one plain node; the item
  grid is a **view lens** over flat `transactions` rows, not a
  new hierarchy. No "stash contains items" edges in this spec
  (spec-015 may add `item.located_in` edges but that's a
  different concept).
- ✅ **IV. Data-first** — stash contents are derived from the
  ledger. The grid is a UI lens; deleting the grid's code
  leaves the data intact.
- ✅ **V. Event sourcing** — every change is a transaction row;
  current contents = replay. Loop wipe is a view effect
  (different `loop_number` filter), not a destructive mutation.
- ✅ **VI. Reader** — the put/take buttons on the PC page keep
  the common flow one-tap. The form stays ≤ 3 fields for the
  money case; the qty field appears only in item mode.
- ✅ **VII. Every release shippable** — all seven P1 user
  stories ship together as a small coherent MVP. The P2 story
  (US8 filter by stash actor) is already covered by spec-010's
  filter UI and only needs the stash node to appear in the PC
  dropdown.
- ✅ **VIII. Simple stack** — one migration, one new action
  file, one new lib file, four new components, two modified
  components. No new dependencies.
- ✅ **IX. Universal** — stash is an `is_base` node_type so
  every campaign gets one automatically; no mat-ucheniya-
  specific hardcoding. The UI label "Общак" is stored as the
  node's `title` (editable per campaign) rather than a const.
  Default title for fresh campaigns = "Общак"; the DM can rename
  to "Party stash", "Guild vault", whatever.

**No violations** — the Complexity Tracking section is empty.

## Device & Mode Contract

Same split as spec-010. In practice spec-011 touches only
flows that are **already mobile-first** (the transaction form
and the PC page), and the one new desktop-primary surface is
the stash page item grid.

### Player-facing, mobile-first

- **`<StashButtons>`** — the two dedicated one-tap controls on
  the PC page and on the ledger actor bar. Big tap targets, no
  hover affordances.
- **Transaction form's item mode** — adds a qty numeric input
  (with +/− steppers for fat fingers). Kind switcher keeps its
  existing pill layout.
- **`<ShortfallPrompt>`** — inline banner above the save button
  when the expense would overdraw. One affirmative tap = accept
  and save. One negative tap = dismiss and save anyway. Never a
  separate modal.

### DM-facing, desktop-primary

- **Stash page** (`/c/[slug]/accounting/stash`) — the item grid
  is a desktop-primary surface. On mobile it collapses to a
  single-column stacked list with the same expand affordance;
  on `md+` it renders as a proper table with column headers.
  Filtering/grouping by category (FR-016) is a P2 hook that
  stays collapsed on mobile entirely.

### Both devices, same component

`<InventoryGrid>` is designed generic enough that mounting it
on a PC page later (future spec) is a prop change, not a
rewrite. Its responsive behaviour lives inside the component,
not at the mount site.

## Data Model

### `node_types`: new base type `stash`

Registered **globally** (`is_base = true`, `campaign_id IS
NULL`) so every campaign gets the stash type for free, no
per-campaign node_type seed needed.

```sql
insert into node_types (
  id, campaign_id, slug, label, icon, default_fields, sort_order, is_base
)
values (
  gen_random_uuid(), null, 'stash', 'Общак', '💰',
  '{}'::jsonb, 50, true
)
on conflict (campaign_id, slug) do update
  set label = excluded.label,
      icon = excluded.icon;
```

**Why `is_base=true`**: every campaign needs exactly one stash
node; making it base means the campaign init flow and the
migration both use the same `INSERT INTO nodes (type_id, ...)
SELECT id FROM node_types WHERE slug='stash' AND is_base=true`
pattern. Campaign-specific types (like `elective`) are used
for features the DM can opt in to; stash is not optional.

**Icon**: `💰` as the default. The DM can change it in the
catalog like any other node.

### `nodes`: seed one stash node per campaign

For mat-ucheniya and every existing campaign, the migration
inserts one stash node (`title = 'Общак'`, default fields). The
seed uses `not exists` to be idempotent:

```sql
insert into nodes (campaign_id, type_id, title, fields)
select c.id, nt.id, 'Общак', '{}'::jsonb
  from campaigns c
 cross join node_types nt
 where nt.slug = 'stash' and nt.is_base = true
   and not exists (
     select 1 from nodes n
      where n.campaign_id = c.id and n.type_id = nt.id
   );
```

For **new** campaigns, the `ensureCampaignStash(supabase,
campaignId)` helper (see Server Layer → Hooks) runs the
equivalent single-row insert inside
`initializeCampaignFromTemplate`.

### `transactions`: add `item_qty`

```sql
alter table transactions
  add column item_qty int not null default 1
             check (item_qty >= 1);
```

- `not null default 1` — every row gets a value; old rows
  backfill to 1.
- `check (item_qty >= 1)` — minimum 1 for every row, even money
  rows where the field is semantically unused. Zero is never
  valid (spec FR-013).
- No upper bound. The DM can write "1,000,000 arrows" if they
  want; the UI caps display at a sane number but the schema
  does not.

**No FK to an item node yet.** Spec-015 will add
`item_node_id uuid nullable references nodes(id) on delete set
null`. Because it will be nullable with no backfill, adding it
later is a single `alter table` — no data migration.

### No other schema changes

- No new column `actor_node_id` (we keep `actor_pc_id`
  pragmatically; rename is a TECH debt task).
- No new `status` value for "partially-covered shortfall" — the
  three rows stand on their own, edits warn instead of cascade.
- No `is_stash` flag on `nodes`. The type is the flag.

### RLS

No new policies. Existing policies cover both tables:

- `nodes`: campaign-member read, dm-or-owner write. The stash
  node is a plain node; creating it only ever happens via the
  admin client in the server seeder or the migration, so the
  RLS is effectively a safety net.
- `transactions`: `is_dm_or_owner` or `author_user_id =
  auth.uid()` — unchanged.

## Server Layer

### Types — `lib/stash.ts` (new)

```ts
import type { CoinSet, TransactionWithRelations } from './transactions'

export type StashMeta = {
  nodeId: string
  title: string     // 'Общак' for mat-ucheniya
  icon: string      // '💰' default
}

// One aggregated row in the inventory grid.
export type StashItem = {
  itemName: string
  qty: number                          // current_qty via FR-012
  latestLoop: number
  latestDay: number
  // Full per-instance history for the expand row.
  // Exactly the set of kind='item' incoming legs on the stash,
  // grouped and sorted newest-first.
  instances: StashItemInstance[]
}

export type StashItemInstance = {
  transactionId: string
  transferGroupId: string | null
  qty: number
  droppedBy: { pcId: string; pcTitle: string } | null  // null if the PC was deleted
  loopNumber: number
  dayInLoop: number
  session: { id: string; title: string } | null
  comment: string
  author: { userId: string; displayName: string | null } | null
  createdAt: string
}
```

### Aggregation — `lib/stash-aggregation.ts` (new, pure)

Split out of `lib/stash.ts` so it can be unit-tested without a
DB. The function takes a flat array of stash-touching item
legs and returns the aggregated `StashItem[]`:

```ts
import type { StashItem, StashItemInstance } from './stash'

export type StashItemLeg = {
  transactionId: string
  transferGroupId: string | null
  itemName: string
  qty: number
  direction: 'in' | 'out'         // 'in' if this leg's actor is the stash
  loopNumber: number
  dayInLoop: number
  createdAt: string
  // extra fields for the instance view
  sessionId: string | null
  sessionTitle: string | null
  droppedByPcId: string | null
  droppedByPcTitle: string | null
  comment: string
  authorUserId: string | null
  authorDisplayName: string | null
}

/**
 * Aggregate stash legs by item name.
 *
 *   current_qty(name) = Σ incoming.qty − Σ outgoing.qty
 *
 * - Items with current_qty = 0 are dropped.
 * - Items with current_qty < 0 are included with a `warning` flag
 *   (data-integrity signal; the UI renders a red badge).
 * - Instances are only the *incoming* legs, newest first.
 *   Outgoing legs are bookkeeping for the math; they don't
 *   appear in the grid (they belong to the PC that took the item).
 *
 * Forward-compat with spec-015: the aggregation key is taken
 * from the `keyFn` param, defaulting to `(leg) => leg.itemName`.
 * Spec-015 will pass a key that incorporates `itemNodeId`.
 */
export function aggregateStashLegs(
  legs: StashItemLeg[],
  keyFn?: (leg: StashItemLeg) => string,
): StashItem[]
```

Pure array transforms, no async. Fully vitest-covered.

### Shortfall math — `lib/transaction-resolver.ts` (extend)

Add one pure helper to the existing file (alongside
`resolveSpend`, `resolveEarn`):

```ts
/**
 * Decide how much to borrow from the stash to cover an expense.
 *
 *   toBorrow          = min(shortfall, stashAggregateGp)
 *   remainderNegative = shortfall − toBorrow
 *
 * Shortfall itself:
 *   shortfall = max(0, |expenseGp| − walletAggregateGp)
 *
 * If shortfall = 0 → no prompt should appear (FR-008).
 * If stashAggregateGp = 0 → toBorrow = 0 (partial-borrow
 * degrades to "full-negative-wallet" path).
 *
 * All inputs and outputs are in GP-equivalent (float, cp-precision).
 */
export function computeShortfall(
  walletGp: number,
  expenseGp: number,     // pass the full negative or positive amount; we take |…|
  stashGp: number,
): { shortfall: number; toBorrow: number; remainderNegative: number }
```

### Query helpers — `lib/stash.ts`

```ts
// Canonical way to resolve "the stash node for this campaign".
// Used everywhere a stash id is needed (page fetches, action
// validation, shortfall resolver). Wrapped in React `cache()`
// so one request → one DB hit.
export async function getStashNode(campaignId: string): Promise<StashMeta | null>

// The stash page's hero fetch: wallet block + item grid data.
export type StashContents = {
  wallet: Wallet                       // same shape as PC wallet
  items: StashItem[]
  recentTransactions: TransactionWithRelations[]   // last 10, newest first
}
export async function getStashContents(
  campaignId: string,
  loopNumber: number,
): Promise<StashContents>
```

`getStashContents` runs three queries in parallel
(`Promise.all`):

1. `SELECT amount_cp, amount_sp, amount_gp, amount_pp` scoped to
   `(actor_pc_id = stashId, loop_number, status = 'approved')`
   — sums per denomination for the wallet.
2. All `kind='item'` rows with `transfer_group_id` where either
   leg's actor is the stash in the current loop, joined to
   nodes for PC titles and sessions, joined to `auth.users`
   (via existing helper) for author display names. The result
   is a flat `StashItemLeg[]`; it passes through
   `aggregateStashLegs`.
3. Top-10 recent transactions where `actor_pc_id = stashId` in
   the current loop.

### Extend `createTransfer` — NO; add `createItemTransfer` — YES

`createTransfer` stays money-only (it is shipped, battle-tested,
and hard-codes `kind='transfer'`). A sibling action writes the
item case:

```ts
// app/actions/transactions.ts (new export alongside createTransfer)

export type ItemTransferInput = {
  campaignId: string
  senderPcId: string
  recipientPcId: string
  itemName: string
  qty: number
  categorySlug: string       // usually 'loot' or 'other'
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}

export async function createItemTransfer(
  input: ItemTransferInput,
): Promise<ActionResult<{ groupId: string }>>
```

**Writer semantics**:

1. Validate: `senderPcId != recipientPcId`; same loop; `qty >= 1`;
   `itemName.trim().length > 0`.
2. Ownership: if the user is a player, they MUST own the sender
   (same rule as `createTransfer`).
3. Generate `transfer_group_id = crypto.randomUUID()`.
4. One `.insert([legA, legB])` call, both legs
   `kind='item'`, `item_qty = input.qty`, amounts all zero,
   `transfer_group_id` shared. Postgres atomicity applies to
   the single multi-row insert.
5. No resolver, no coin math — items are atomic units.

### Stash-specific server actions — `app/actions/stash.ts` (new)

Thin convenience wrappers so the UI doesn't have to know which
PC is the stash:

```ts
'use server'

import { getStashNode } from '@/lib/stash'
import { createTransfer, createItemTransfer, createTransaction } from './transactions'
// ...

export async function putMoneyIntoStash(input: {
  campaignId: string
  actorPcId: string
  amountGp: number          // positive (UI collects magnitude)
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}): Promise<ActionResult<{ groupId: string }>> {
  const stash = await getStashNode(input.campaignId)
  if (!stash) return { ok: false, error: 'Общак не найден' }
  return createTransfer({
    ...input,
    senderPcId: input.actorPcId,
    recipientPcId: stash.nodeId,
    categorySlug: 'transfer',
  })
}

export async function takeMoneyFromStash(input: /* same shape as above */):
  Promise<ActionResult<{ groupId: string }>>     // reversed sender/recipient

export async function putItemIntoStash(input: {
  campaignId: string
  actorPcId: string
  itemName: string
  qty: number
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}): Promise<ActionResult<{ groupId: string }>>

export async function takeItemFromStash(input: /* same shape */):
  Promise<ActionResult<{ groupId: string }>>
```

**Shortfall shortcut** — the one place where the action is
non-trivial:

```ts
export type ShortfallExpenseInput = {
  campaignId: string
  actorPcId: string
  amountGp: number              // MAGNITUDE; sign applied inside (expense → negative)
  categorySlug: string          // the user-chosen expense category
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}

export type ShortfallExpenseResult =
  | { ok: true; transferGroupId: string | null; expenseId: string; borrowed: number; remainder: number }
  | { ok: false; error: string }

export async function createExpenseWithStashShortfall(
  input: ShortfallExpenseInput,
): Promise<ShortfallExpenseResult>
```

**Internals** (inside the one server action):

1. Resolve `stash = getStashNode(campaignId)` — bail if missing.
2. Fetch the PC's current wallet gp AND the stash's current
   wallet gp in parallel (two `getWallet` calls).
3. Run `computeShortfall(walletGp, input.amountGp, stashGp)`.
4. If `toBorrow > 0`: call `createTransfer({ senderPcId:
   stash.nodeId, recipientPcId: actorPcId, amountGp: toBorrow,
   categorySlug: 'transfer', comment: 'Покрытие: ' +
   input.comment, ... })`. Capture the group id.
5. Regardless of step 4, call `createTransaction({ actorPcId:
   input.actorPcId, kind: 'money', amountGp:
   -Math.abs(input.amountGp), categorySlug: input.categorySlug,
   comment: input.comment, ... })`. Capture the id.
6. Return `{ ok: true, transferGroupId, expenseId, borrowed:
   toBorrow, remainder: remainderNegative }`.

The whole action is one server-side sequence from the user's
perspective (one loading state, one toast). If step 4 succeeds
and step 5 fails, we leave the transfer pair in place and
surface an error — the user can see it in the ledger and
decide what to do. "All-or-nothing" would need a real Postgres
transaction; given the campaign convention of last-write-wins
and fast manual reconciliation, the extra complexity is not
worth the insurance. (If this turns out to bite, escalation is
a single `sql-level` function.)

### Ownership authorisation — same rules as spec-010

- DM or owner: everything allowed.
- Player: may call `putMoneyIntoStash` / `putItemIntoStash` /
  `takeMoneyFromStash` / `takeItemFromStash` only for a PC they
  own. `createExpenseWithStashShortfall` is gated the same way.
- Enforcement lives inside each action, **before** any write.
  Pattern copied from `createTransfer`'s existing ownership
  check (`isPcOwner` / `resolveAuth`).

### Hook — `lib/seeds/stash.ts` (new)

```ts
export async function ensureCampaignStash(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ created: boolean; nodeId: string }>
```

Idempotent: looks up the existing stash node first; creates one
only if missing. Called from `initializeCampaignFromTemplate`
right after `seedCampaignCategories`. Invalidates the sidebar
cache on actual creation (not on the no-op "already exists"
path).

### Existing helper adjustments

- `lib/transactions.ts`:
  - `Transaction` type gains `itemQty: number`.
  - `listRecentByPc` / `getLedgerPage` select `item_qty` in the
    underlying SELECT.
- `lib/campaign-actions.ts`:
  - After `seedCampaignCategories`, call
    `ensureCampaignStash(supabase, campaignId)`.
- `app/actions/transactions.ts`:
  - `createTransaction` input gains `itemQty?: number`, stored
    as 1 when omitted.
  - `updateTransaction` supports `itemQty` edit for item rows.
  - `createTransfer` gains a validation note: item transfers go
    through `createItemTransfer` (this one is money-only).

## UI Components

### `<StashButtons>` — `components/stash-buttons.tsx` (new, client)

**Device: mobile-first.** Two buttons side by side with big tap
targets. Rendered in two contexts:

- On the PC page (`/c/[slug]/catalog/[id]`) when the node is
  `type='character'`, next to the existing `+ Транзакция`
  button.
- On the ledger actor bar when the selected actor is a PC.

Props:

```ts
type Props = {
  campaignId: string
  actorPcId: string
  stashNodeId: string
  currentLoopNumber: number | null       // null = no current loop → buttons disabled
  defaultDay: number
  defaultSessionId: string | null
}
```

Each button opens `<TransactionFormSheet>` with:

- `initialKind = 'money'` (default; kind switcher still available)
- `initialTransferDirection = 'put-into-stash' | 'take-from-stash'`
- The counterpart is pre-selected and locked to the stash node
  (the recipient picker is hidden in this mode).

### `<InventoryGrid>` — `components/inventory-grid.tsx` (new, server)

**Device: responsive.** Table on `md+`, stacked cards on
mobile. Designed **generic** — no "stash" knowledge.

```ts
type Props<K extends string = string> = {
  items: InventoryGridItem<K>[]
  emptyMessage?: string            // default: "Пусто"
  canEdit?: boolean                // show delete-row affordance?
  onDelete?: (item: InventoryGridItem<K>) => Promise<void>
}

type InventoryGridItem<K extends string> = {
  key: K                           // aggregation key — e.g. itemName
  name: string                     // displayed in the first column
  qty: number
  latestLoop: number
  latestDay: number
  droppedBy: string                // "Marcus" | "multiple" | "[deleted character]"
  commentPreview: string           // ≤ 80 chars, elided
  instances: InventoryGridInstance[]    // for the expand row
  warning?: string                 // e.g. "current_qty < 0" (FR-012)
}

type InventoryGridInstance = {
  transactionId: string
  qty: number
  loopLabel: string                // "Петля 4 · день 8"
  sessionLink?: { href: string; label: string }
  authorLabel?: string
  comment: string
}
```

**Expand interaction**: each row has an inline chevron; clicking
toggles a sub-table below the row with one row per instance.
The expand state lives in the grid's local client state — no
URL sync. Only one row can be expanded at a time (collapse-on-
expand-other). Keyboard: `Enter` / `Space` on the row toggles.

**Grouping by category** (FR-016): not implemented in this
spec. The props type leaves room for a future `groupBy` prop
that would render accordion headers. Spec-015 will wire it up.

### `<ShortfallPrompt>` — `components/shortfall-prompt.tsx` (new, client)

**Device: mobile-first.** Inline banner inside the transaction
form, above the save button. Shows:

```
⚠ Не хватает 2 gp
   Добрать из общака? (в общаке сейчас 50 gp)
   [ Да, добрать и сохранить ]  [ Нет, уйти в минус ]
```

If the stash is poorer than the shortfall, the message adapts:

```
⚠ Не хватает 2 gp; в общаке только 1 gp
   Добрать из общака 1 gp + 1 gp в минус на персонаже?
   [ Да, добрать 1 gp + минус 1 gp ]  [ Нет, уйти в минус полностью ]
```

If the stash has zero gp, the prompt collapses to a plain
warning without a button (partial-borrow of 0 is identical to
declining — no point offering the yes button):

```
⚠ Не хватает 2 gp. Общак пуст.
   Сохранить расход (персонаж уйдёт в минус)?
   [ Да, сохранить ]  [ Отмена ]
```

Component is pure UI; the decision is wired up by
`<TransactionForm>` to call either
`createExpenseWithStashShortfall(...)` (with-borrow path) or
plain `createTransaction(...)` (no-borrow path).

### Modified: `<TransactionForm>` — `components/transaction-form.tsx`

Three touch-ups, all additive:

1. **Qty input for `kind='item'`.** Shown below the item name
   input. Integer stepper with min=1, default=1. Disabled in
   money/transfer modes.

2. **Stash-pinned transfer mode.** New prop
   `initialTransferDirection?: 'put-into-stash' |
   'take-from-stash' | null` (defaults to `null`). When set,
   the form starts in transfer mode with:
   - Kind switcher still available (can flip to item transfer;
     stays in stash-pinned mode).
   - Recipient picker is hidden (replaced by a read-only chip
     "→ Общак" / "← Общак").
   - Save calls `putMoneyIntoStash` / `takeMoneyFromStash` /
     `putItemIntoStash` / `takeItemFromStash` depending on the
     current kind — resolved in one place inside the form
     submit handler.

3. **Shortfall integration.** When the user is in money mode,
   amount < 0, and the aggregate magnitude > wallet, the form
   fetches the stash balance once (via a small server action
   `getStashAggregate(campaignId, loopNumber)`) and renders
   `<ShortfallPrompt>`. The fetch is cached in form state until
   the amount or actor PC changes. Save dispatches through the
   prompt's resolution.

### Modified: `<WalletBlock>` / `<WalletBlockClient>` — accept any node as actor

Today's `<WalletBlock>` takes a `pcId: string`. Rename the
underlying prop to `actorNodeId: string` and update call sites.
The stash page passes the stash node id; the PC page passes
the PC node id. Display labels stay the same — the block shows
aggregate gp + per-denom breakdown + recent transactions.

Recent transactions list: on the stash page, rows show the
**counterpart** (which PC put in / took out) in the "actor"
column rather than "Общак" (that would be tautological).

### Modified: `<LedgerActorBar>` — expose stash controls

Two small additions:

1. The actor dropdown now includes the stash as one more option
   alongside PCs (loaded via `getStashNode`).
2. When the selected actor is a PC, `<StashButtons>` renders in
   the bar's action row alongside "Доход" / "Расход" (same row,
   responsive wrap). When the stash is the selected actor, the
   buttons are hidden — stash→stash makes no sense.

### New: stash page — `app/c/[slug]/accounting/stash/page.tsx`

Server component. Dynamic (`export const dynamic =
'force-dynamic'`). Fetches:

- `getStashNode(campaignId)`
- current loop (via existing `getCampaignLoops`)
- `getStashContents(campaignId, currentLoopNumber)`
- membership (for `canEdit`)

Layout:

```
┌─────────────────────────────────────────────────────┐
│ 💰 Общак                      ПЕТЛЯ 4 · день 8     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  WalletBlock (wallet + top-10 recent)               │
│                                                     │
│  — — —                                              │
│                                                     │
│  Содержимое                          [+ Транзакция] │
│  ┌────────────────────────────────────────────────┐ │
│  │ Предмет            │ Кол-во │ Положил(а) │ … │ │
│  ├────────────────────────────────────────────────┤ │
│  │ ▸ silver amulet    │   2    │ multiple   │ … │ │
│  │ ▸ Свиток молнии    │   5    │ Marcus     │ … │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Catalog routing: `/c/[slug]/catalog/[id]` for a node with
`type='stash'` **redirects** to `/c/[slug]/accounting/stash`
(single source of truth for stash UI). The redirect lives at
the top of the catalog detail page, not in middleware.

### File plan

```
mat-ucheniya/
├── supabase/migrations/
│   └── 035_stash_and_item_qty.sql              (new)
├── lib/
│   ├── stash.ts                                 (new — types, StashMeta, StashItem, queries)
│   ├── stash-aggregation.ts                     (new — pure aggregateStashLegs)
│   ├── transaction-resolver.ts                  (modify — add computeShortfall)
│   ├── transactions.ts                          (modify — itemQty field, select updates)
│   ├── seeds/
│   │   └── stash.ts                             (new — ensureCampaignStash)
│   ├── campaign-actions.ts                      (modify — call ensureCampaignStash)
│   └── __tests__/
│       ├── stash-aggregation.test.ts            (new — vitest)
│       └── shortfall-resolver.test.ts           (new — vitest)
├── app/
│   ├── actions/
│   │   ├── transactions.ts                      (modify — createItemTransfer, itemQty)
│   │   └── stash.ts                             (new — put/take + shortfall)
│   └── c/[slug]/
│       ├── accounting/stash/
│       │   └── page.tsx                         (new — stash page)
│       └── catalog/[id]/page.tsx                (modify — redirect if type='stash')
├── components/
│   ├── stash-buttons.tsx                        (new, client)
│   ├── inventory-grid.tsx                       (new, server — generic)
│   ├── inventory-grid-row.tsx                   (new, client — expand behavior)
│   ├── shortfall-prompt.tsx                     (new, client)
│   ├── transaction-form.tsx                     (modify — qty, stash-pinned, shortfall)
│   ├── transaction-form-sheet.tsx               (modify — pass new props through)
│   ├── ledger-actor-bar.tsx                     (modify — add stash option, mount stash-buttons)
│   ├── wallet-block.tsx                         (modify — actorNodeId prop)
│   └── wallet-block-client.tsx                  (modify — same)
```

## Migration

### `035_stash_and_item_qty.sql` (new)

Structure:

1. **Register base node_type `stash`** (`is_base = true`,
   `campaign_id = null`) with `icon='💰'`, `label='Общак'`.
   Idempotent (`on conflict (campaign_id, slug) do update`).
2. **Seed one stash node per existing campaign.** Single `insert
   ... select from campaigns c cross join node_types nt ...
   where not exists (...)`. Idempotent.
3. **Add `transactions.item_qty int not null default 1 check
   (item_qty >= 1)`.** Backfills every existing row to 1; the
   CHECK is enforced from the `alter`.

No changes to indexes (existing indexes are still correct — the
new column isn't in any WHERE clauses we optimise for).
No trigger changes. No RLS changes.

**Rollback sketch** (documented in the migration header, not
run automatically): `alter table transactions drop column
item_qty; delete from nodes where type_id in (select id from
node_types where slug='stash' and is_base=true); delete from
node_types where slug='stash' and is_base=true;`. Idempotent
rollback fine.

**Sidebar cache**: the migration creates `nodes` rows, which
invalidates the sidebar dataset. For **dev / production
deployment** the invalidation is kicked from the CLI after
running the migration, via
`scripts/invalidate-sidebar-remote.ts mat-ucheniya` (the
existing endpoint from TECH-007). Each call re-invalidates one
campaign at a time; in production we currently only have
mat-ucheniya, so one invocation is enough. The seeder used by
`initializeCampaignFromTemplate` calls `invalidateSidebar`
in-process — no CLI needed.

## Invalidation Contract

- **Stash node creation** (migration + `ensureCampaignStash`
  seeder) → invalidate sidebar, once per campaign.
- **Transactions** (all create/update/delete paths — including
  `createItemTransfer`, `createExpenseWithStashShortfall`,
  stash put/take) → **no sidebar invalidation**; the data they
  touch is not in the sidebar cache.
- **Stash node rename / icon change** (DM editing the node in
  the catalog like any other node) → existing `nodes` update
  path invalidates the sidebar automatically.

Stash page (`/c/[slug]/accounting/stash/page.tsx`) is
`dynamic = 'force-dynamic'` — nothing to bust on its end.
Catalog detail page already dynamic.

## Validation Rules

Added to `lib/transaction-validation.ts`:

```ts
// Item transfer legs must share the same itemName, same qty.
// Identical rule for money legs (coins) already enforced by resolver.
export function validateItemTransfer(
  input: { itemName: string; qty: number },
): string | null

// Qty must be integer, ≥ 1.
export function validateItemQty(qty: number): string | null
```

Both helpers are called by `createItemTransfer` (server) and
`<TransactionForm>` (client). Single source of truth — same
pattern as spec-010.

## Performance

MVP volume assumption: ≤ 2000 transactions per campaign, ≤ 100
distinct item names in the stash per loop.

- **Stash wallet aggregate**: one indexed SELECT with `SUM()`
  over 4 denomination columns, scoped to
  `(actor_pc_id = stashId, loop_number, status='approved')`.
  Uses the existing `idx_tx_pc_loop` index. Rows scanned per
  request: ≤ 200 for a campaign at the upper bound. Well under
  100 ms.
- **Stash item aggregate**: one SELECT pulling all
  `kind='item'` rows touching the stash in the current loop,
  with joins to `nodes` (PCs and sessions) and
  `campaign_members → auth.users` (author). Rows scanned: ≤
  1000 legs for a campaign at the upper bound. The
  `idx_tx_pc_loop` index + filter on `kind='item'` is
  sufficient. No extra index is warranted for MVP.
- **Recent transactions**: uses
  `idx_tx_campaign_created` with a filter on actor = stash.
  Limit 10. Trivial.

**Escalation path**: if the item aggregate query exceeds 500 ms
on mat-ucheniya production, add a partial index `idx_tx_item_stash`
on `(actor_pc_id, kind, loop_number) where kind = 'item'`. Not
in this spec.

## Testing

Two new vitest files:

### `lib/__tests__/stash-aggregation.test.ts`

- **Empty input** → empty output.
- **Single incoming leg** (Marcus dropped 1 amulet) → one item,
  qty 1, one instance.
- **Two incoming legs, same name** → qty aggregated; two
  instances in the expand.
- **Three incoming + one outgoing** (Lex took 1) → qty = 2,
  **expand shows only the incoming legs** (per the aggregation
  rule).
- **Only outgoing legs, no incoming** → impossible in practice
  but tested for safety: qty = −N, warning flag set, item NOT
  hidden from the grid (FR-012).
- **Different names stay separate** (no fuzzy matching).
- **Custom `keyFn`**: pass a key function that adds a hypothetical
  `itemNodeId` into the key; aggregation respects it.
  Forward-compat canary.

### `lib/__tests__/shortfall-resolver.test.ts`

- **No shortfall** (wallet covers it) → `shortfall = 0`,
  `toBorrow = 0`.
- **Shortfall, stash rich** → `toBorrow = shortfall`,
  `remainderNegative = 0`.
- **Shortfall, stash poor** → `toBorrow = stashGp`,
  `remainderNegative = shortfall − stashGp`.
- **Shortfall, stash empty** → `toBorrow = 0`,
  `remainderNegative = shortfall`.
- **Zero expense** → all zeros (edge-case input the UI should
  not send, but the function must not NaN).

No component / E2E tests in this spec — relying on
hand-walkthroughs on mat-ucheniya production (same convention
as spec-009 / spec-010).

## Open Questions

None blocking. Three follow-ups I'm **not** solving in this
spec:

1. **Rename `actor_pc_id` → `actor_node_id`.** Cosmetic debt,
   becomes more important once we have multiple non-PC actors
   (stash in spec-011, locations possibly in spec-015). Target:
   one-shot rename migration + grep-and-replace of call sites.
   Tracked as a TECH task to file in backlog.
2. **Matching item names** — case-sensitive today (exact match
   in `aggregateStashLegs`). Typos produce "phantom" rows. In
   spec-015 this becomes moot (items are nodes with a stable
   `item_node_id`). We explicitly do not normalise names in
   spec-011 to keep the aggregation semantics crisp.
3. **Collapsed ledger view for transfer pairs.** Inherited
   open question from spec-010. Unchanged: still deferred
   until the two-row display feels noisy in practice.
