/**
 * Generic autogen reconcile helpers — extracted from spec-012's
 * `applyLoopStartSetup` so spec-013 (encounter loot) can reuse the
 * exact same diff + apply primitives.
 *
 * Design:
 *
 *   * `computeAutogenDiff` — server-side, async. Loads existing
 *     autogen rows + tombstones for a given source node + wizard-keys
 *     filter, runs `diffRowSets`, applies the FR-014 orphan filter,
 *     hydrates actor titles, and computes the AffectedRow[] list for
 *     the two-phase confirm dialog. Returns the data the caller needs
 *     for either "needs confirmation" or "go ahead and apply".
 *
 *   * `applyAutogenDiff` — server-side, async. Calls the existing
 *     `apply_loop_start_setup` RPC (despite the loop-flavoured name —
 *     the RPC body is parametrically generic on
 *     `autogen_source_node_id`). spec-013 will likely call this same
 *     function with `wizardKey='encounter_loot'` once T014 lands. If
 *     spec-013 decides to bypass the RPC for its smaller payloads,
 *     it can compose the same toInsert/toUpdate/toDelete payloads
 *     manually — see the body for the exact shapes.
 *
 * Behavioural invariant for the carve-out (T004):
 *   * spec-012's existing 135 vitest tests pass with zero changes.
 *   * The `applyLoopStartSetup` action calls these two helpers in
 *     place of its inline orchestration. Surface API of the action
 *     (`applyLoopStartSetup(loopNodeId, opts)`) does not change.
 *
 * Why two helpers, not one:
 *   The two-phase confirm dialog requires the caller to inspect
 *   `affected.length > 0` and decide whether to short-circuit. Wrapping
 *   compute+apply behind a single function would force a `confirmed`
 *   flag, an `onAffected` callback, or an awkward "dry-run" return —
 *   all worse than letting the caller orchestrate.
 *
 * Why `wizardKeys` is `readonly string[]` and not the strict
 * `WizardKey` union:
 *   spec-012 ships with four keys; spec-013 adds `'encounter_loot'`;
 *   future specs may add more. The DB column has no CHECK constraint
 *   and the `WizardKey` type is closed-enum only at the spec-012
 *   layer. Keeping the param string-typed avoids a churn of every-
 *   spec-touching-the-type as the catalogue grows. App-layer
 *   `isKnownWizardKey()` (in `lib/starter-setup.ts`) is the single
 *   source of truth for legality.
 */

import type {
  AffectedRow,
  ApplySummary,
  DesiredRow,
  ExistingAutogenRow,
  RowDiff,
  Tombstone,
  WizardKey,
} from './starter-setup'
import { canonicalKey } from './starter-setup-resolver'
import { diffRowSets } from './starter-setup-diff'
import { identifyAffectedRows } from './starter-setup-affected'
import { createAdminClient } from './supabase/admin'
import { createClient } from './supabase/server'

// Re-export the types callers most often need together with these helpers.
// Saves spec-013 from importing half from `./autogen-reconcile` and half
// from `./starter-setup`.
export type {
  AffectedRow,
  ApplySummary,
  DesiredRow,
  ExistingAutogenRow,
  RowDiff,
  Tombstone,
}

// ─────────────────────────── computeAutogenDiff ───────────────────────────

export type ComputeAutogenDiffInput = {
  /**
   * Source node id (loop for spec-012, encounter mirror for spec-013).
   * Existing autogen rows + tombstones are loaded WHERE
   * `autogen_source_node_id = sourceNodeId`.
   */
  sourceNodeId: string

  /**
   * Subset of `autogen_wizard_key` values to consider. spec-012 passes
   * the four starter-setup keys; spec-013 will pass `['encounter_loot']`.
   * Reads outside this set are ignored (so two specs sharing a source
   * node — e.g. theoretical future overlap — wouldn't trample each
   * other's rows).
   */
  wizardKeys: readonly string[]

  /**
   * The reapply target — what the ledger SHOULD contain. Produced by
   * the spec's resolver (`resolveDesiredRowSet` for spec-012,
   * `resolveEncounterLootDesiredRows` for spec-013).
   */
  desiredRows: DesiredRow[]

  /**
   * FR-014 orphan filter. Existing rows whose `actorPcId` is NOT in
   * this set are preserved (kept out of `toDelete`) on the assumption
   * that the actor was removed since the previous apply and the row
   * is now an audit-trail orphan. Pass an empty array to disable
   * filtering — but spec-012 always passes the current PC + stash
   * list, and spec-013 should pass the encounter participants + stash.
   */
  validActorIds: readonly string[]
}

export type ComputeAutogenDiffOutput = {
  /** Post-orphan-filter diff. Safe to feed to `applyAutogenDiff`. */
  diff: RowDiff
  tombstones: Tombstone[]
  /**
   * Hand-touched + hand-deleted rows the DM must confirm before
   * proceeding. Empty array = no confirmation needed.
   */
  affected: AffectedRow[]
}

export async function computeAutogenDiff(
  input: ComputeAutogenDiffInput,
): Promise<ComputeAutogenDiffOutput> {
  const { sourceNodeId, wizardKeys, desiredRows, validActorIds } = input

  // 1. Load existing rows + tombstones for this source.
  const existing = await loadExistingAutogenRows(sourceNodeId, wizardKeys)
  const tombstones = await loadTombstones(sourceNodeId, wizardKeys)

  // 2. Diff desired vs existing (pure).
  const rawDiff = diffRowSets(desiredRows, existing)

  // 3. Apply FR-014 orphan filter on toDelete: rows whose actor is no
  //    longer a valid recipient stay put. The filter intentionally
  //    keeps actor==null rows out of toDelete too — spec-012 always
  //    sets actor, but defence in depth.
  const validSet = new Set(validActorIds)
  const toDelete = rawDiff.toDelete.filter(
    (r) => r.actorPcId != null && validSet.has(r.actorPcId),
  )
  const filteredDiff: RowDiff = { ...rawDiff, toDelete }

  // 4. Hydrate actor titles (one batched select on `nodes`) for the
  //    confirm-dialog display + identify which rows actually need
  //    confirmation.
  const actorIds = collectActorIds(filteredDiff, tombstones)
  const actorTitles = await fetchActorTitles(actorIds)
  const affected = identifyAffectedRows(filteredDiff, tombstones, {
    actorTitles,
  })

  return { diff: filteredDiff, tombstones, affected }
}

// ─────────────────────────── applyAutogenDiff ───────────────────────────

export type ApplyAutogenDiffInput = {
  /** Output of `computeAutogenDiff`, post-orphan-filter. */
  diff: RowDiff

  /**
   * The constants that go into every inserted row. The matching
   * `transactions` row will be created with these values plus the
   * per-row coin/item/category data from `diff.toInsert[i]`.
   */
  context: {
    campaignId: string
    sourceNodeId: string
    /**
     * Open-enum string (see header). spec-012 passes the per-row
     * wizard key from `DesiredRow.wizardKey` — but it lives on the
     * row, not on the context. The context's `wizardKey` is used
     * only when the diff has zero inserts and the caller wants to
     * record what kind of apply this was (currently unused).
     */
    wizardKey: WizardKey | string
    loopNumber: number
    dayInLoop: number
    authorUserId: string
  }
}

export async function applyAutogenDiff(
  input: ApplyAutogenDiffInput,
): Promise<ApplySummary> {
  const { diff, context } = input

  const toInsertPayload = diff.toInsert.map((r) => ({
    campaign_id: context.campaignId,
    actor_pc_id: r.actorPcId,
    kind: r.kind,
    amount_cp: r.coins.cp,
    amount_sp: r.coins.sp,
    amount_gp: r.coins.gp,
    amount_pp: r.coins.pp,
    item_name: r.itemName,
    item_qty: r.itemQty,
    category_slug: r.categorySlug,
    comment: r.comment,
    loop_number: context.loopNumber,
    day_in_loop: context.dayInLoop,
    author_user_id: context.authorUserId,
    autogen_wizard_key: r.wizardKey,
    autogen_source_node_id: context.sourceNodeId,
  }))

  const toUpdatePayload = diff.toUpdate.map((pair) => ({
    id: pair.existing.id,
    amount_cp: pair.desired.coins.cp,
    amount_sp: pair.desired.coins.sp,
    amount_gp: pair.desired.coins.gp,
    amount_pp: pair.desired.coins.pp,
    item_name: pair.desired.itemName,
    item_qty: pair.desired.itemQty,
    category_slug: pair.desired.categorySlug,
    comment: pair.desired.comment,
  }))

  const toDeleteIds = diff.toDelete.map((r) => r.id)

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('apply_loop_start_setup', {
    // Despite the loop-flavoured RPC name, p_loop_node_id is just
    // the autogen_source_node_id used for both insert tagging and
    // tombstone cleanup. The RPC body is generic. spec-013 reuses
    // this RPC with the encounter mirror node id.
    p_loop_node_id: context.sourceNodeId,
    p_to_insert: toInsertPayload,
    p_to_update: toUpdatePayload,
    p_to_delete: toDeleteIds,
  })

  if (error) {
    throw new Error(`applyAutogenDiff RPC failed: ${error.message}`)
  }

  // RPC returns table(inserted, updated, deleted, tombstones_cleared).
  // Supabase unwraps a single-row table result as an array of one row.
  type RpcRow = {
    inserted: number
    updated: number
    deleted: number
    tombstones_cleared: number
  }
  const first = Array.isArray(data)
    ? (data[0] as RpcRow | undefined)
    : (data as RpcRow | null)

  return {
    insertedCount: first?.inserted ?? 0,
    updatedCount: first?.updated ?? 0,
    deletedCount: first?.deleted ?? 0,
    tombstonesCleared: first?.tombstones_cleared ?? 0,
  }
}

// ─────────────────────────── local helpers ───────────────────────────

async function loadExistingAutogenRows(
  sourceNodeId: string,
  wizardKeys: readonly string[],
): Promise<ExistingAutogenRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'id, actor_pc_id, kind, amount_cp, amount_sp, amount_gp, amount_pp, item_name, item_qty, category_slug, comment, autogen_wizard_key, autogen_source_node_id, autogen_hand_touched',
    )
    .eq('autogen_source_node_id', sourceNodeId)
    .in('autogen_wizard_key', wizardKeys as string[])
    // Spec-014: pending/rejected rows must not participate in reconcile.
    // Autogen always writes `approved` (DM-only path), so this is a
    // defensive belt-and-braces filter — any pending/rejected row tagged
    // with autogen markers (legacy data, manual SQL, etc.) is ignored.
    .eq('status', 'approved')

  if (error) {
    throw new Error(`loadExistingAutogenRows failed: ${error.message}`)
  }

  type Row = {
    id: string
    actor_pc_id: string | null
    kind: 'money' | 'item' | 'transfer'
    amount_cp: number
    amount_sp: number
    amount_gp: number
    amount_pp: number
    item_name: string | null
    item_qty: number
    category_slug: string
    comment: string
    autogen_wizard_key: WizardKey
    autogen_source_node_id: string
    autogen_hand_touched: boolean
  }

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    wizardKey: r.autogen_wizard_key,
    sourceNodeId: r.autogen_source_node_id,
    actorPcId: r.actor_pc_id,
    kind: r.kind,
    coins: {
      cp: r.amount_cp,
      sp: r.amount_sp,
      gp: r.amount_gp,
      pp: r.amount_pp,
    },
    itemName: r.item_name,
    itemQty: r.item_qty,
    categorySlug: r.category_slug,
    comment: r.comment,
    handTouched: r.autogen_hand_touched,
    canonicalKey: canonicalKey(r.autogen_wizard_key, {
      actorPcId: r.actor_pc_id ?? '',
      itemName: r.item_name,
    }),
  }))
}

async function loadTombstones(
  sourceNodeId: string,
  wizardKeys: readonly string[],
): Promise<Tombstone[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('autogen_tombstones')
    .select(
      'id, campaign_id, autogen_wizard_key, autogen_source_node_id, actor_pc_id, kind, item_name, deleted_at',
    )
    .eq('autogen_source_node_id', sourceNodeId)
    .in('autogen_wizard_key', wizardKeys as string[])

  if (error) {
    throw new Error(`loadTombstones failed: ${error.message}`)
  }

  type Row = {
    id: string
    campaign_id: string
    autogen_wizard_key: WizardKey
    autogen_source_node_id: string
    actor_pc_id: string | null
    kind: 'money' | 'item' | 'transfer'
    item_name: string | null
    deleted_at: string
  }

  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    wizardKey: r.autogen_wizard_key,
    sourceNodeId: r.autogen_source_node_id,
    actorPcId: r.actor_pc_id,
    kind: r.kind,
    itemName: r.item_name,
    deletedAt: r.deleted_at,
    canonicalKey: canonicalKey(r.autogen_wizard_key, {
      actorPcId: r.actor_pc_id ?? '',
      itemName: r.item_name,
    }),
  }))
}

function collectActorIds(diff: RowDiff, tombstones: Tombstone[]): Set<string> {
  const ids = new Set<string>()
  for (const pair of diff.toUpdate) {
    if (pair.existing.actorPcId) ids.add(pair.existing.actorPcId)
  }
  for (const r of diff.toDelete) {
    if (r.actorPcId) ids.add(r.actorPcId)
  }
  for (const t of tombstones) {
    if (t.actorPcId) ids.add(t.actorPcId)
  }
  return ids
}

async function fetchActorTitles(
  ids: Set<string>,
): Promise<Map<string, string>> {
  if (ids.size === 0) return new Map()
  const admin = createAdminClient()
  const { data } = await admin
    .from('nodes')
    .select('id, title')
    .in('id', Array.from(ids))

  const m = new Map<string, string>()
  for (const t of (data ?? []) as Array<{ id: string; title: string }>) {
    m.set(t.id, t.title)
  }
  return m
}
