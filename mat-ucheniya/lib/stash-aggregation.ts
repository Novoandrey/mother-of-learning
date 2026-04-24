/**
 * Pure stash-aggregation helper — spec-011.
 *
 * Takes a flat array of "stash-touching" item legs (both legs of every
 * transfer group that references the stash as one actor) and collapses
 * them into a grid-ready `StashItem[]`:
 *
 *   current_qty(key) = Σ incoming.qty − Σ outgoing.qty
 *
 * - `direction='in'`  → leg with `actor_pc_id = stashId` (item appears
 *                       in the stash's ledger view)
 * - `direction='out'` → counterpart leg on a PC (item left the PC's
 *                       ledger view towards the stash, or vice versa)
 *
 * Items with net qty 0 are dropped. Negative-net items (data-integrity
 * red flag: more out than in) are kept with `warning: true` so the UI
 * can render them in red. Instances rendered in the expand-row are
 * *incoming* legs only — the UI lists "how this item got into the
 * stash", not the PC-side mirror entries.
 *
 * Forward-compat with spec-015: `keyFn` defaults to `itemName`; spec-015
 * will pass a key that includes `itemNodeId` so two items with the same
 * free-text name but different catalog nodes stay separate.
 *
 * Pure & async-free. No Supabase imports. Safe for vitest + SSR.
 */

import type { StashItem, StashItemInstance } from './stash';

export type StashItemLeg = {
  transactionId: string;
  transferGroupId: string | null;
  itemName: string;
  /** Absolute magnitude; direction is encoded in `direction`. Always ≥ 1. */
  qty: number;
  direction: 'in' | 'out';
  loopNumber: number;
  dayInLoop: number;
  createdAt: string;
  // Fields for the expand-row "instance" view. All nullable because
  // `ON DELETE SET NULL` FKs let PCs / sessions / authors disappear.
  sessionId: string | null;
  sessionTitle: string | null;
  droppedByPcId: string | null;
  droppedByPcTitle: string | null;
  comment: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
};

/**
 * Internal bucket type used during the fold. Tracks the running net
 * qty plus the "most recent leg" (for the grid's latest-loop/day
 * column) and the list of incoming legs reshaped into instances.
 */
type Bucket = {
  itemName: string;
  qty: number;
  latestLoop: number;
  latestDay: number;
  latestCreatedAt: string;
  instances: StashItemInstance[];
};

function legToInstance(leg: StashItemLeg): StashItemInstance {
  return {
    transactionId: leg.transactionId,
    transferGroupId: leg.transferGroupId,
    qty: leg.qty,
    droppedBy:
      leg.droppedByPcId !== null
        ? { pcId: leg.droppedByPcId, pcTitle: leg.droppedByPcTitle ?? '[deleted]' }
        : null,
    loopNumber: leg.loopNumber,
    dayInLoop: leg.dayInLoop,
    session:
      leg.sessionId !== null
        ? { id: leg.sessionId, title: leg.sessionTitle ?? '[deleted]' }
        : null,
    comment: leg.comment,
    author:
      leg.authorUserId !== null
        ? { userId: leg.authorUserId, displayName: leg.authorDisplayName }
        : null,
    createdAt: leg.createdAt,
  };
}

/**
 * `true` if leg B's (loop, day, createdAt) triple is strictly later than
 * the bucket's currently-tracked most-recent position.
 */
function isLaterThanBucket(leg: StashItemLeg, bucket: Bucket): boolean {
  if (leg.loopNumber !== bucket.latestLoop) return leg.loopNumber > bucket.latestLoop;
  if (leg.dayInLoop !== bucket.latestDay) return leg.dayInLoop > bucket.latestDay;
  return leg.createdAt > bucket.latestCreatedAt;
}

/**
 * Aggregate stash legs by a pluggable key (default: item name).
 *
 * See file-level docs for semantics. Deterministic output order: buckets
 * are emitted in the order they were first seen; instances inside each
 * bucket are sorted newest-first by `createdAt` (string compare is
 * safe — ISO-8601 timestamps sort lexicographically).
 */
export function aggregateStashLegs(
  legs: StashItemLeg[],
  keyFn: (leg: StashItemLeg) => string = (leg) => leg.itemName,
): StashItem[] {
  const buckets = new Map<string, Bucket>();

  for (const leg of legs) {
    const key = keyFn(leg);
    const delta = leg.direction === 'in' ? leg.qty : -leg.qty;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        itemName: leg.itemName,
        qty: 0,
        latestLoop: leg.loopNumber,
        latestDay: leg.dayInLoop,
        latestCreatedAt: leg.createdAt,
        instances: [],
      };
      buckets.set(key, bucket);
    }

    bucket.qty += delta;

    if (isLaterThanBucket(leg, bucket)) {
      bucket.latestLoop = leg.loopNumber;
      bucket.latestDay = leg.dayInLoop;
      bucket.latestCreatedAt = leg.createdAt;
    }

    if (leg.direction === 'in') {
      bucket.instances.push(legToInstance(leg));
    }
  }

  const out: StashItem[] = [];
  for (const b of buckets.values()) {
    if (b.qty === 0) continue;
    // Newest-first for the expand row.
    b.instances.sort((a, c) => c.createdAt.localeCompare(a.createdAt));
    out.push({
      itemName: b.itemName,
      qty: b.qty,
      latestLoop: b.latestLoop,
      latestDay: b.latestDay,
      instances: b.instances,
      ...(b.qty < 0 ? { warning: true as const } : {}),
    });
  }
  return out;
}
