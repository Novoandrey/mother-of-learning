/**
 * Transfer-pair deduplication — spec-011 polish (IDEA-043).
 *
 * Background. Every transfer in the DB is two rows: sender leg (with
 * signed-negative amount / item_qty) and recipient leg (signed-positive),
 * linked by `transfer_group_id`. On per-actor views (PC wallet, stash
 * ledger tab with `fixedActorNodeId`) the actor filter already clips out
 * the sibling leg, so the user sees exactly one row per transfer. But on
 * the global `/accounting` feed without a PC filter, both legs land on
 * the page and the feed reads as mirrored dupes:
 *
 *   д.8 Мирияна → Общак · Амулет ×2
 *   д.8 Общак → Мирияна · Амулет ×2
 *
 * After the Slice A redesign this pattern is especially jarring — the
 * actor_bit arrow flips between the two rows and users understandably
 * think it's a duplicate entry.
 *
 * Fix: collapse each pair into a single canonical row — the sender leg,
 * which reads naturally left-to-right as "actor → counterparty" with a
 * negative-signed amount. The recipient leg is dropped from the view,
 * not the DB.
 *
 * Why sender leg specifically:
 *   • Direction reads correctly in actor_bit ("A → B" instead of "B → A
 *     with a positive sign").
 *   • Negative sign on amount matches how ledgers record movements
 *     (outflow-first convention).
 *   • If only one leg survives the DB (data corruption), we show
 *     whichever we have rather than discarding the signal.
 *
 * This helper is pure so it can run on the server (inside
 * `getLedgerPage`) for the bulk of the work and on the client (merging
 * paginated batches) to smooth boundaries between pages.
 */

import type { CoinSet, TransactionWithRelations } from './transactions';
import { aggregateGp } from './transaction-resolver';

/**
 * True when this leg is the sender side of a transfer — the leg that
 * outflowed. Works for both money-transfers (coins sum negative) and
 * item-transfers (`item_qty` negative).
 *
 * Legs with zero amounts (shouldn't happen — caught by a CHECK in
 * migration 034 / 036) and non-transfer rows return `false`. Callers
 * should gate this check behind `row.transfer_group_id != null`.
 */
export function isSenderLeg(tx: {
  kind: TransactionWithRelations['kind'];
  coins: CoinSet;
  item_qty: number;
  transfer_group_id: string | null;
}): boolean {
  if (!tx.transfer_group_id) return false;
  if (tx.kind === 'item') return tx.item_qty < 0;
  // money / transfer kinds
  return aggregateGp(tx.coins) < 0;
}

/**
 * Collapse transfer pairs down to their sender leg, preserving order.
 *
 * Algorithm:
 *   1. Walk rows in input order.
 *   2. Non-transfer rows pass through.
 *   3. For a transfer row, track its group in a map:
 *      - First sighting: keep the row (tentatively).
 *      - Later sighting of the sibling: if the current row is the
 *        sender leg and the stored one isn't, swap — drop the stored
 *        recipient, keep the sender at the new position. Otherwise
 *        drop the current row.
 *
 * The swap preserves input ordering for the kept leg: the sender leg
 * ends up wherever it occurred in the original sequence, not where its
 * sibling sat. Usually both legs share a timestamp (same-statement
 * INSERT) so ordering is stable in practice either way.
 *
 * Idempotent — running on already-deduped rows returns them unchanged.
 */
export function dedupTransferPairs<
  T extends {
    id: string;
    kind: TransactionWithRelations['kind'];
    coins: CoinSet;
    item_qty: number;
    transfer_group_id: string | null;
  },
>(rows: T[]): T[] {
  const byGroup = new Map<string, T>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.transfer_group_id) {
      out.push(row);
      continue;
    }
    const existing = byGroup.get(row.transfer_group_id);
    if (!existing) {
      byGroup.set(row.transfer_group_id, row);
      out.push(row);
      continue;
    }
    // Sibling already tracked. Prefer the sender leg.
    if (isSenderLeg(row) && !isSenderLeg(existing)) {
      const idx = out.indexOf(existing);
      if (idx !== -1) out.splice(idx, 1);
      byGroup.set(row.transfer_group_id, row);
      out.push(row);
    }
    // Otherwise: existing leg wins (either it's already sender, or both
    // are zero-amount — shouldn't happen, but we don't thrash).
  }
  return out;
}

/**
 * Count distinct "events" — non-transfer rows count as themselves,
 * transfer legs count as one per group. Used by ledger summary so the
 * figure matches what the user visually sees after dedup.
 *
 * Operates on the raw (pre-dedup) row set so the caller doesn't need
 * to keep both shapes around.
 */
export function countDistinctEvents(rows: {
  id: string;
  transfer_group_id: string | null;
}[]): number {
  const groups = new Set<string>();
  let nonTransferCount = 0;
  for (const r of rows) {
    if (r.transfer_group_id) groups.add(r.transfer_group_id);
    else nonTransferCount += 1;
  }
  return groups.size + nonTransferCount;
}
