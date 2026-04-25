/**
 * Spec-013 — Encounter loot resolver.
 *
 * Pure, no I/O. Tested in `__tests__/encounter-loot-resolver.test.ts`.
 *
 * Chat-50 polish: money distribution is global (one decision per
 * draft), not per coin line. Coin lines are summed together and the
 * total is expanded by `draft.money_distribution`. Items keep their
 * per-line recipient_mode.
 *
 * Pipeline:
 *   1. Sum all coin-line denominations into one total bucket.
 *   2. Expand the bucket per `draft.money_distribution`:
 *      - 'stash' → one row to stashNodeId
 *      - 'pc' → one row to money_distribution.pc_id
 *      - 'split_evenly' → N rows via splitCoinsEvenly across
 *        participantPcIds (silent skip if N === 0)
 *   3. Expand each item line by its own recipient_mode:
 *      - 'pc' → 1 row to recipient_pc_id
 *      - 'stash' → 1 row to stashNodeId
 *   4. Merge coin rows by actor (sum) and item rows by (actor, name)
 *      (sum qty). Item merge is rare (would need duplicate lines
 *      with same actor + name) but defensive.
 *   5. Drop zero-result rows.
 *
 * Comments on coin lines are NOT propagated to ledger rows — they
 * are encounter-editor metadata only.
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

  // ── Step 1: sum all coin lines into one bucket ──
  const totalCoins = { cp: 0, sp: 0, gp: 0, pp: 0 }
  for (const line of draft.lines) {
    if (line.kind === 'coin') {
      totalCoins.cp += line.cp
      totalCoins.sp += line.sp
      totalCoins.gp += line.gp
      totalCoins.pp += line.pp
    }
  }
  const hasMoney =
    totalCoins.cp > 0 || totalCoins.sp > 0 || totalCoins.gp > 0 || totalCoins.pp > 0

  // ── Step 2: expand the money bucket per global distribution ──
  const expanded: EncounterLootDesiredRow[] = []

  if (hasMoney) {
    const dist = draft.money_distribution
    if (dist.mode === 'pc') {
      if (dist.pc_id) {
        expanded.push({
          kind: 'money',
          actor_pc_id: dist.pc_id,
          ...totalCoins,
        })
      }
      // pc_id missing → silent skip, validator surfaces it upstream
    } else if (dist.mode === 'stash') {
      expanded.push({
        kind: 'money',
        actor_pc_id: stashNodeId,
        ...totalCoins,
      })
    } else if (dist.mode === 'split_evenly') {
      if (participantPcIds.length > 0) {
        const splits = splitCoinsEvenly(totalCoins, participantPcIds.length)
        for (let i = 0; i < splits.length; i++) {
          expanded.push({
            kind: 'money',
            actor_pc_id: participantPcIds[i],
            ...splits[i],
          })
        }
      }
      // 0 participants → silent skip
    } else if (dist.mode === 'manual') {
      // Per-PC amounts; non-zero entries become rows. Sum-check is the
      // validator's job, not the resolver's — defence in depth.
      for (const [pcNodeId, coins] of Object.entries(dist.amounts)) {
        if (coins.cp + coins.sp + coins.gp + coins.pp === 0) continue
        expanded.push({
          kind: 'money',
          actor_pc_id: pcNodeId,
          ...coins,
        })
      }
    }
  }

  // ── Step 3: expand item lines per their own recipient_mode ──
  for (const line of draft.lines) {
    if (line.kind !== 'item') continue
    const target =
      line.recipient_mode === 'stash' ? stashNodeId : line.recipient_pc_id
    if (!target) continue
    expanded.push({
      kind: 'item',
      actor_pc_id: target,
      item_name: line.name,
      item_qty: line.qty,
    })
  }

  // ── Step 4: merge by (kind, actor, item_name) ──
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
  }

  // ── Step 5: drop zero-result rows ──
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
