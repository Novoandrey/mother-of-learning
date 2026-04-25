/**
 * Spec-014 — Approval flow pure helpers.
 *
 * No Supabase, no I/O — every function takes hydrated rows in,
 * returns shaped output. Tested in `__tests__/approval.test.ts`.
 *
 * Three concerns live here:
 *   1. Grouping — turn a flat list of `TransactionWithRelations`
 *      into per-batch aggregates (`PendingBatch[]`). Excludes rows
 *      with `batch_id = null` (DM-auto-approved or autogen — neither
 *      participates in the queue).
 *   2. Summarising — for collapsed queue display: total coin amount
 *      across denoms, item count, transfer recipients, kinds present.
 *      Rejected rows are excluded from money totals (they didn't
 *      happen) but counted in `rejectedCount`.
 *   3. Validating multi-row form input before submit (FR-008).
 *
 * `isStaleError` is a tiny narrowing helper used by the client to
 * distinguish FR-028 staleness from generic errors.
 */

import type {
  CoinSet,
  TransactionKind,
  TransactionStatus,
  TransactionWithRelations,
} from './transactions';

// ─────────────────────────── Result / error types ───────────────────────────

/** Generic action result returned from `app/actions/approval.ts`. */
export type ApprovalResult =
  | { ok: true; [k: string]: unknown }
  | { ok: false; error: string; stale?: true };

/**
 * Narrow check for FR-028 staleness — used by client to decide
 * "show toast + refresh" vs "show generic error".
 */
export function isStaleError(result: ApprovalResult): boolean {
  return result.ok === false && result.stale === true;
}

// ─────────────────────────── Batch aggregate ───────────────────────────

/**
 * One pending submission (player-authored multi-row batch). Always
 * has `pendingCount + approvedCount + rejectedCount === rows.length`.
 *
 * `approvedCount > 0` or `rejectedCount > 0` only happens when the
 * DM partially acted on the batch (AS14): the batch keeps showing
 * up in the queue until every row reaches a terminal state, but
 * already-acted rows are no longer actionable.
 */
export type PendingBatch = {
  batchId: string;
  authorUserId: string | null;
  authorDisplayName: string | null;
  /** Earliest row's `created_at` — sort key for the queue. */
  submittedAt: string;
  campaignId: string;
  rows: TransactionWithRelations[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
};

/**
 * Group hydrated rows into `PendingBatch[]`.
 *
 * Rules:
 *  - Rows with `batch_id = null` are silently dropped (they don't
 *    belong in queue display — DM-auto-approved or autogen).
 *  - Within a batch, rows keep input order (caller decides; we
 *    don't sort inside a batch).
 *  - Batches are sorted newest-batch-first by `submittedAt`
 *    descending — most recent submission at the top of the queue.
 *  - The batch's `submittedAt` is the EARLIEST row's `created_at`,
 *    so a batch that took multiple inserts (sequential server
 *    action calls) still sorts as one event.
 *  - `authorDisplayName` is taken from the first row's
 *    `author_display_name`. All rows in a batch share an author by
 *    construction (server action enforces).
 *
 * Returns `[]` for empty input.
 */
export function groupRowsByBatch(
  rows: TransactionWithRelations[],
): PendingBatch[] {
  const grouped = new Map<string, TransactionWithRelations[]>();

  for (const row of rows) {
    if (row.batch_id === null) continue;
    const list = grouped.get(row.batch_id);
    if (list) {
      list.push(row);
    } else {
      grouped.set(row.batch_id, [row]);
    }
  }

  const batches: PendingBatch[] = [];
  for (const [batchId, batchRows] of grouped) {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let earliest = batchRows[0].created_at;
    for (const r of batchRows) {
      if (r.status === 'pending') pending += 1;
      else if (r.status === 'approved') approved += 1;
      else rejected += 1;
      if (r.created_at < earliest) earliest = r.created_at;
    }
    batches.push({
      batchId,
      authorUserId: batchRows[0].author_user_id,
      authorDisplayName: batchRows[0].author_display_name,
      submittedAt: earliest,
      campaignId: batchRows[0].campaign_id,
      rows: batchRows,
      pendingCount: pending,
      approvedCount: approved,
      rejectedCount: rejected,
    });
  }

  // Newest-batch-first.
  batches.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return batches;
}

// ─────────────────────────── Batch summary ───────────────────────────

/**
 * Aggregate one batch into display-ready strings for the collapsed
 * queue card. Money totals across denominations are computed in
 * copper to avoid float drift, then converted back to a `CoinSet`
 * (signed: net direction across all rows).
 *
 * Rejected rows are excluded from money/item totals — a rejected
 * row "didn't happen". They're counted in the parent batch's
 * `rejectedCount`. Pending and approved rows both count toward the
 * money total.
 */
export type BatchSummary = {
  /** Net coin movement across all non-rejected money/transfer rows. */
  netCoins: CoinSet;
  /** Net cp value of `netCoins` as gp (cp*0.01 + sp*0.1 + gp + pp*10). */
  netGp: number;
  /** Number of distinct items across non-rejected item rows. */
  itemCount: number;
  /** Distinct kinds present, ordered: ['money','item','transfer']. */
  kinds: TransactionKind[];
  /** Distinct counterparty titles from transfer rows (sender side). */
  transferRecipients: string[];
};

const CP_PER = { cp: 1, sp: 10, gp: 100, pp: 1000 } as const;

export function summarizeBatch(batch: PendingBatch): BatchSummary {
  let netCp = 0;
  let netSp = 0;
  let netGp = 0;
  let netPp = 0;
  let itemCount = 0;
  const kindSet = new Set<TransactionKind>();
  const recipients = new Set<string>();
  // For transfer pairs we want each pair counted once. Use
  // `transfer_group_id`: only the first leg encountered contributes
  // to coin sum; the sibling leg is the mirror.
  const transferGroupsSeen = new Set<string>();

  for (const row of batch.rows) {
    if (row.status === 'rejected') continue;
    kindSet.add(row.kind);

    if (row.kind === 'item') {
      itemCount += row.item_qty;
      continue;
    }

    if (row.kind === 'transfer') {
      if (row.counterparty?.title) {
        recipients.add(row.counterparty.title);
      }
      // Only count one leg of a transfer in money totals — the
      // sender's leg (signed negative for outflow). The recipient
      // leg has equal-and-opposite, summing to 0 if we double-count.
      if (row.transfer_group_id) {
        if (transferGroupsSeen.has(row.transfer_group_id)) continue;
        transferGroupsSeen.add(row.transfer_group_id);
      }
    }

    netCp += row.coins.cp;
    netSp += row.coins.sp;
    netGp += row.coins.gp;
    netPp += row.coins.pp;
  }

  const totalCp =
    netCp * CP_PER.cp +
    netSp * CP_PER.sp +
    netGp * CP_PER.gp +
    netPp * CP_PER.pp;

  // Order the kinds canonically.
  const kinds: TransactionKind[] = [];
  for (const k of ['money', 'item', 'transfer'] as const) {
    if (kindSet.has(k)) kinds.push(k);
  }

  return {
    netCoins: { cp: netCp, sp: netSp, gp: netGp, pp: netPp },
    netGp: totalCp / 100,
    itemCount,
    kinds,
    transferRecipients: [...recipients].sort(),
  };
}

// ─────────────────────────── Validation ───────────────────────────

/**
 * Multi-row form input shape — what the client sends to
 * `submitBatch`. Mirrors the per-kind action signatures, with one
 * extra `clientId` for matching errors back to UI rows.
 */
export type BatchRowInput = {
  /** Stable client-side id; not persisted. Used for error mapping. */
  clientId: string;
  kind: TransactionKind;
  actorPcId: string | null;
  /** Money rows: at least one denom non-zero. Item rows: all zero. */
  coins: CoinSet;
  /** Item rows only. */
  itemName: string | null;
  /** Item rows only; ≥ 1. Defaulted to 1 elsewhere. */
  itemQty: number;
  categorySlug: string;
  comment: string;
  loopNumber: number;
  dayInLoop: number;
  sessionId: string | null;
  /** Transfer only — recipient PC node id. */
  recipientPcId?: string | null;
};

export type ValidationError = {
  /** clientId of the offending row, or null for cross-row errors. */
  clientId: string | null;
  message: string;
};

/**
 * Validate a batch before sending to the server. Catches the cheap
 * client-side errors so the user gets feedback without a round trip.
 * Server actions re-validate authoritatively — this is convenience,
 * not a security boundary.
 */
export function validateBatchRowInputs(
  rows: BatchRowInput[],
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (rows.length === 0) {
    errors.push({ clientId: null, message: 'Пусто — добавьте хотя бы один ряд.' });
    return errors;
  }

  for (const row of rows) {
    const cidLabel = row.clientId;

    if (!row.categorySlug) {
      errors.push({ clientId: cidLabel, message: 'Не выбрана категория.' });
    }

    if (!Number.isInteger(row.loopNumber) || row.loopNumber < 1) {
      errors.push({ clientId: cidLabel, message: 'Некорректная петля.' });
    }
    if (!Number.isInteger(row.dayInLoop) || row.dayInLoop < 1 || row.dayInLoop > 365) {
      errors.push({ clientId: cidLabel, message: 'Некорректный день (1–365).' });
    }

    if (row.kind === 'money') {
      if (row.actorPcId === null) {
        errors.push({ clientId: cidLabel, message: 'Нет персонажа для денежной операции.' });
      }
      const allZero =
        row.coins.cp === 0 && row.coins.sp === 0 && row.coins.gp === 0 && row.coins.pp === 0;
      if (allZero) {
        errors.push({ clientId: cidLabel, message: 'Нужна ненулевая сумма.' });
      }
      if (row.itemName !== null) {
        errors.push({ clientId: cidLabel, message: 'У денежной операции не должно быть item_name.' });
      }
    } else if (row.kind === 'item') {
      if (row.actorPcId === null) {
        errors.push({ clientId: cidLabel, message: 'Нет персонажа для предмета.' });
      }
      if (!row.itemName || row.itemName.trim().length === 0) {
        errors.push({ clientId: cidLabel, message: 'Не указано название предмета.' });
      }
      if (!Number.isInteger(row.itemQty) || row.itemQty < 1) {
        errors.push({ clientId: cidLabel, message: 'Количество предметов ≥ 1.' });
      }
      const anyCoin =
        row.coins.cp !== 0 || row.coins.sp !== 0 || row.coins.gp !== 0 || row.coins.pp !== 0;
      if (anyCoin) {
        errors.push({ clientId: cidLabel, message: 'У предмета не должно быть монет.' });
      }
    } else if (row.kind === 'transfer') {
      if (row.actorPcId === null) {
        errors.push({ clientId: cidLabel, message: 'Нет отправителя перевода.' });
      }
      if (!row.recipientPcId) {
        errors.push({ clientId: cidLabel, message: 'Нет получателя перевода.' });
      }
      if (row.actorPcId && row.recipientPcId && row.actorPcId === row.recipientPcId) {
        errors.push({ clientId: cidLabel, message: 'Отправитель и получатель совпадают.' });
      }
      const allZero =
        row.coins.cp === 0 && row.coins.sp === 0 && row.coins.gp === 0 && row.coins.pp === 0;
      if (allZero) {
        errors.push({ clientId: cidLabel, message: 'Нужна ненулевая сумма перевода.' });
      }
    }
  }

  return errors;
}

// ─────────────────────────── Helpers for queue UI ───────────────────────────

/**
 * Returns true iff every row in the batch has reached a terminal
 * state (approved or rejected). Per FR-025, such batches no longer
 * appear in the active queue.
 */
export function isBatchFullyResolved(batch: PendingBatch): boolean {
  return batch.pendingCount === 0;
}

/**
 * Filter out batches that are fully resolved. Used by queue display:
 * server-side query already filters by status='pending', but if a
 * batch had partial action between page load and render, this trims
 * stragglers.
 */
export function activeBatchesOnly(batches: PendingBatch[]): PendingBatch[] {
  return batches.filter((b) => !isBatchFullyResolved(b));
}

/** Stable status badge order — used by queue card chip rendering. */
export const STATUS_ORDER: TransactionStatus[] = ['pending', 'approved', 'rejected'];
