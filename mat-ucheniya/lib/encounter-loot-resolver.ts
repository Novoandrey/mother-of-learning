/**
 * Spec-013 — Encounter loot resolver.
 *
 * Pure, no I/O. Tested in `__tests__/encounter-loot-resolver.test.ts`.
 *
 * Mirrors spec-012's `resolveDesiredRowSet` in shape and intent: take
 * the user-edited draft, expand each line by recipient_mode, and emit
 * the canonical desired-row set the apply action will reconcile
 * against. The bridging from `EncounterLootDesiredRow` →
 * spec-012's `DesiredRow` (with `wizardKey`, `sourceNodeId`,
 * `categorySlug`, `comment`, `canonicalKey`) happens in T014.
 *
 * Pipeline:
 *   1. Expand each line:
 *      - coin/`'pc'`        → 1 row to `recipient_pc_id`
 *      - coin/`'stash'`     → 1 row to `stashNodeId`
 *      - coin/`'split_evenly'` → N rows to `participantPcIds` via
 *        `splitCoinsEvenly` (skipped silently if N === 0; the panel
 *        validator surfaces the empty-participant warning)
 *      - item/`'pc'`        → 1 row to `recipient_pc_id`
 *      - item/`'stash'`     → 1 row to `stashNodeId`
 *   2. Merge by content key `(kind, actor_pc_id, item_name | null)`:
 *      - coin rows sharing actor → sum cp/sp/gp/pp
 *      - item rows sharing (actor, name) → sum qty
 *      - coin and item rows never merge (different kind)
 *   3. Drop zero-result rows AFTER merge — two coin lines that
 *      cancel out (positive on one, negative on another) wouldn't
 *      pass validation, but defence in depth.
 *
 * Invalid lines (e.g. `'pc'` recipient with null `recipient_pc_id`)
 * are dropped silently — validation rejects them upstream and an
 * untrusted draft from the DB shouldn't crash the resolver.
 */

import { splitCoinsEvenly } from './coin-split'
import type {
  EncounterLootDesiredRow,
  LootDraft,
} from './encounter-loot-types'

export type ResolveEncounterLootInput = {
  draft: LootDraft
  /**
   * PC node ids in initiative-application order
   * (`initiative DESC NULLS LAST → sort_order → created_at`). The
   * resolver does NOT re-sort — caller is responsible.
   */
  participantPcIds: string[]
  stashNodeId: string
}

export function resolveEncounterLootDesiredRows(
  input: ResolveEncounterLootInput,
): EncounterLootDesiredRow[] {
  const { draft, participantPcIds, stashNodeId } = input

  // ── Step 1: expand ──
  const expanded: EncounterLootDesiredRow[] = []

  for (const line of draft.lines) {
    if (line.kind === 'coin') {
      const coins = {
        cp: line.cp,
        sp: line.sp,
        gp: line.gp,
        pp: line.pp,
      }

      if (line.recipient_mode === 'pc') {
        if (!line.recipient_pc_id) continue
        expanded.push({
          kind: 'money',
          actor_pc_id: line.recipient_pc_id,
          ...coins,
        })
      } else if (line.recipient_mode === 'stash') {
        expanded.push({
          kind: 'money',
          actor_pc_id: stashNodeId,
          ...coins,
        })
      } else if (line.recipient_mode === 'split_evenly') {
        if (participantPcIds.length === 0) continue
        const splits = splitCoinsEvenly(coins, participantPcIds.length)
        for (let i = 0; i < splits.length; i++) {
          expanded.push({
            kind: 'money',
            actor_pc_id: participantPcIds[i],
            ...splits[i],
          })
        }
      }
    } else if (line.kind === 'item') {
      const target =
        line.recipient_mode === 'stash'
          ? stashNodeId
          : line.recipient_pc_id
      if (!target) continue
      expanded.push({
        kind: 'item',
        actor_pc_id: target,
        item_name: line.name,
        item_qty: line.qty,
      })
    }
  }

  // ── Step 2: merge by content key ──
  // Order is preserved by first-occurrence; later rows fold into the
  // earlier slot. This keeps the output stable regardless of how
  // many duplicate lines the DM added.
  const merged = new Map<string, EncounterLootDesiredRow>()
  for (const row of expanded) {
    const key = mergeKey(row)
    const prev = merged.get(key)
    if (!prev) {
      merged.set(key, { ...row })
      continue
    }
    if (row.kind === 'money' && prev.kind === 'money') {
      prev.cp += row.cp
      prev.sp += row.sp
      prev.gp += row.gp
      prev.pp += row.pp
    } else if (row.kind === 'item' && prev.kind === 'item') {
      prev.item_qty += row.item_qty
    }
    // mixed kind impossible per mergeKey design
  }

  // ── Step 3: drop zero-result rows ──
  const result: EncounterLootDesiredRow[] = []
  for (const row of merged.values()) {
    if (row.kind === 'money') {
      if (row.cp === 0 && row.sp === 0 && row.gp === 0 && row.pp === 0) continue
    } else {
      if (row.item_qty === 0) continue
    }
    result.push(row)
  }

  return result
}

function mergeKey(row: EncounterLootDesiredRow): string {
  if (row.kind === 'money') {
    return `money|${row.actor_pc_id}`
  }
  return `item|${row.actor_pc_id}|${row.item_name}`
}
