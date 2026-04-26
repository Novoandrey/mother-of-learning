/**
 * Spec-012 — Diff between desired and existing autogen rows.
 *
 * Pure, deterministic, no I/O. Unit-tested in
 * `__tests__/starter-setup-diff.test.ts`.
 *
 * Matching is by `canonicalKey`. For each canonical key:
 *   * only in `desired`  → insert
 *   * only in `existing` → delete
 *   * in both, identical → unchanged
 *   * in both, different → update
 *
 * "Identical" is a field-by-field content comparison: same kind, same
 * coins, same item name, same qty, same category, same comment. A
 * no-op reapply (unchanged config, no hand-edits) produces an empty
 * `toInsert` / `toUpdate` / `toDelete`.
 */

import type { CoinSet } from './transactions'
import type {
  DesiredRow,
  ExistingAutogenRow,
  RowDiff,
  UpdatePair,
} from './starter-setup'

/**
 * Compute the diff between the desired set (what reapply would produce
 * now) and the existing set (what the ledger currently holds).
 *
 * Orphan rows — rows in `existing` whose canonical key doesn't match
 * anything in `desired` AND whose actor is no longer in the campaign —
 * land in `toDelete` by default in this function. The apply action
 * filters orphans out at a higher level (see spec FR-014: deleted-PC
 * rows stay in place, the rerun leaves them alone). The diff-function
 * is intentionally naive — callers decide.
 *
 * Callers that DO want orphans preserved can post-process `toDelete`
 * to remove rows whose `actorPcId` is absent from the current PC
 * config list. The apply action does this (Phase 6 / T021).
 */
export function diffRowSets(
  desired: DesiredRow[],
  existing: ExistingAutogenRow[],
): RowDiff {
  const desiredByKey = new Map(desired.map((r) => [r.canonicalKey, r]))
  const existingByKey = new Map(existing.map((r) => [r.canonicalKey, r]))

  const toInsert: DesiredRow[] = []
  const toUpdate: UpdatePair[] = []
  const toDelete: ExistingAutogenRow[] = []
  const unchanged: ExistingAutogenRow[] = []

  // Pass 1: every desired row → match against existing
  for (const d of desired) {
    const e = existingByKey.get(d.canonicalKey)
    if (!e) {
      toInsert.push(d)
      continue
    }
    if (rowsMatch(d, e)) {
      unchanged.push(e)
    } else {
      toUpdate.push({ existing: e, desired: d })
    }
  }

  // Pass 2: existing rows with no matching desired → delete
  for (const e of existing) {
    if (!desiredByKey.has(e.canonicalKey)) {
      toDelete.push(e)
    }
  }

  return { toInsert, toUpdate, toDelete, unchanged }
}

// ─────────────────────────── helpers ───────────────────────────

function coinsEqual(a: CoinSet, b: CoinSet): boolean {
  return a.cp === b.cp && a.sp === b.sp && a.gp === b.gp && a.pp === b.pp
}

/**
 * Content comparison — what "nothing has changed" means for a single
 * row pair. If ANY of these differ, the row needs an UPDATE.
 *
 * Intentional exclusions: `id`, `handTouched` (apply resets it), source
 * node (would have already failed the key match if different).
 */
function rowsMatch(desired: DesiredRow, existing: ExistingAutogenRow): boolean {
  return (
    existing.kind === desired.kind &&
    coinsEqual(existing.coins, desired.coins) &&
    (existing.itemName ?? null) === (desired.itemName ?? null) &&
    (existing.itemNodeId ?? null) === (desired.itemNodeId ?? null) &&
    existing.itemQty === desired.itemQty &&
    existing.categorySlug === desired.categorySlug &&
    existing.comment === desired.comment
  )
}
