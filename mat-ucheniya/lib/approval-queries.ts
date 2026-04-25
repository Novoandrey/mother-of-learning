/**
 * Spec-014 — Approval read-side queries.
 *
 * Three entry points:
 *   - `getPendingCount(campaignId)` — cheap COUNT for the DM nav badge.
 *   - `getPendingBatches(campaignId, role, userId)` — role-filtered list
 *     of `PendingBatch` for the queue page.
 *   - `getBatchById(batchId, campaignId)` — single batch lookup for the
 *     player "see what happened" toast follow-up.
 *
 * Hydration reuses helpers from `./transactions.ts` (categories,
 * authors, counterparties). Grouping/summarising delegates to
 * `./approval.ts` pure helpers — kept testable separately.
 */

import { createClient } from '@/lib/supabase/server';
import {
  JOIN_SELECT,
  hydrateTxJoinedRows,
  type TxJoinedRow,
  type TransactionWithRelations,
} from './transactions';
import { groupRowsByBatch, type PendingBatch } from './approval';

/**
 * Count of pending rows in a campaign — feeds the DM nav-tab badge.
 *
 * Uses the `idx_tx_pending` partial index from migration 042 →
 * cheap. Returns 0 on empty / error (badge just doesn't show).
 *
 * Note: this counts rows, not batches. A 5-row pending batch shows
 * as "5" — matches the player's intuition ("the DM has 5 things to
 * look at") better than batch count, which would underweight large
 * submissions.
 */
export async function getPendingCount(campaignId: string): Promise<number> {
  if (!campaignId) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  if (error) {
    // Non-fatal: badge just hides on error rather than 500ing the page.
    return 0;
  }
  return count ?? 0;
}

/**
 * Role-filtered list of batches with pending rows.
 *
 * - `dm`/`owner`: every batch in the campaign with at least one pending
 *   row. Player A's batch shows up to player B too via FR-015 (queue
 *   visibility is unified) — but that's only relevant if we choose to
 *   surface it on the player view. Currently the player view returns
 *   only their own authored batches — adjust here if the resolution
 *   for "FR-015 on the queue" lands on shared visibility.
 * - `player`: only batches authored by `userId`.
 *
 * The batches are returned with all their rows (any status), so the
 * UI can show "3/5 approved, 2 pending" partial-action state from
 * AS14. Sorted newest-batch-first per `groupRowsByBatch`.
 */
export async function getPendingBatches(
  campaignId: string,
  role: 'owner' | 'dm' | 'player',
  userId: string,
): Promise<PendingBatch[]> {
  if (!campaignId) return [];

  const supabase = await createClient();

  // Step 1: find every batch_id with at least one pending row in this
  // campaign (role-filtered). Cheap query — uses idx_tx_author_pending
  // for the player path.
  let pendingQ = supabase
    .from('transactions')
    .select('batch_id')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .not('batch_id', 'is', null);

  if (role === 'player') {
    pendingQ = pendingQ.eq('author_user_id', userId);
  }

  const { data: pendingHeads, error: headsErr } = await pendingQ;
  if (headsErr) {
    throw new Error(`getPendingBatches heads failed: ${headsErr.message}`);
  }

  const batchIds = [
    ...new Set(
      (pendingHeads ?? [])
        .map((r) => (r as { batch_id: string | null }).batch_id)
        .filter((v): v is string => !!v),
    ),
  ];
  if (batchIds.length === 0) return [];

  // Step 2: load every row in those batches (any status — caller wants
  // partial-action visibility too). Uses the same JOIN_SELECT as the
  // ledger so hydration is shared.
  const { data: rowsData, error: rowsErr } = await supabase
    .from('transactions')
    .select(JOIN_SELECT)
    .in('batch_id', batchIds)
    .order('created_at', { ascending: true });

  if (rowsErr) {
    throw new Error(`getPendingBatches rows failed: ${rowsErr.message}`);
  }

  const rawRows = (rowsData ?? []) as unknown as TxJoinedRow[];
  const hydrated: TransactionWithRelations[] = await hydrateTxJoinedRows(
    campaignId,
    rawRows,
  );

  // groupRowsByBatch silently drops null batch_id rows (none here, since
  // we filtered upstream) and sorts newest-batch-first by submittedAt.
  return groupRowsByBatch(hydrated);
}

/**
 * Single batch + all rows. Used for "open my batch" deep links and
 * the FR-027 toast follow-up ("see what happened to my submission").
 *
 * Returns `null` when:
 *   - the batch has no rows in this campaign (deleted / wrong campaign),
 *   - or the caller's RLS scope hides it (rare — RLS handles auth).
 */
export async function getBatchById(
  batchId: string,
  campaignId: string,
): Promise<PendingBatch | null> {
  if (!batchId || !campaignId) return null;

  const supabase = await createClient();
  const { data: rowsData, error } = await supabase
    .from('transactions')
    .select(JOIN_SELECT)
    .eq('batch_id', batchId)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`getBatchById failed: ${error.message}`);
  }

  const rawRows = (rowsData ?? []) as unknown as TxJoinedRow[];
  if (rawRows.length === 0) return null;

  const hydrated = await hydrateTxJoinedRows(campaignId, rawRows);
  const batches = groupRowsByBatch(hydrated);
  return batches[0] ?? null;
}

/**
 * Spec-014 FR-027 — recent DM-action summary for a player.
 *
 * Returns `{ approved, rejected }` counts of rows authored by `userId`
 * in this campaign that the DM acted on AFTER the last time the player
 * saw the toast (`accounting_player_state.last_seen_acted_at`). The
 * caller renders a one-shot toast and immediately marks the state as
 * "seen" via {@link markDMActionsSeen}.
 *
 * Returns `null` when there's nothing new — caller hides the toast.
 *
 * Batches that the player never authored never appear here. Pending
 * rows are ignored — only terminal-state rows count.
 */
export async function getRecentDMActionSummary(
  userId: string,
  campaignId: string,
): Promise<{ approved: number; rejected: number; cutoff: string } | null> {
  if (!userId || !campaignId) return null;

  // Use the admin client because `accounting_player_state` is per-user
  // and we want a clean read regardless of RLS — the user-id filter
  // below makes it safe.
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();

  const { data: stateRow } = await admin
    .from('accounting_player_state')
    .select('last_seen_acted_at')
    .eq('user_id', userId)
    .eq('campaign_id', campaignId)
    .maybeSingle();

  const lastSeen =
    (stateRow as { last_seen_acted_at: string } | null)?.last_seen_acted_at ??
    '1970-01-01T00:00:00Z';

  // Two cheap queries — count approved + count rejected since lastSeen
  // for rows authored by this user in this campaign.
  const [approvedRes, rejectedRes] = await Promise.all([
    admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('author_user_id', userId)
      .eq('status', 'approved')
      .gt('approved_at', lastSeen),
    admin
      .from('transactions')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('author_user_id', userId)
      .eq('status', 'rejected')
      .gt('rejected_at', lastSeen),
  ]);

  const approved = approvedRes.count ?? 0;
  const rejected = rejectedRes.count ?? 0;
  if (approved === 0 && rejected === 0) return null;

  return {
    approved,
    rejected,
    cutoff: new Date().toISOString(),
  };
}

/**
 * Mark the player's `last_seen_acted_at` to `cutoff`, so the next
 * call to {@link getRecentDMActionSummary} only surfaces actions newer
 * than this. Idempotent upsert.
 */
export async function markDMActionsSeen(
  userId: string,
  campaignId: string,
  cutoff: string,
): Promise<void> {
  if (!userId || !campaignId || !cutoff) return;
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const admin = createAdminClient();
  await admin.from('accounting_player_state').upsert(
    {
      user_id: userId,
      campaign_id: campaignId,
      last_seen_acted_at: cutoff,
    },
    { onConflict: 'user_id,campaign_id' },
  );
}
