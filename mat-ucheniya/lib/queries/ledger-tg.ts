import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateGp } from '@/lib/transaction-resolver'
import type { CoinSet } from '@/lib/transactions'

/**
 * Read-side queries for the Telegram Mini App ledger (spec-044, PL-5).
 *
 * These run client-side through the Telegram-minted session, so every read is
 * RLS-scoped (the policies already grant campaign members member-wide SELECT —
 * see T007). They mirror the desktop server reads (`getWallet`, loop lookup,
 * stash resolution) but with the tg-client; the only shared *logic* is the
 * pure `aggregateGp` (coins → gp), so there is no new bookkeeping math here.
 */

export type TgRole = 'owner' | 'dm' | 'player'
export type TgCampaign = { campaignId: string; role: TgRole }

/**
 * The caller's campaign. Single-campaign deployment — we take their first
 * membership. (`campaign_members` SELECT is `is_member`, so this returns only
 * campaigns they belong to.)
 */
export async function getMyCampaign(
  supabase: SupabaseClient,
  userId: string,
): Promise<TgCampaign | null> {
  const { data, error } = await supabase
    .from('campaign_members')
    .select('campaign_id, role')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { campaign_id: string; role: TgRole }
  return { campaignId: row.campaign_id, role: row.role }
}

/**
 * The campaign's current loop number (the loop node with `fields.status =
 * 'current'`). Falls back to 1 when none is current — mirrors the desktop
 * `defaultLoopNumber = currentLoop?.number ?? 1`. Balances are per-loop
 * (FR-015), so the wallet/feed are always scoped to this number.
 */
export async function getCurrentLoopNumber(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<number> {
  const { data } = await supabase
    .from('nodes')
    .select('fields, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'loop')
  const loops = (data ?? []) as Array<{ fields: Record<string, unknown> | null }>
  const current = loops.find((l) => (l.fields ?? {})['status'] === 'current')
  const n = current ? Number((current.fields ?? {})['number'] ?? 0) : 0
  return n > 0 ? n : 1
}

export type TgWallet = { coins: CoinSet; aggregateGp: number }

/**
 * Per-(pc, loop) wallet — sums approved rows, exactly like the desktop
 * `getWallet`. `loopNumber: null` → lifetime aggregate.
 */
export async function getWalletTg(
  supabase: SupabaseClient,
  pcId: string,
  loopNumber: number | null,
): Promise<TgWallet> {
  let q = supabase
    .from('transactions')
    .select('amount_cp, amount_sp, amount_gp, amount_pp')
    .eq('actor_pc_id', pcId)
    .eq('status', 'approved')
  if (loopNumber !== null) q = q.eq('loop_number', loopNumber)
  const { data, error } = await q
  if (error) throw error

  const coins: CoinSet = { cp: 0, sp: 0, gp: 0, pp: 0 }
  for (const r of (data ?? []) as Array<{
    amount_cp: number
    amount_sp: number
    amount_gp: number
    amount_pp: number
  }>) {
    coins.cp += r.amount_cp
    coins.sp += r.amount_sp
    coins.gp += r.amount_gp
    coins.pp += r.amount_pp
  }
  return { coins, aggregateGp: aggregateGp(coins) }
}

export type TgFeedRow = {
  id: string
  kind: 'money' | 'item' | 'transfer'
  status: 'pending' | 'approved' | 'rejected'
  coins: CoinSet
  /** Signed gp-equivalent of this row (negative = outflow). */
  signedGp: number
  itemName: string | null
  itemQty: number
  categorySlug: string
  comment: string
  loopNumber: number
  dayInLoop: number
  authorUserId: string | null
  transferGroupId: string | null
  createdAt: string
}

type FeedRawRow = {
  id: string
  kind: 'money' | 'item' | 'transfer'
  status: 'pending' | 'approved' | 'rejected'
  amount_cp: number
  amount_sp: number
  amount_gp: number
  amount_pp: number
  item_name: string | null
  item_qty: number
  category_slug: string
  comment: string
  loop_number: number
  day_in_loop: number
  author_user_id: string | null
  transfer_group_id: string | null
  created_at: string
}

const FEED_SELECT =
  'id, kind, status, amount_cp, amount_sp, amount_gp, amount_pp, item_name, item_qty, category_slug, comment, loop_number, day_in_loop, author_user_id, transfer_group_id, created_at'

/**
 * A PC's transaction feed, newest first, cursor-paginated by `created_at` to
 * dodge the PostgREST ~1000-row clamp (PL-5). Includes all statuses so the
 * player sees their own `pending` rows (C-01). Pass `before` = the previous
 * page's last `created_at` to load older rows.
 */
export async function getFeedTg(
  supabase: SupabaseClient,
  pcId: string,
  loopNumber: number | null,
  opts: { before?: string | null; limit?: number },
): Promise<{ rows: TgFeedRow[]; nextCursor: string | null }> {
  const limit = opts.limit ?? 25
  let q = supabase.from('transactions').select(FEED_SELECT).eq('actor_pc_id', pcId)
  if (loopNumber !== null) q = q.eq('loop_number', loopNumber)
  if (opts.before) q = q.lt('created_at', opts.before)
  q = q.order('created_at', { ascending: false }).limit(limit + 1)

  const { data, error } = await q
  if (error) throw error
  const raw = (data ?? []) as FeedRawRow[]
  const hasMore = raw.length > limit
  const slice = hasMore ? raw.slice(0, limit) : raw

  const rows: TgFeedRow[] = slice.map((r) => {
    const coins: CoinSet = {
      cp: r.amount_cp,
      sp: r.amount_sp,
      gp: r.amount_gp,
      pp: r.amount_pp,
    }
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      coins,
      signedGp: aggregateGp(coins),
      itemName: r.item_name,
      itemQty: r.item_qty,
      categorySlug: r.category_slug,
      comment: r.comment,
      loopNumber: r.loop_number,
      dayInLoop: r.day_in_loop,
      authorUserId: r.author_user_id,
      transferGroupId: r.transfer_group_id,
      createdAt: r.created_at,
    }
  })
  const nextCursor = hasMore ? slice[slice.length - 1].created_at : null
  return { rows, nextCursor }
}

/** Map of transaction category slug → display label for the campaign. */
export async function getTxCategoriesTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from('categories')
    .select('slug, label')
    .eq('campaign_id', campaignId)
    .eq('scope', 'transaction')
  const m = new Map<string, string>()
  for (const c of (data ?? []) as Array<{ slug: string; label: string }>) {
    m.set(c.slug, c.label)
  }
  return m
}

/**
 * The общак (campaign stash node, `node_types.slug = 'stash'`): its wallet +
 * recent movements for the loop. Read-only here; put/take are write actions.
 */
export async function getStashTg(
  supabase: SupabaseClient,
  campaignId: string,
  loopNumber: number | null,
): Promise<{ stashNodeId: string | null; wallet: TgWallet; recent: TgFeedRow[] }> {
  const { data } = await supabase
    .from('nodes')
    .select('id, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'stash')
    .limit(1)
  const stashNodeId = (data?.[0] as { id: string } | undefined)?.id ?? null
  if (!stashNodeId) {
    return {
      stashNodeId: null,
      wallet: { coins: { cp: 0, sp: 0, gp: 0, pp: 0 }, aggregateGp: 0 },
      recent: [],
    }
  }
  const wallet = await getWalletTg(supabase, stashNodeId, loopNumber)
  const { rows } = await getFeedTg(supabase, stashNodeId, loopNumber, { limit: 15 })
  return { stashNodeId, wallet, recent: rows }
}
