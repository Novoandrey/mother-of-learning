import type { SupabaseClient } from '@supabase/supabase-js'
import { aggregateGp } from '@/lib/transaction-resolver'
import type { CoinSet } from '@/lib/transactions'
import {
  parseItemDefaultPrices,
  type ItemDefaultPrices,
} from '@/lib/item-default-prices'
import {
  parseItemPurchasePolicy,
  type ItemPurchasePolicy,
} from '@/lib/item-purchase-policy'

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

/**
 * The PC's own pending submissions (spec-052 US1 — «Мои заявки»): status
 * 'pending' rows awaiting a DM decision. The player can cancel them (own
 * pending only, enforced server-side) with no balance effect. Transfers show
 * as sender/recipient legs sharing transferGroupId — dedupe by group in the UI.
 */
export async function getMyPendingTg(
  supabase: SupabaseClient,
  pcId: string,
): Promise<TgFeedRow[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select(FEED_SELECT)
    .eq('actor_pc_id', pcId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as FeedRawRow[]).map((r) => {
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

export type TgBalanceRow = { id: string; title: string; aggregateGp: number; isOwn: boolean }

/**
 * Per-PC current-loop aggregate for every campaign PC + the общак (T025).
 * Reuses `getWalletTg` per PC so the math is identical to the single-PC wallet
 * — N small RLS reads in parallel; fine at campaign scale.
 */
export async function getAllBalancesTg(
  supabase: SupabaseClient,
  campaignId: string,
  loopNumber: number | null,
  characters: { id: string; title: string; isOwn: boolean }[],
): Promise<{ rows: TgBalanceRow[]; stashGp: number }> {
  const wallets = await Promise.all(
    characters.map((c) => getWalletTg(supabase, c.id, loopNumber)),
  )
  const rows: TgBalanceRow[] = characters.map((c, i) => ({
    id: c.id,
    title: c.title,
    isOwn: c.isOwn,
    aggregateGp: wallets[i].aggregateGp,
  }))

  const { data } = await supabase
    .from('nodes')
    .select('id, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'stash')
    .limit(1)
  const stashId = (data?.[0] as { id: string } | undefined)?.id ?? null
  const stashGp = stashId ? (await getWalletTg(supabase, stashId, loopNumber)).aggregateGp : 0

  return { rows, stashGp }
}

/**
 * Typeahead over campaign catalog items (Образцы — `node_types.slug='item'`)
 * for the starter-equipment screen (T026). Member-wide SELECT on `nodes`, so
 * RLS-safe under the minted JWT. Title-only; attributes aren't needed here.
 */
export async function searchCampaignItemsTg(
  supabase: SupabaseClient,
  campaignId: string,
  query: string,
  limit = 8,
): Promise<{ id: string; title: string }[]> {
  const q = query.trim()
  if (!q) return []
  const { data } = await supabase
    .from('nodes')
    .select('id, title, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .ilike('title', `%${q}%`)
    .order('title', { ascending: true })
    .limit(limit)
  return ((data ?? []) as Array<{ id: string; title: string }>).map((r) => ({
    id: r.id,
    title: r.title,
  }))
}

/**
 * Buyable catalog items for the /tg buy screen (spec-052, US2). Like
 * searchCampaignItemsTg but joins item_attributes for the data needed to
 * preview the price. The charged
 * price is computed client-side with resolveBuyUnitPriceGp + getCampaignBuyConfigTg.
 */
export type BuyableItemTg = {
  id: string
  title: string
  priceGp: number | null
  rarity: string | null
  categorySlug: string
}

export async function searchBuyableItemsTg(
  supabase: SupabaseClient,
  campaignId: string,
  query: string,
  limit = 12,
): Promise<BuyableItemTg[]> {
  const q = query.trim()
  if (!q) return []
  const { data } = await supabase
    .from('nodes')
    .select(
      'id, title, fields, item_attributes!inner(price_gp, rarity, category_slug), node_types!inner(slug)',
    )
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .ilike('title', `%${q}%`)
    .order('title', { ascending: true })
    .limit(limit)
  const rows = (data ?? []) as Array<{
    id: string
    title: string
    fields: Record<string, unknown> | null
    item_attributes:
      | { price_gp: number | null; rarity: string | null; category_slug: string }
      | { price_gp: number | null; rarity: string | null; category_slug: string }[]
      | null
  }>
  const out: BuyableItemTg[] = []
  for (const r of rows) {
    const attrs = Array.isArray(r.item_attributes)
      ? r.item_attributes[0]
      : r.item_attributes
    if (!attrs) continue
    out.push({
      id: r.id,
      title: r.title,
      priceGp: attrs.price_gp,
      rarity: attrs.rarity,
      categorySlug: attrs.category_slug,
    })
    if (out.length >= limit) break
  }
  return out
}

/**
 * Spec-053: buyable attrs (price/rarity/category) for a set of item node ids,
 * so the client can price a whole набор for the «баланс → после» preview
 * (buyItems still prices authoritatively server-side).
 */
export async function getBuyableItemsByIdsTg(
  supabase: SupabaseClient,
  campaignId: string,
  ids: string[],
): Promise<BuyableItemTg[]> {
  if (ids.length === 0) return []
  const { data } = await supabase
    .from('nodes')
    .select(
      'id, title, fields, item_attributes!inner(price_gp, rarity, category_slug), node_types!inner(slug)',
    )
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .in('id', ids)
  const rows = (data ?? []) as Array<{
    id: string
    title: string
    fields: Record<string, unknown> | null
    item_attributes:
      | { price_gp: number | null; rarity: string | null; category_slug: string }
      | { price_gp: number | null; rarity: string | null; category_slug: string }[]
      | null
  }>
  const byId = new Map<string, BuyableItemTg>()
  for (const r of rows) {
    const attrs = Array.isArray(r.item_attributes)
      ? r.item_attributes[0]
      : r.item_attributes
    if (!attrs) continue
    byId.set(r.id, {
      id: r.id,
      title: r.title,
      priceGp: attrs.price_gp,
      rarity: attrs.rarity,
      categorySlug: attrs.category_slug,
    })
  }
  return [...byId.values()]
}

/**
 * Campaign-shared item sets (spec-052, US4) for the /tg sets screen. Each set
 * is a node of type 'set'; contents + author live in nodes.fields jsonb.
 */
export type CampaignSetTg = {
  id: string
  title: string
  items: { itemNodeId: string; name: string; qty: number }[]
  ownerUserId: string | null
}

export async function getCampaignSetsTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<CampaignSetTg[]> {
  const { data } = await supabase
    .from('nodes')
    .select('id, title, fields, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'set')
    .order('title', { ascending: true })
  const rows = (data ?? []) as Array<{
    id: string
    title: string
    fields: Record<string, unknown> | null
  }>
  return rows.map((r) => {
    const f = r.fields ?? {}
    const itemsRaw = Array.isArray(f.items) ? f.items : []
    const items = itemsRaw
      .filter(
        (x): x is Record<string, unknown> => !!x && typeof x === 'object',
      )
      .map((x) => ({
        itemNodeId: typeof x.itemNodeId === 'string' ? x.itemNodeId : '',
        name: typeof x.name === 'string' ? x.name : '',
        qty: typeof x.qty === 'number' ? x.qty : 1,
      }))
      .filter((x) => x.itemNodeId && x.name)
    return {
      id: r.id,
      title: r.title,
      items,
      ownerUserId: typeof f.ownerUserId === 'string' ? f.ownerUserId : null,
    }
  })
}

/**
 * The campaign's buy config (default prices + purchase policy) from
 * campaigns.settings — loaded once by the buy/sets screens to preview the
 * charged price and the approval gate client-side (spec-052, C-13/C-14).
 */
export async function getCampaignBuyConfigTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<{ defaults: ItemDefaultPrices; policy: ItemPurchasePolicy }> {
  const { data } = await supabase
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .single()
  const settings =
    (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  return {
    defaults: parseItemDefaultPrices(settings.item_default_prices),
    policy: parseItemPurchasePolicy(settings.item_purchase_policy),
  }
}

/**
 * The PC's current-loop item holdings — net approved item quantities, only
 * those still > 0 (feedback #4: show "what's already there" under the
 * starter-equipment builder). Loop-scoped, mirroring the per-loop wallet.
 */
export async function getPcItemHoldingsTg(
  supabase: SupabaseClient,
  pcId: string,
  loopNumber: number | null,
): Promise<{ name: string; qty: number }[]> {
  let q = supabase
    .from('transactions')
    .select('item_name, item_qty')
    .eq('actor_pc_id', pcId)
    .eq('kind', 'item')
    .eq('status', 'approved')
  if (loopNumber !== null) q = q.eq('loop_number', loopNumber)
  const { data, error } = await q
  if (error) throw error

  const byName = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ item_name: string | null; item_qty: number }>) {
    const name = r.item_name ?? '—'
    byName.set(name, (byName.get(name) ?? 0) + r.item_qty)
  }
  return [...byName.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

/**
 * Full inventory view for the Mini App (spec-052, US1/US3): the PC's net
 * current-loop holdings (via getPcItemHoldingsTg) enriched with two flags —
 *   - equipped: a true row exists in pc_equipped for (pc, name, loop)
 *   - requiresAttunement: the name resolves to a catalog item whose
 *     item_attributes.requires_attunement is true (free-text ⇒ false)
 * Drives the carried/«Надето» split and the attunement soft-cap плашка (C-17).
 */
export type PcInventoryRowTg = {
  name: string
  qty: number
  equipped: boolean
  requiresAttunement: boolean
}

export async function getPcInventoryTg(
  supabase: SupabaseClient,
  campaignId: string,
  pcId: string,
  loopNumber: number | null,
): Promise<PcInventoryRowTg[]> {
  const holdings = await getPcItemHoldingsTg(supabase, pcId, loopNumber)
  if (holdings.length === 0) return []
  const names = holdings.map((h) => h.name)

  // Equipped names this loop (pc_equipped, equipped=true).
  let eq = supabase
    .from('pc_equipped')
    .select('item_name')
    .eq('pc_id', pcId)
    .eq('equipped', true)
  if (loopNumber !== null) eq = eq.eq('loop_number', loopNumber)
  const { data: eqData } = await eq
  const equippedNames = new Set(
    ((eqData ?? []) as Array<{ item_name: string }>).map((r) => r.item_name),
  )

  // Attunement: resolve held names → catalog item_attributes.requires_attunement.
  // !inner on both embeds so the name + type filters constrain the outer rows
  // (avoids the PostgREST embed-only-filter trap).
  const { data: attrData } = await supabase
    .from('nodes')
    .select(
      'title, item_attributes!inner(requires_attunement), node_types!inner(slug)',
    )
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .in('title', names)
  const attuneByName = new Map<string, boolean>()
  for (const r of (attrData ?? []) as Array<{
    title: string
    item_attributes:
      | { requires_attunement: boolean | null }
      | { requires_attunement: boolean | null }[]
      | null
  }>) {
    const attrs = Array.isArray(r.item_attributes)
      ? r.item_attributes[0]
      : r.item_attributes
    attuneByName.set(r.title, attrs?.requires_attunement === true)
  }

  return holdings.map((h) => ({
    name: h.name,
    qty: h.qty,
    equipped: equippedNames.has(h.name),
    requiresAttunement: attuneByName.get(h.name) ?? false,
  }))
}

/** Whether the PC has already taken its loop credit (category 'credit') this loop. */
export async function hasLoopCreditTg(
  supabase: SupabaseClient,
  campaignId: string,
  pcId: string,
  loopNumber: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('actor_pc_id', pcId)
    .eq('loop_number', loopNumber)
    .eq('category_slug', 'credit')
    .limit(1)
    .maybeSingle()
  return data !== null
}

/**
 * Whether the PC has already assembled its starter equipment this loop. There
 * is no dedicated category (items go as 'loot', money as 'income'), so the
 * signal is the batch's fixed comments — StarterEquipScreen writes exactly
 * 'Стартовое снаряжение' (items) / 'Стартовое золото' (money), and nothing else
 * does. No status filter, mirroring hasLoopCreditTg: the moment the batch is
 * submitted (player → pending, DM → approved) the flag flips to «взят».
 */
export async function hasStarterTakenTg(
  supabase: SupabaseClient,
  campaignId: string,
  pcId: string,
  loopNumber: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('transactions')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('actor_pc_id', pcId)
    .eq('loop_number', loopNumber)
    .in('comment', ['Стартовое снаряжение', 'Стартовое золото'])
    .limit(1)
    .maybeSingle()
  return data !== null
}

/**
 * Item holdings currently sitting in the campaign's общак (the stash node),
 * net approved qty > 0 (feedback #3 — populates the "take from stash" picker).
 */
export async function getStashItemHoldingsTg(
  supabase: SupabaseClient,
  campaignId: string,
  loopNumber: number | null,
): Promise<{ name: string; qty: number }[]> {
  const { data } = await supabase
    .from('nodes')
    .select('id, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'stash')
    .limit(1)
  const stashNodeId = (data?.[0] as { id: string } | undefined)?.id ?? null
  if (!stashNodeId) return []
  return getPcItemHoldingsTg(supabase, stashNodeId, loopNumber)
}

/**
 * Resources currently sitting in the общак that can be sold at their nominal
 * (spec-055 доработки — «продажа ресурсов из общака»). Built on
 * getStashItemHoldingsTg (net qty by name) joined to the resource catalog nodes
 * for the node id + `item_attributes.price_gp`; only names that resolve to a
 * priced item of category 'resource' come back. The name is the canonical
 * stash-holdings key — the exact key `sellStashResource` nets its coverage on,
 * so what this shows is what a sale will find.
 */
export type StashResourceHoldingTg = {
  itemNodeId: string
  name: string
  qty: number
  priceGp: number
}

export async function getStashResourceHoldingsTg(
  supabase: SupabaseClient,
  campaignId: string,
  loopNumber: number,
): Promise<StashResourceHoldingTg[]> {
  const holdings = await getStashItemHoldingsTg(supabase, campaignId, loopNumber)
  if (holdings.length === 0) return []
  const names = holdings.map((h) => h.name)

  // Resolve which of those names are priced 'resource' catalog items. !inner on
  // both embeds so the category + type filters constrain the OUTER rows (the
  // PostgREST embed-only-filter trap — same guard as getPcInventoryTg).
  const { data } = await supabase
    .from('nodes')
    .select(
      'id, title, item_attributes!inner(price_gp, category_slug), node_types!inner(slug)',
    )
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'item')
    .eq('item_attributes.category_slug', 'resource')
    .in('title', names)
  const byName = new Map<string, { itemNodeId: string; priceGp: number }>()
  for (const r of (data ?? []) as Array<{
    id: string
    title: string
    item_attributes:
      | { price_gp: number | null; category_slug: string }
      | { price_gp: number | null; category_slug: string }[]
      | null
  }>) {
    const attrs = Array.isArray(r.item_attributes) ? r.item_attributes[0] : r.item_attributes
    if (!attrs || attrs.price_gp == null) continue
    // First price wins — createResourceItem dedups resource titles per campaign.
    if (!byName.has(r.title)) byName.set(r.title, { itemNodeId: r.id, priceGp: attrs.price_gp })
  }

  // Preserve getStashItemHoldingsTg's ru-locale name sort; drop non-resources.
  return holdings.flatMap((h) => {
    const meta = byName.get(h.name)
    return meta
      ? [{ itemNodeId: meta.itemNodeId, name: h.name, qty: h.qty, priceGp: meta.priceGp }]
      : []
  })
}
