/**
 * Transactions ledger — type definitions (spec-010).
 *
 * Types only; query implementations land in T014 (same file).
 *
 * Shape mirrors the SQL schema (migration 034) with one convenience:
 * the four `amount_{cp,sp,gp,pp}` columns are grouped into a single
 * `coins: CoinSet` object at the type layer. Query helpers in T014
 * will flatten/unflatten between the two shapes.
 */

/** Signed per-denomination coin balance. Keys match the SQL columns. */
export type CoinSet = {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
};

/** Discriminator: `'money'` / `'item'` / `'transfer'`. */
export type TransactionKind = 'money' | 'item' | 'transfer';

/** Approval state. Spec-010 writes `'approved'`; spec-014 will use the rest. */
export type TransactionStatus = 'pending' | 'approved' | 'rejected';

/**
 * Bare transaction row — the shape we return from single-row reads.
 *
 * Invariants (enforced by DB CHECKs in migration 034):
 *  - `kind = 'item'`      ⇒ `coins` is all zeros, `item_name` is non-empty.
 *  - `kind = 'money'`     ⇒ `item_name` is `null`, at least one coin ≠ 0.
 *  - `kind = 'transfer'`  ⇒ `transfer_group_id` is non-null.
 */
export type Transaction = {
  id: string;
  campaign_id: string;
  actor_pc_id: string | null;
  kind: TransactionKind;
  /** Signed per-denom amount. All zeros for `kind='item'`. */
  coins: CoinSet;
  item_name: string | null;
  /** Integer ≥ 1 (CHECK in migration 035). Semantically unused for
   * `kind='money'` / `'transfer'` — defaulted to 1 at write time. */
  item_qty: number;
  category_slug: string;
  comment: string;
  loop_number: number;
  day_in_loop: number;
  session_id: string | null;
  /** Shared between the two legs of a transfer. */
  transfer_group_id: string | null;
  status: TransactionStatus;
  author_user_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Transaction joined with display strings resolved server-side.
 * Returned from ledger feed / wallet recent-activity queries.
 *
 * Nulls come from `SET NULL` FKs — ledger UI renders fallbacks
 * like "[deleted character]" / "[deleted session]".
 */
export type TransactionWithRelations = Transaction & {
  actor_pc_title: string | null;
  session_title: string | null;
  session_number: number | null;
  /** Resolved from `categories` via `(campaign_id, scope='transaction', slug)`. */
  category_label: string;
  author_display_name: string | null;
  /**
   * For transfer legs, the actor/node of the sibling leg — the other
   * party in the transfer. `null` for non-transfer rows, for legs whose
   * sibling is missing (data corruption — shouldn't happen), or for
   * transfers whose sibling leg has a deleted `actor_pc` node.
   *
   * Populated by `hydrateCounterparties` in the read helpers below.
   * Schema unchanged — counterparty is derived from `transfer_group_id`.
   */
  counterparty: { nodeId: string; title: string | null } | null;
};

/** Per-(pc, loop) wallet aggregate. */
export type Wallet = {
  /** Signed per-denom sum across approved transactions. */
  coins: CoinSet;
  /** `cp*0.01 + sp*0.1 + gp + pp*10`. */
  aggregate_gp: number;
};

/** Category row as returned by `listCategories`. */
export type Category = {
  slug: string;
  label: string;
  sort_order: number;
  is_deleted: boolean;
};

/**
 * Transfer server-action input shape — shared between `createTransfer`
 * and `updateTransfer` (the latter as a `Partial<>`). Declared here so
 * the form component can `import type` without pulling in the server
 * action module.
 */
export type TransferInput = {
  campaignId: string;
  senderPcId: string;
  recipientPcId: string;
  /** Positive gp value; sign is applied inside the action. */
  amountGp: number;
  /** Explicit per-denom outflow override (signed or unsigned; action flips). */
  perDenomOverride?: CoinSet;
  categorySlug: string;
  comment: string;
  loopNumber: number;
  dayInLoop: number;
  sessionId?: string | null;
};

// ============================================================================
// Query helpers (server-side)
// ============================================================================
//
// This file is isomorphic for *types* but the query functions pull in the
// server Supabase client — pattern from `lib/loops.ts`. Client components
// must import only `type` from this file; the tree-shaking + TS erasure
// combo keeps the client bundle clean.

import { createClient } from '@/lib/supabase/server';
import { unwrapOne } from '@/lib/supabase/joins';
import { aggregateGp } from './transaction-resolver';
import { countDistinctEvents, dedupTransferPairs } from './transaction-dedup';

// ---------- Filters & page type ----------

export type LedgerFilters = {
  pc?: string[];
  loop?: number[];
  dayFrom?: number;
  dayTo?: number;
  category?: string[];
  kind?: TransactionKind[];
};

export type LedgerPage = {
  rows: TransactionWithRelations[];
  totals: {
    count: number;
    distinctPcs: number;
    netAggregateGp: number;
  };
  /** Opaque base64 cursor encoding `{created_at, id}`. `null` → last page. */
  nextCursor: string | null;
};

// ---------- Raw DB row shape + mapper ----------

/**
 * The DB has 4 separate `amount_{cp,sp,gp,pp}` columns. The TS layer exposes
 * them as a single `coins: CoinSet` object. This mapper bridges the two
 * shapes — shared by every read helper in this file.
 */
type TxRawRow = {
  id: string;
  campaign_id: string;
  actor_pc_id: string | null;
  kind: TransactionKind;
  amount_cp: number;
  amount_sp: number;
  amount_gp: number;
  amount_pp: number;
  item_name: string | null;
  item_qty: number;
  category_slug: string;
  comment: string;
  loop_number: number;
  day_in_loop: number;
  session_id: string | null;
  transfer_group_id: string | null;
  status: TransactionStatus;
  author_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function rawToTransaction(raw: TxRawRow): Transaction {
  return {
    id: raw.id,
    campaign_id: raw.campaign_id,
    actor_pc_id: raw.actor_pc_id,
    kind: raw.kind,
    coins: {
      cp: raw.amount_cp,
      sp: raw.amount_sp,
      gp: raw.amount_gp,
      pp: raw.amount_pp,
    },
    item_name: raw.item_name,
    item_qty: raw.item_qty,
    category_slug: raw.category_slug,
    comment: raw.comment,
    loop_number: raw.loop_number,
    day_in_loop: raw.day_in_loop,
    session_id: raw.session_id,
    transfer_group_id: raw.transfer_group_id,
    status: raw.status,
    author_user_id: raw.author_user_id,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

/**
 * Joined read shape — pulls in actor/session/category/author display strings.
 * `actor_pc` and `session` are `nodes` rows (the project's polymorphic node
 * table). Author display comes from a separate `user_profiles` fetch — the
 * FK on `transactions.author_user_id` points at `auth.users(id)`, not at
 * `user_profiles`, so PostgREST can't embed it directly.
 * `category` is resolved via a separate in-memory map since there's no FK
 * on `category_slug` (by design — see plan).
 */
type TxJoinedRow = TxRawRow & {
  actor_pc: { title: string } | { title: string }[] | null;
  session: { title: string; fields: Record<string, unknown> | null } | { title: string; fields: Record<string, unknown> | null }[] | null;
};

const JOIN_SELECT = `
  id, campaign_id, actor_pc_id, kind,
  amount_cp, amount_sp, amount_gp, amount_pp,
  item_name, item_qty, category_slug, comment,
  loop_number, day_in_loop, session_id,
  transfer_group_id, status, author_user_id,
  created_at, updated_at,
  actor_pc:nodes!actor_pc_id(title),
  session:nodes!session_id(title, fields)
`;

async function hydrateCategoryLabels(
  campaignId: string,
  rows: Transaction[],
): Promise<Map<string, string>> {
  const slugs = [...new Set(rows.map((r) => r.category_slug))];
  if (slugs.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('slug, label')
    .eq('campaign_id', campaignId)
    .eq('scope', 'transaction')
    .in('slug', slugs);

  if (error) {
    throw new Error(`hydrateCategoryLabels failed: ${error.message}`);
  }

  const out = new Map<string, string>();
  for (const row of (data ?? []) as { slug: string; label: string }[]) {
    out.set(row.slug, row.label);
  }
  return out;
}

/**
 * Batch-fetch author display names. Separate query because the FK on
 * `transactions.author_user_id` points at `auth.users(id)`, not at
 * `user_profiles` — PostgREST can't embed a two-hop relation.
 */
async function hydrateAuthors(
  rows: Transaction[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(rows.map((r) => r.author_user_id).filter((v): v is string => !!v))];
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('user_id, display_name')
    .in('user_id', ids);

  if (error) {
    throw new Error(`hydrateAuthors failed: ${error.message}`);
  }

  const out = new Map<string, string | null>();
  for (const row of (data ?? []) as { user_id: string; display_name: string | null }[]) {
    out.set(row.user_id, row.display_name);
  }
  return out;
}

function joinedToRelations(
  raw: TxJoinedRow,
  categoryLabels: Map<string, string>,
  authors: Map<string, string | null>,
  counterparties: Map<string, { nodeId: string; title: string | null } | null>,
): TransactionWithRelations {
  const base = rawToTransaction(raw);
  const pc = unwrapOne(raw.actor_pc);
  const session = unwrapOne(raw.session);

  let session_number: number | null = null;
  if (session?.fields) {
    const raw_num = (session.fields as Record<string, unknown>)['session_number'];
    if (typeof raw_num === 'number') session_number = raw_num;
    else if (typeof raw_num === 'string' && raw_num !== '') session_number = Number(raw_num);
  }

  return {
    ...base,
    actor_pc_title: pc?.title ?? null,
    session_title: session?.title ?? null,
    session_number,
    category_label: categoryLabels.get(base.category_slug) ?? base.category_slug,
    author_display_name: base.author_user_id
      ? authors.get(base.author_user_id) ?? null
      : null,
    counterparty: counterparties.get(base.id) ?? null,
  };
}

/**
 * Resolve sibling-leg actors for transfer rows. One extra query on the
 * already-fetched `transfer_group_id`s (no schema change).
 *
 * For each input row with a `transfer_group_id`, finds the other leg in
 * the same group and returns its `actor_pc_id` + joined title. Rows
 * without a group id or whose sibling has no `actor_pc_id` map to `null`.
 *
 * Cheap: pulls only `id, actor_pc_id, transfer_group_id` + one-field
 * `nodes` join; scales with number of distinct groups on the page.
 */
async function hydrateCounterparties(
  rows: Transaction[],
): Promise<Map<string, { nodeId: string; title: string | null } | null>> {
  const out = new Map<string, { nodeId: string; title: string | null } | null>();
  const groupIds = [
    ...new Set(
      rows.map((r) => r.transfer_group_id).filter((v): v is string => !!v),
    ),
  ];
  if (groupIds.length === 0) return out;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('id, actor_pc_id, transfer_group_id, actor_pc:nodes!actor_pc_id(title)')
    .in('transfer_group_id', groupIds);

  if (error) {
    throw new Error(`hydrateCounterparties failed: ${error.message}`);
  }

  type Leg = {
    id: string;
    actor_pc_id: string | null;
    transfer_group_id: string;
    actor_pc: { title: string } | { title: string }[] | null;
  };

  const byGroup = new Map<string, Leg[]>();
  for (const leg of (data ?? []) as unknown as Leg[]) {
    const arr = byGroup.get(leg.transfer_group_id) ?? [];
    arr.push(leg);
    byGroup.set(leg.transfer_group_id, arr);
  }

  for (const row of rows) {
    if (!row.transfer_group_id) continue;
    const legs = byGroup.get(row.transfer_group_id) ?? [];
    const sibling = legs.find((l) => l.id !== row.id);
    if (!sibling || !sibling.actor_pc_id) {
      out.set(row.id, null);
      continue;
    }
    const title = unwrapOne(sibling.actor_pc)?.title ?? null;
    out.set(row.id, { nodeId: sibling.actor_pc_id, title });
  }

  return out;
}

// ---------- Public queries ----------

/**
 * Per-(pc, loop) wallet aggregate. Sums every approved row for the
 * character in the given loop. Returns `{ coins, aggregate_gp }`.
 *
 * `loopNumber: null` → lifetime aggregate across every loop. Used as
 * the fallback surface on the wallet block when no loop has
 * `status='current'` (FR-015).
 *
 * The aggregate runs in the DB via repeat calls per denomination —
 * Supabase doesn't expose SUM via the PostgREST filter DSL, so we
 * pull the relevant rows and sum in memory. Fine at current scale
 * (one PC's rows for one loop). See plan "Performance" for the
 * materialized-view follow-up.
 */
export async function getWallet(
  pcId: string,
  loopNumber: number | null,
): Promise<Wallet> {
  const supabase = await createClient();
  let query = supabase
    .from('transactions')
    .select('amount_cp, amount_sp, amount_gp, amount_pp')
    .eq('actor_pc_id', pcId)
    .eq('status', 'approved');
  if (loopNumber !== null) {
    query = query.eq('loop_number', loopNumber);
  }
  const { data, error } = await query;

  if (error) {
    throw new Error(`getWallet failed: ${error.message}`);
  }

  const coins = { cp: 0, sp: 0, gp: 0, pp: 0 };
  for (const row of (data ?? []) as {
    amount_cp: number;
    amount_sp: number;
    amount_gp: number;
    amount_pp: number;
  }[]) {
    coins.cp += row.amount_cp;
    coins.sp += row.amount_sp;
    coins.gp += row.amount_gp;
    coins.pp += row.amount_pp;
  }

  return { coins, aggregate_gp: aggregateGp(coins) };
}

/**
 * Recent transactions for a PC in a loop, newest first. Feeds the
 * wallet block on the PC catalog page (T021). Only `'approved'`
 * rows; `pending`/`rejected` surface via spec-014 workflows.
 *
 * `loopNumber: null` → recent across the PC's entire history.
 */
export async function getRecentByPc(
  pcId: string,
  loopNumber: number | null,
  limit: number,
): Promise<TransactionWithRelations[]> {
  const supabase = await createClient();
  let q = supabase
    .from('transactions')
    .select(JOIN_SELECT)
    .eq('actor_pc_id', pcId)
    .eq('status', 'approved');
  if (loopNumber !== null) {
    q = q.eq('loop_number', loopNumber);
  }
  const { data, error } = await q
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`getRecentByPc failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as TxJoinedRow[];
  if (rows.length === 0) return [];

  const plain = rows.map(rawToTransaction);
  const [labels, authors, counterparties] = await Promise.all([
    hydrateCategoryLabels(rows[0].campaign_id, plain),
    hydrateAuthors(plain),
    hydrateCounterparties(plain),
  ]);
  return rows.map((r) => joinedToRelations(r, labels, authors, counterparties));
}

/**
 * All transactions attached to a given session, newest first. Feeds
 * the session-page "Транзакции" section (phase 13 / T038).
 */
export async function getTransactionsBySession(
  sessionId: string,
): Promise<TransactionWithRelations[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select(JOIN_SELECT)
    .eq('session_id', sessionId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`getTransactionsBySession failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as TxJoinedRow[];
  if (rows.length === 0) return [];

  const plain = rows.map(rawToTransaction);
  const [labels, authors, counterparties] = await Promise.all([
    hydrateCategoryLabels(rows[0].campaign_id, plain),
    hydrateAuthors(plain),
    hydrateCounterparties(plain),
  ]);
  return rows.map((r) => joinedToRelations(r, labels, authors, counterparties));
}

/** Single transaction by id, with joined relations. For the edit view. */
export async function getTransactionById(
  id: string,
): Promise<TransactionWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select(JOIN_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(`getTransactionById failed: ${error.message}`);
  }
  if (!data) return null;

  const raw = data as unknown as TxJoinedRow;
  const plain = rawToTransaction(raw);
  const [labels, authors, counterparties] = await Promise.all([
    hydrateCategoryLabels(raw.campaign_id, [plain]),
    hydrateAuthors([plain]),
    hydrateCounterparties([plain]),
  ]);
  return joinedToRelations(raw, labels, authors, counterparties);
}

/**
 * Both legs of a transfer as `[legA, legB]` (ordering by `created_at`
 * ascending — the sender's leg is inserted first). Returns `null`
 * when the group id doesn't exist or surfaces a single leg (data
 * corruption — shouldn't happen since both legs are inserted in one
 * multi-row statement).
 */
export async function getTransferPair(
  groupId: string,
): Promise<[TransactionWithRelations, TransactionWithRelations] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select(JOIN_SELECT)
    .eq('transfer_group_id', groupId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`getTransferPair failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as TxJoinedRow[];
  if (rows.length !== 2) return null;

  const plain = rows.map(rawToTransaction);
  const [labels, authors, counterparties] = await Promise.all([
    hydrateCategoryLabels(rows[0].campaign_id, plain),
    hydrateAuthors(plain),
    hydrateCounterparties(plain),
  ]);
  const hydrated = rows.map((r) => joinedToRelations(r, labels, authors, counterparties)) as [
    TransactionWithRelations,
    TransactionWithRelations,
  ];
  return hydrated;
}

// ---------- Ledger page ----------

type LedgerCursor = { created_at: string; id: string };

function encodeCursor(c: LedgerCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

function decodeCursor(raw: string): LedgerCursor | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Partial<LedgerCursor>;
    if (typeof parsed.created_at !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }
    return { created_at: parsed.created_at, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * Paginated ledger feed for a campaign, newest first. Filters
 * compose with AND. `cursor` is an opaque base64 token returned
 * by a previous call — pass `null` for the first page.
 *
 * `totals` runs a separate aggregate query over the same filter
 * predicate (without the limit) — we pull only the 4 amount columns
 * + `actor_pc_id` and sum/dedupe in memory. Practical up to a few
 * thousand rows; beyond that, see plan "Performance" (materialized
 * view per (campaign, loop, pc)).
 */
export async function getLedgerPage(
  campaignId: string,
  filters: LedgerFilters,
  cursor: string | null,
  pageSize: number,
): Promise<LedgerPage> {
  const supabase = await createClient();

  const applyFilters = <T extends { eq: (...a: unknown[]) => T; in: (...a: unknown[]) => T; gte: (...a: unknown[]) => T; lte: (...a: unknown[]) => T }>(q: T): T => {
    let out = q.eq('campaign_id', campaignId);
    if (filters.pc?.length) out = out.in('actor_pc_id', filters.pc);
    if (filters.loop?.length) out = out.in('loop_number', filters.loop);
    if (filters.dayFrom !== undefined) out = out.gte('day_in_loop', filters.dayFrom);
    if (filters.dayTo !== undefined) out = out.lte('day_in_loop', filters.dayTo);
    if (filters.category?.length) out = out.in('category_slug', filters.category);
    if (filters.kind?.length) out = out.in('kind', filters.kind);
    return out;
  };

  // ---- Rows query ----
  let rowsQ = supabase
    .from('transactions')
    .select(JOIN_SELECT)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .order('created_at', { ascending: false }) as any;
  rowsQ = applyFilters(rowsQ);

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (decoded) {
      // Keyset pagination: strictly older than the cursor.
      // Postgres can't express `(created_at, id) < (:ca, :id)` via
      // PostgREST easily — we approximate with `created_at < :ca`
      // which matches at cp-timestamp precision (microsecond). The
      // `id` tiebreaker is added in the unlikely event of identical
      // timestamps (same-statement batch insert, e.g. transfer).
      rowsQ = rowsQ.or(
        `created_at.lt.${decoded.created_at},and(created_at.eq.${decoded.created_at},id.lt.${decoded.id})`,
      );
    }
  }

  rowsQ = rowsQ.limit(pageSize + 1); // +1 → cheap "has next page" signal

  const { data: rowsData, error: rowsErr } = await rowsQ;
  if (rowsErr) {
    throw new Error(`getLedgerPage rows failed: ${rowsErr.message}`);
  }

  const rawRows = (rowsData ?? []) as unknown as TxJoinedRow[];
  const hasNext = rawRows.length > pageSize;
  const pageRows = hasNext ? rawRows.slice(0, pageSize) : rawRows;
  const plainPage = pageRows.map(rawToTransaction);
  const [labels, authors, counterparties] = pageRows.length
    ? await Promise.all([
        hydrateCategoryLabels(campaignId, plainPage),
        hydrateAuthors(plainPage),
        hydrateCounterparties(plainPage),
      ])
    : [
        new Map<string, string>(),
        new Map<string, string | null>(),
        new Map<string, { nodeId: string; title: string | null } | null>(),
      ];
  const hydratedRows = pageRows.map((r) =>
    joinedToRelations(r, labels, authors, counterparties),
  );
  // Collapse transfer pairs down to their sender leg (IDEA-043). Runs
  // per-page here; `ledger-list-client` re-runs it after merging
  // paginated batches to smooth the rare boundary case where two legs
  // of the same transfer straddle the cursor.
  const rows = dedupTransferPairs(hydratedRows);

  const nextCursor: string | null = hasNext
    ? encodeCursor({
        created_at: pageRows[pageRows.length - 1].created_at,
        id: pageRows[pageRows.length - 1].id,
      })
    : null;

  // ---- Totals query ----
  // Separate SELECT so filter predicate stays identical. We only need
  // the amount columns + actor_pc_id + kind + transfer_group_id. The
  // transfer_group_id lets `countDistinctEvents` count one per pair.
  let totalsQ = supabase
    .from('transactions')
    .select(
      'id, transfer_group_id, actor_pc_id, kind, amount_cp, amount_sp, amount_gp, amount_pp',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ) as any;
  totalsQ = applyFilters(totalsQ);

  const { data: totalsData, error: totalsErr } = await totalsQ;
  if (totalsErr) {
    throw new Error(`getLedgerPage totals failed: ${totalsErr.message}`);
  }

  const totalRows = (totalsData ?? []) as {
    id: string;
    transfer_group_id: string | null;
    actor_pc_id: string | null;
    kind: TransactionKind;
    amount_cp: number;
    amount_sp: number;
    amount_gp: number;
    amount_pp: number;
  }[];

  const pcs = new Set<string>();
  let netAggregateGp = 0;
  for (const r of totalRows) {
    if (r.actor_pc_id) pcs.add(r.actor_pc_id);
    if (r.kind !== 'item') {
      netAggregateGp += aggregateGp({
        cp: r.amount_cp,
        sp: r.amount_sp,
        gp: r.amount_gp,
        pp: r.amount_pp,
      });
    }
  }

  return {
    rows,
    totals: {
      // "Events" — transfer pairs count once, standalone rows count
      // individually. Keeps the summary aligned with the deduped feed.
      count: countDistinctEvents(totalRows),
      distinctPcs: pcs.size,
      netAggregateGp,
    },
    nextCursor,
  };
}

// ---------- Default day resolver ----------

/**
 * Pick a sensible `day_in_loop` to pre-fill a new transaction form for
 * the given PC.
 *
 * Priority (first match wins):
 *   1. The PC's most recent approved tx in this loop — so reopening the
 *      form after recording something on day 12 doesn't rewind the
 *      field back to the frontier on day 7.
 *   2. The PC's frontier day — max `day_to` across sessions they
 *      participated in (`getCharacterFrontier`).
 *   3. Day 1.
 *
 * Current-session day (IDEA-045, DM-picked "current session" override)
 * is intentionally skipped for now — it slots in above frontier once
 * the roadmap item lands.
 *
 * `lib/loops` is imported dynamically to avoid a circular module graph
 * (loops ↔ transactions via shared Supabase types). The dynamic import
 * is fine at the server-action scale we operate at.
 */
export async function computeDefaultDayForTx(
  pcId: string,
  loopNumber: number,
  loopId: string,
): Promise<number> {
  const supabase = await createClient();

  // 1. Latest tx in this loop wins.
  const { data: latest } = await supabase
    .from('transactions')
    .select('day_in_loop')
    .eq('actor_pc_id', pcId)
    .eq('loop_number', loopNumber)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestDay = (latest as { day_in_loop: number } | null)?.day_in_loop;
  if (typeof latestDay === 'number' && latestDay > 0) {
    return latestDay;
  }

  // 2. Frontier day (participated-in sessions max day_to).
  const { getCharacterFrontier } = await import('./loops');
  const { frontier } = await getCharacterFrontier(pcId, loopId);
  if (typeof frontier === 'number' && frontier > 0) {
    return frontier;
  }

  // 3. Fallback.
  return 1;
}
