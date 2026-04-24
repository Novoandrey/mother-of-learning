/**
 * Stash (Общак) — types + server queries for spec-011.
 *
 * The stash is a campaign-level node of `node_types.slug = 'stash'`
 * that behaves like a PC for the purposes of the ledger: transactions
 * reference it via `actor_pc_id`, wallets aggregate the same way, and
 * transfer pairs work end-to-end unchanged. This file is the canonical
 * read-layer — any caller that needs "the stash node id for this
 * campaign" or "what's currently in the stash" goes through here.
 *
 * Design notes:
 *  - `getStashNode` is wrapped in React `cache()` so one server
 *    request → one DB hit, no matter how many components ask for the
 *    stash (catalog routing, page header, transaction-form wrappers).
 *  - `getStashContents` parallelises the three sub-queries with
 *    `Promise.all`. Each piece is independent.
 *  - Item legs are shaped into `StashItemLeg[]` and passed through
 *    the pure `aggregateStashLegs` helper — keeps the read layer thin
 *    and the aggregation unit-testable.
 *
 * Forward-compat with spec-015: `getStashContents` currently keys item
 * aggregation by free-text name. Once spec-015 adds `item_node_id`,
 * the only change here is to pass a `keyFn` that incorporates the node
 * id. Schema and query layout stay identical.
 */

import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { unwrapOne } from '@/lib/supabase/joins';
import {
  getWallet,
  getRecentByPc,
  type CoinSet,
  type TransactionKind,
  type TransactionStatus,
  type TransactionWithRelations,
  type Wallet,
} from './transactions';
import {
  aggregateStashLegs,
  type StashItemLeg,
} from './stash-aggregation';

// ============================================================================
// Types
// ============================================================================

/** Minimal identity of the stash node for a campaign. */
export type StashMeta = {
  nodeId: string;
  title: string;
  icon: string;
};

/**
 * One instance of an item arriving in the stash — i.e. one incoming
 * transfer leg rendered as an expand-row entry.
 */
export type StashItemInstance = {
  transactionId: string;
  transferGroupId: string | null;
  qty: number;
  /** `null` if the PC that dropped it was since deleted. */
  droppedBy: { pcId: string; pcTitle: string } | null;
  loopNumber: number;
  dayInLoop: number;
  /** `null` if the session was deleted (SET NULL FK). */
  session: { id: string; title: string } | null;
  comment: string;
  /** `null` if the author's account is gone or never set. */
  author: { userId: string; displayName: string | null } | null;
  createdAt: string;
};

/** One aggregated row in the stash inventory grid. */
export type StashItem = {
  itemName: string;
  /** Net qty (incoming − outgoing). Never 0 (filtered out); may be < 0. */
  qty: number;
  latestLoop: number;
  latestDay: number;
  /** Only *incoming* legs, newest-first. */
  instances: StashItemInstance[];
  /** `true` when qty < 0 (data-integrity flag — UI renders in red). */
  warning?: true;
};

/** The stash page's hero payload. */
export type StashContents = {
  wallet: Wallet;
  items: StashItem[];
  /** Last 10 stash-actor transactions in the loop, newest first. */
  recentTransactions: TransactionWithRelations[];
};

// Re-export so call-sites can `import { StashItemLeg } from '@/lib/stash'`
// without poking into the aggregation implementation.
export type { StashItemLeg } from './stash-aggregation';

// ============================================================================
// Queries
// ============================================================================

/**
 * Resolve the stash node for a campaign. Returns `null` only if the
 * campaign is missing its stash (shouldn't happen post-migration 035,
 * but defensive — the UI renders a "seed stash" fallback).
 *
 * Wrapped in React `cache()`: the same `campaignId` within a single
 * server request hits the DB once.
 */
export const getStashNode = cache(
  async (campaignId: string): Promise<StashMeta | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('nodes')
      .select(
        `
        id,
        title,
        type:node_types!type_id ( slug, icon )
      `,
      )
      .eq('campaign_id', campaignId)
      .eq('node_types.slug', 'stash')
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`getStashNode failed: ${error.message}`);
    }
    if (!data) return null;

    const row = data as unknown as {
      id: string;
      title: string;
      type: { slug: string; icon: string | null } | { slug: string; icon: string | null }[] | null;
    };
    const type = unwrapOne(row.type);
    if (!type || type.slug !== 'stash') {
      // Defensive: the `.eq('node_types.slug', 'stash')` filter runs as
      // a nested condition on the join. If the join returns an unrelated
      // row (shouldn't happen but PostgREST can be lenient), treat it as
      // "no stash".
      return null;
    }

    return {
      nodeId: row.id,
      title: row.title,
      icon: type.icon ?? '💰',
    };
  },
);

// ----- getStashContents internals --------------------------------------------

/**
 * Raw row shape from the stash-leg query (only the stash-actor leg).
 * The counterparty PC (`dropped_by`) is resolved via the sibling leg
 * of the same transfer_group_id in a second pass.
 */
type StashLegRow = {
  id: string;
  transfer_group_id: string | null;
  item_name: string | null;
  item_qty: number;
  loop_number: number;
  day_in_loop: number;
  session_id: string | null;
  comment: string;
  author_user_id: string | null;
  created_at: string;
  session:
    | { id: string; title: string }
    | { id: string; title: string }[]
    | null;
};

/**
 * One sibling (PC-actor) leg of a stash-touching transfer. Needed
 * solely for the expand-row "dropped by / taken by" column.
 */
type SiblingRow = {
  transfer_group_id: string | null;
  actor_pc_id: string | null;
  actor_pc:
    | { id: string; title: string }
    | { id: string; title: string }[]
    | null;
};

/**
 * Collect the stash-actor item legs in this loop, one `StashItemLeg`
 * per row. Sign convention (mig 036 + Phase 5 `createItemTransfer`):
 *   - positive `item_qty` → stash received the item (`direction='in'`)
 *   - negative `item_qty` → stash released the item (`direction='out'`)
 *
 * The sibling (PC) leg is loaded separately and joined in memory to
 * populate `droppedBy…` fields on the expand row. Siblings join by
 * `transfer_group_id`; the PC leg is the one whose `actor_pc_id` is
 * NOT the stash.
 *
 * We deliberately query only the stash's leg here (the aggregator
 * sums signed qty — the PC-side mirror would double-count). This
 * deviates slightly from the task's "both legs" wording but matches
 * the signed-qty semantics that were not on the plan's radar.
 */
async function loadStashItemLegs(
  campaignId: string,
  stashId: string,
  loopNumber: number,
): Promise<StashItemLeg[]> {
  const supabase = await createClient();

  // Step 1 — stash-actor item legs in this loop.
  const { data: legRows, error: legsErr } = await supabase
    .from('transactions')
    .select(
      `
      id, transfer_group_id, item_name, item_qty,
      loop_number, day_in_loop, session_id, comment,
      author_user_id, created_at,
      session:nodes!session_id ( id, title )
    `,
    )
    .eq('campaign_id', campaignId)
    .eq('actor_pc_id', stashId)
    .eq('loop_number', loopNumber)
    .eq('kind', 'item')
    .eq('status', 'approved')
    .not('transfer_group_id', 'is', null);

  if (legsErr) {
    throw new Error(`loadStashItemLegs (legs) failed: ${legsErr.message}`);
  }

  const rows = (legRows ?? []) as unknown as StashLegRow[];
  if (rows.length === 0) return [];

  // Step 2 — sibling legs (PC side) to fill droppedBy.
  const groupIds = [
    ...new Set(
      rows
        .map((r) => r.transfer_group_id)
        .filter((v): v is string => !!v),
    ),
  ];

  const pcByGroupId = new Map<string, { id: string; title: string }>();
  if (groupIds.length > 0) {
    const { data: siblingRows, error: siblingErr } = await supabase
      .from('transactions')
      .select(
        `
        transfer_group_id, actor_pc_id,
        actor_pc:nodes!actor_pc_id ( id, title )
      `,
      )
      .in('transfer_group_id', groupIds)
      .eq('kind', 'item')
      .eq('status', 'approved')
      .neq('actor_pc_id', stashId);

    if (siblingErr) {
      throw new Error(`loadStashItemLegs (siblings) failed: ${siblingErr.message}`);
    }

    for (const s of (siblingRows ?? []) as unknown as SiblingRow[]) {
      const pc = unwrapOne(s.actor_pc);
      if (s.transfer_group_id && pc) {
        pcByGroupId.set(s.transfer_group_id, pc);
      }
    }
  }

  // Step 3 — author display names.
  const authorIds = [
    ...new Set(
      rows
        .map((r) => r.author_user_id)
        .filter((v): v is string => !!v),
    ),
  ];
  const authors = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: authorRows, error: authorErr } = await supabase
      .from('user_profiles')
      .select('user_id, display_name')
      .in('user_id', authorIds);
    if (authorErr) {
      throw new Error(`loadStashItemLegs (authors) failed: ${authorErr.message}`);
    }
    for (const a of (authorRows ?? []) as {
      user_id: string;
      display_name: string | null;
    }[]) {
      authors.set(a.user_id, a.display_name);
    }
  }

  // Step 4 — shape into `StashItemLeg`. Direction from sign; qty as
  // absolute magnitude (the aggregator encodes sign via `direction`).
  return rows.map<StashItemLeg>((r) => {
    const session = unwrapOne(r.session);
    const droppedBy = r.transfer_group_id
      ? pcByGroupId.get(r.transfer_group_id) ?? null
      : null;
    const signedQty = r.item_qty;
    return {
      transactionId: r.id,
      transferGroupId: r.transfer_group_id,
      itemName: r.item_name ?? '',
      qty: Math.abs(signedQty),
      direction: signedQty > 0 ? 'in' : 'out',
      loopNumber: r.loop_number,
      dayInLoop: r.day_in_loop,
      createdAt: r.created_at,
      sessionId: session?.id ?? r.session_id,
      sessionTitle: session?.title ?? null,
      droppedByPcId: droppedBy?.id ?? null,
      droppedByPcTitle: droppedBy?.title ?? null,
      comment: r.comment,
      authorUserId: r.author_user_id,
      authorDisplayName: r.author_user_id
        ? authors.get(r.author_user_id) ?? null
        : null,
    };
  });
}

/**
 * The stash page's data fetch. Returns the wallet aggregate, the
 * inventory grid rows, and the most recent 10 stash transactions —
 * all scoped to `loopNumber` (stash is wipeable-per-loop, FR-015).
 */
export async function getStashContents(
  campaignId: string,
  loopNumber: number,
): Promise<StashContents> {
  const stash = await getStashNode(campaignId);
  if (!stash) {
    // Defensive path — the stash should exist post-migration 035.
    return {
      wallet: emptyWallet(),
      items: [],
      recentTransactions: [],
    };
  }

  const [wallet, legs, recentTransactions] = await Promise.all([
    getWallet(stash.nodeId, loopNumber),
    loadStashItemLegs(campaignId, stash.nodeId, loopNumber),
    getRecentByPc(stash.nodeId, loopNumber, 10),
  ]);

  const items = aggregateStashLegs(legs);

  return { wallet, items, recentTransactions };
}

// ============================================================================
// Internals
// ============================================================================

function emptyCoinSet(): CoinSet {
  return { cp: 0, sp: 0, gp: 0, pp: 0 };
}

function emptyWallet(): Wallet {
  return { coins: emptyCoinSet(), aggregate_gp: 0 };
}

// Re-export types used by the stash page / components. Prevents a proliferation
// of `@/lib/transactions` imports on stash-only UI code.
export type { TransactionKind, TransactionStatus };
