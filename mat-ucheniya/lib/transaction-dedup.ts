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
    /**
     * Spec-055: expedition rows (see the section at the bottom of this file)
     * carry a «… вылазки: …» comment. Optional so older call sites and tests
     * that don't pass a comment still satisfy the bound — an absent comment
     * simply never matches `isExpeditionComment`.
     */
    comment?: string;
    /**
     * Spec-014 FR-004: both legs of a transfer share status by
     * construction. Defensive: we group by (transfer_group_id, status)
     * so that a hypothetical mixed-status pair (data corruption) is
     * NOT collapsed and surfaces as two rows. The status field is
     * optional in the type bound to keep this helper usable from older
     * call sites that don't carry status.
     */
    status?: 'pending' | 'approved' | 'rejected';
  },
>(rows: T[]): T[] {
  const byGroup = new Map<string, T>();
  const out: T[] = [];
  for (const row of rows) {
    if (!row.transfer_group_id) {
      out.push(row);
      continue;
    }
    // Spec-055: expedition groups share a transfer_group_id but are NOT a
    // two-leg transfer (1–3 rows: consumables / reward money / loot). Pass
    // every row through so the render layer can fold the group into one
    // summary (`groupExpeditionRows`). Collapsing them as a "pair" here would
    // silently drop the reward/loot legs — the very bug spec-055 R2 #5 fixes.
    if (isExpeditionComment(row.comment)) {
      out.push(row);
      continue;
    }
    // Defensive: separate buckets per (group, status). Mixed-status
    // pairs shouldn't exist (server actions enforce both legs share
    // status), but if one ever shows up we don't silently collapse it.
    const groupKey = `${row.transfer_group_id}|${row.status ?? 'approved'}`;
    const existing = byGroup.get(groupKey);
    if (!existing) {
      byGroup.set(groupKey, row);
      out.push(row);
      continue;
    }
    // Sibling already tracked. Prefer the sender leg.
    if (isSenderLeg(row) && !isSenderLeg(existing)) {
      const idx = out.indexOf(existing);
      if (idx !== -1) out.splice(idx, 1);
      byGroup.set(groupKey, row);
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

// ============================================================================
// Expedition grouping — spec-055 R2 (#5)
// ============================================================================
//
// A вылазка (`runExpedition`, app/actions/expeditions.ts) writes 1–3 ledger
// rows sharing ONE `transfer_group_id`, all with actor = the общак node:
//   • consumables spend — kind 'money', category 'expense',
//     comment «Расходники вылазки: <цель>»
//   • reward money      — kind 'money', category 'income',
//     comment «Награда вылазки: <цель>»
//   • reward loot       — kind 'item',  category 'loot' (one row per item),
//     comment «Награда вылазки: <цель>»
//
// They share a `transfer_group_id` but are NOT a transfer pair, so the two-leg
// `dedupTransferPairs` collapse is wrong for them. We detect them by their
// comment prefix and fold the whole group into one summary entry for the feed.

const EXPEDITION_COMMENT_RE = /^(?:Расходники|Награда) вылазки:\s*(.*)$/;

/** True when a comment was written by `runExpedition` (either leg-flavour). */
export function isExpeditionComment(
  comment: string | null | undefined,
): boolean {
  return typeof comment === 'string' && EXPEDITION_COMMENT_RE.test(comment);
}

/**
 * The вылазка's target (free text after «… вылазки: »). Empty string when the
 * comment isn't an expedition comment — callers guard with `isExpeditionComment`.
 */
export function parseExpeditionTarget(
  comment: string | null | undefined,
): string {
  if (typeof comment !== 'string') return '';
  const m = comment.match(EXPEDITION_COMMENT_RE);
  return m ? m[1].trim() : '';
}

/** Net composition of one вылазка, derived from its rows. */
export type ExpeditionSummary = {
  target: string;
  loopNumber: number;
  dayInLoop: number;
  sessionNumber: number | null;
  /** Positive magnitude spent on consumables (0 when none). */
  spentGp: number;
  /** Positive magnitude earned as reward money (0 when none). */
  earnedGp: number;
  /** Reward loot, one entry per item row, qty as a positive count. */
  items: { name: string; qty: number }[];
};

/**
 * Fold an expedition group's rows into its net summary. Money rows split into
 * spent (negative aggregate) / earned (positive); item rows become loot lines.
 * Pure and order-independent — target/loop/day are read from the rows (all
 * share them by construction).
 */
export function summarizeExpedition<
  T extends {
    kind: TransactionWithRelations['kind'];
    coins: CoinSet;
    item_qty: number;
    item_name: string | null;
    comment: string;
    loop_number: number;
    day_in_loop: number;
    session_number: number | null;
  },
>(rows: T[]): ExpeditionSummary {
  let spentGp = 0;
  let earnedGp = 0;
  let target = '';
  const items: { name: string; qty: number }[] = [];
  for (const r of rows) {
    if (!target) target = parseExpeditionTarget(r.comment);
    if (r.kind === 'item') {
      items.push({ name: r.item_name ?? '—', qty: Math.abs(r.item_qty) });
      continue;
    }
    const agg = aggregateGp(r.coins);
    if (agg < 0) spentGp += -agg;
    else earnedGp += agg;
  }
  const first = rows[0];
  return {
    target,
    loopNumber: first?.loop_number ?? 1,
    dayInLoop: first?.day_in_loop ?? 1,
    sessionNumber: first?.session_number ?? null,
    spentGp,
    earnedGp,
    items,
  };
}

/** One rendered ledger entry: a standalone row, or a folded expedition group. */
export type LedgerGroup<T> =
  | { kind: 'single'; row: T }
  | { kind: 'expedition'; groupId: string; rows: T[] };

/**
 * Fold expedition rows (shared `transfer_group_id` + «… вылазки: …» comment)
 * into one `expedition` entry each; every other row passes through as a
 * `single`. Order-preserving: an expedition entry sits where its FIRST row
 * appeared, later rows of the same group append to it.
 *
 * Runs AFTER `dedupTransferPairs` — which leaves expedition rows untouched and
 * collapses genuine transfer/purchase pairs to one row, so those arrive here
 * as singles and are never merged.
 */
export function groupExpeditionRows<
  T extends { transfer_group_id: string | null; comment: string },
>(rows: T[]): LedgerGroup<T>[] {
  const byGroup = new Map<
    string,
    { kind: 'expedition'; groupId: string; rows: T[] }
  >();
  const out: LedgerGroup<T>[] = [];
  for (const row of rows) {
    if (row.transfer_group_id && isExpeditionComment(row.comment)) {
      const gid = row.transfer_group_id;
      const existing = byGroup.get(gid);
      if (existing) {
        existing.rows.push(row);
      } else {
        const entry = { kind: 'expedition' as const, groupId: gid, rows: [row] };
        byGroup.set(gid, entry);
        out.push(entry);
      }
      continue;
    }
    out.push({ kind: 'single', row });
  }
  return out;
}
