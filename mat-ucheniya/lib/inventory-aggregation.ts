/**
 * Inventory aggregation — spec-015 (pure).
 *
 * Generalises the spec-011 stash fold (`aggregateStashLegs`) to work
 * on any actor (PC or stash) and to dedupe by `itemNodeId` when the
 * leg has one — falling back to `itemName` for free-text legs.
 *
 * The fold rule:
 *   net_qty(key) = Σ incoming.qty − Σ outgoing.qty
 *
 * Default `keyFn` is:
 *   (leg) => leg.itemNodeId ?? `name:${leg.itemName}`
 *
 * The `name:` prefix is collision-proof — a free-text "abc-123" leg
 * will never accidentally key against a node uuid that happens to be
 * "abc-123". Linked items share a bucket regardless of historical
 * `item_name` snapshots; free-text items dedupe by name only.
 *
 * Negative-net buckets are kept with `warning: true` (data-integrity
 * red flag); zero-net buckets are dropped. Instances list incoming
 * legs only, newest-first by `createdAt`.
 *
 * No Supabase imports. Vitest-safe.
 */

/**
 * One leg = one half of one transaction's contribution to an actor's
 * inventory. For non-transfer item rows, there's a single leg per row.
 * For transfer rows, both legs of the pair appear (one direction per
 * actor).
 *
 * `itemNodeId` is NULL for free-text legs (pre-spec-015 rows or rows
 * the DM didn't link in the typeahead).
 */
export type ItemLeg = {
  transactionId: string;
  transferGroupId: string | null;
  itemNodeId: string | null;
  itemName: string;
  /** Absolute magnitude (≥ 1); direction encoded in `direction`. */
  qty: number;
  direction: 'in' | 'out';
  loopNumber: number;
  dayInLoop: number;
  createdAt: string;
  // Instance-row metadata. All nullable because ON DELETE SET NULL
  // FKs let referenced rows disappear.
  sessionId: string | null;
  sessionTitle: string | null;
  /** Counterparty PC for transfers; NULL for non-transfer item rows. */
  droppedByPcId: string | null;
  droppedByPcTitle: string | null;
  comment: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
};

export type ItemInstance = {
  transactionId: string;
  transferGroupId: string | null;
  qty: number;
  /** `null` if the counterparty PC was deleted. */
  droppedBy: { pcId: string; pcTitle: string } | null;
  loopNumber: number;
  dayInLoop: number;
  /** `null` if the session was deleted. */
  session: { id: string; title: string } | null;
  comment: string;
  /** `null` if the author's account is gone or never set. */
  author: { userId: string; displayName: string | null } | null;
  createdAt: string;
};

/** One aggregated inventory row. */
export type InventoryAggregateRow = {
  /** Stable display name. For linked rows: most-recent leg's `itemName` (which is the snapshot at write time). */
  itemName: string;
  /** Catalog node id when the bucket is linked; NULL for free-text. */
  itemNodeId: string | null;
  /** Net qty (in − out). Never 0 (filtered). May be < 0 (warning). */
  qty: number;
  latestLoop: number;
  latestDay: number;
  /** Incoming legs only, newest-first. */
  instances: ItemInstance[];
  /** `true` when net qty < 0. UI renders red. */
  warning?: true;
};

/** Internal fold state. */
type Bucket = {
  itemName: string;
  itemNodeId: string | null;
  qty: number;
  latestLoop: number;
  latestDay: number;
  latestCreatedAt: string;
  instances: ItemInstance[];
};

function legToInstance(leg: ItemLeg): ItemInstance {
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

function isLaterThanBucket(leg: ItemLeg, bucket: Bucket): boolean {
  if (leg.loopNumber !== bucket.latestLoop) return leg.loopNumber > bucket.latestLoop;
  if (leg.dayInLoop !== bucket.latestDay) return leg.dayInLoop > bucket.latestDay;
  return leg.createdAt > bucket.latestCreatedAt;
}

export type AggregateOpts = {
  /** Override the default `(leg) => leg.itemNodeId ?? \`name:${leg.itemName}\``. */
  keyFn?: (leg: ItemLeg) => string;
};

/**
 * Aggregate item legs into one row per distinct item.
 *
 * Default keying:
 *   linked    →  bucket by itemNodeId (across name renames)
 *   free-text →  bucket by `name:${itemName}` (no collision with uuids)
 *
 * Use `opts.keyFn` for special cases (e.g. forcing strict name-based
 * keying for legacy stash views before spec-015's link backfill).
 *
 * Output order: insertion order of buckets (deterministic given input
 * order). Instance arrays inside each bucket are sorted newest-first.
 */
export function aggregateItemLegs(
  legs: ItemLeg[],
  opts: AggregateOpts = {},
): InventoryAggregateRow[] {
  const keyFn = opts.keyFn ?? defaultKeyFn;
  const buckets = new Map<string, Bucket>();

  for (const leg of legs) {
    const key = keyFn(leg);
    const delta = leg.direction === 'in' ? leg.qty : -leg.qty;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        itemName: leg.itemName,
        itemNodeId: leg.itemNodeId,
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
      // Refresh display name from latest leg — handles snapshot drift
      // when the Образец was renamed (FR-031: ledger reads the live
      // title via the join, but the inventory aggregator works from
      // the legs themselves which carry the snapshot at write time;
      // taking the latest snapshot is the closest pure-function
      // approximation. Hot-field hydration in lib/inventory.ts will
      // override with the live title for linked rows).
      bucket.itemName = leg.itemName;
    }

    if (leg.direction === 'in') {
      bucket.instances.push(legToInstance(leg));
    }
  }

  const out: InventoryAggregateRow[] = [];
  for (const b of buckets.values()) {
    if (b.qty === 0) continue;
    b.instances.sort((a, c) => c.createdAt.localeCompare(a.createdAt));
    out.push({
      itemName: b.itemName,
      itemNodeId: b.itemNodeId,
      qty: b.qty,
      latestLoop: b.latestLoop,
      latestDay: b.latestDay,
      instances: b.instances,
      ...(b.qty < 0 ? { warning: true as const } : {}),
    });
  }
  return out;
}

function defaultKeyFn(leg: ItemLeg): string {
  return leg.itemNodeId ?? `name:${leg.itemName}`;
}
