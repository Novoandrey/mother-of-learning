/**
 * Spec-012 — Identify rows that need the DM's explicit confirmation
 * before reapply proceeds.
 *
 * Pure, no I/O. Tested in `__tests__/starter-setup-affected.test.ts`.
 *
 * Two inputs:
 *   * `diff` — what the reconcile would do to existing rows (update/delete/insert/unchanged)
 *   * `tombstones` — records of autogen rows the DM hand-deleted since the last apply
 *
 * Output: the set of rows the confirm dialog must list. Spec FR-013b.
 *
 * Rules:
 *   * Hand-touched row in `toUpdate` → `hand_edited`, show old vs new values
 *   * Hand-touched row in `toDelete` → `hand_edited`, show current value vs "будет удалено"
 *   * Tombstone whose key matches a `toInsert` row → `hand_deleted`, show "deleted by hand" vs new value
 *   * Tombstone with no matching desired insert (DM hand-deleted and config agrees nothing should be there) → NOT returned
 *
 * Sorted by actor pc id then wizard key for stable display.
 */

import type {
  AffectedRow,
  DesiredRow,
  ExistingAutogenRow,
  RowDiff,
  Tombstone,
} from './starter-setup'
import type { CoinSet } from './transactions'

/**
 * Options for `identifyAffectedRows` — optional maps from ids to
 * display titles. Falls back to the id string when absent.
 */
export type AffectedRowsOpts = {
  /** Map of actor_pc_id → human title ("Marcus", "Общак", etc). */
  actorTitles?: Map<string, string>
}

export function identifyAffectedRows(
  diff: RowDiff,
  tombstones: Tombstone[],
  opts: AffectedRowsOpts = {},
): AffectedRow[] {
  const out: AffectedRow[] = []

  // ─── Hand-touched rows in toUpdate ───
  for (const pair of diff.toUpdate) {
    if (!pair.existing.handTouched) continue
    out.push(buildAffected({
      reason: 'hand_edited',
      actor: pair.existing.actorPcId ?? '?',
      wizardKey: pair.existing.wizardKey,
      currentDisplay: formatRowValue(pair.existing),
      configDisplay: formatRowValue(pair.desired),
      itemName: pair.existing.itemName,
      actorTitles: opts.actorTitles,
    }))
  }

  // ─── Hand-touched rows in toDelete ───
  for (const existing of diff.toDelete) {
    if (!existing.handTouched) continue
    out.push(buildAffected({
      reason: 'hand_edited',
      actor: existing.actorPcId ?? '?',
      wizardKey: existing.wizardKey,
      currentDisplay: formatRowValue(existing),
      configDisplay: null, // will be deleted
      itemName: existing.itemName,
      actorTitles: opts.actorTitles,
    }))
  }

  // ─── Tombstones matching an insert ───
  const insertKeys = new Map(diff.toInsert.map((r) => [r.canonicalKey, r]))
  for (const tomb of tombstones) {
    const desired = insertKeys.get(tomb.canonicalKey)
    if (!desired) continue // orphan tombstone — DM deleted, config agrees
    out.push(buildAffected({
      reason: 'hand_deleted',
      actor: tomb.actorPcId ?? '?',
      wizardKey: tomb.wizardKey,
      currentDisplay: null, // deleted by hand
      configDisplay: formatRowValue(desired),
      itemName: tomb.itemName,
      actorTitles: opts.actorTitles,
    }))
  }

  // Stable order — actor title, then wizard key, then item name.
  out.sort((a, b) => {
    const actorCmp = a.actorTitle.localeCompare(b.actorTitle)
    if (actorCmp !== 0) return actorCmp
    const wizCmp = a.wizardKey.localeCompare(b.wizardKey)
    if (wizCmp !== 0) return wizCmp
    return (a.itemName ?? '').localeCompare(b.itemName ?? '')
  })

  return out
}

// ─────────────────────────── display formatting ───────────────────────────

function buildAffected(opts: {
  reason: 'hand_edited' | 'hand_deleted'
  actor: string
  wizardKey: AffectedRow['wizardKey']
  currentDisplay: string | null
  configDisplay: string | null
  itemName: string | null
  actorTitles?: Map<string, string>
}): AffectedRow {
  return {
    wizardKey: opts.wizardKey,
    actorPcId: opts.actor,
    actorTitle: opts.actorTitles?.get(opts.actor) ?? opts.actor,
    reason: opts.reason,
    currentDisplay: opts.currentDisplay,
    configDisplay: opts.configDisplay,
    itemName: opts.itemName,
  }
}

/**
 * One-line display of a row's value for the confirm dialog.
 *   * money: signed gp-equivalent, e.g. `+200 gp`, `-50 gp`
 *   * item: `name × qty`
 *   * transfer: shouldn't happen in spec-012 (wizards produce money
 *     or item; never transfer) — but if a future spec adds it, we
 *     fall back to a coin display
 */
function formatRowValue(
  row: { kind: string; coins: CoinSet; itemName: string | null; itemQty: number },
): string {
  if (row.kind === 'item') {
    return `${row.itemName ?? '?'} × ${row.itemQty}`
  }
  const aggregate =
    row.coins.cp * 0.01 +
    row.coins.sp * 0.1 +
    row.coins.gp +
    row.coins.pp * 10
  const sign = aggregate >= 0 ? '+' : ''
  // Trim trailing zeros: 200.00 → 200, 5.50 → 5.5
  const num = Number.isInteger(aggregate)
    ? aggregate.toFixed(0)
    : aggregate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
  return `${sign}${num} gp`
}
