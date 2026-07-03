'use server'

/**
 * Spec-052 (US4, C-05/C-06/C-16). Item sets — campaign-shared bundles of
 * (catalog item, qty). Each set is a node of type 'set' (mig 120); its contents
 * and author live in nodes.fields jsonb:
 *   { items: [{ itemNodeId, name, qty }], ownerUserId }
 * Create / view / buy: any campaign member. Edit / delete: author or DM (C-05).
 * Buying a set (buySet, added with T027) is all-or-nothing with approval
 * aggregated by max rarity (C-16).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { invalidateSidebar } from '@/lib/sidebar-cache'
import type { Role } from '@/lib/auth'
import { createPurchase, createTransfer } from '@/app/actions/transactions'
import { getWallet } from '@/lib/transactions'
import { getStashNode } from '@/lib/stash'
import { computeShortfall } from '@/lib/transaction-resolver'
import { parseItemDefaultPrices, type RarityKey } from '@/lib/item-default-prices'
import {
  parseItemPurchasePolicy,
  resolveBuyUnitPriceGp,
  setBuyRequiresApproval,
  normalizeRarity,
} from '@/lib/item-purchase-policy'
import { approvalsEnabledFromSettings } from '@/lib/approval-policy'
import { notifyLedgerEvent } from '@/lib/telegram/ledger-feed'
import { ledgerFeedConfigured } from '@/lib/telegram/bot'

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export type SetItem = { itemNodeId: string; name: string; qty: number }

function sanitizeItems(raw: unknown): SetItem[] {
  if (!Array.isArray(raw)) return []
  const out: SetItem[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const { itemNodeId, name, qty } = r as Record<string, unknown>
    if (typeof itemNodeId !== 'string' || !itemNodeId) continue
    if (typeof name !== 'string' || !name.trim()) continue
    const q =
      typeof qty === 'number' && Number.isInteger(qty) && qty >= 1 ? qty : 1
    out.push({ itemNodeId, name: name.trim(), qty: q })
  }
  return out
}

async function resolveSetTypeId(
  admin: SupabaseClient,
  campaignId: string,
): Promise<string | null> {
  const { data } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'set')
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Load a set's author for the edit/delete gate. Returns null if not a set. */
async function loadSetOwner(
  admin: SupabaseClient,
  campaignId: string,
  setId: string,
): Promise<{ ownerUserId: string | null; fields: Record<string, unknown> } | null> {
  const { data } = await admin
    .from('nodes')
    .select('fields, node_types!inner(slug)')
    .eq('id', setId)
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'set')
    .maybeSingle()
  if (!data) return null
  const fields = (data as { fields?: Record<string, unknown> }).fields ?? {}
  const ownerUserId =
    typeof fields.ownerUserId === 'string' ? fields.ownerUserId : null
  return { ownerUserId, fields }
}

function canManageSet(
  ownerUserId: string | null,
  userId: string,
  role: Role,
): boolean {
  if (role === 'owner' || role === 'dm') return true
  return ownerUserId !== null && ownerUserId === userId
}

/**
 * Spec-053. Best-effort priced total of a set's items, for the «создан набор»
 * ledger post (buyItems computes its own total for affordability). Prices each
 * item exactly as createPurchase does; unpriceable items contribute 0. Only
 * called when the feed is configured, so its two reads never run on staging.
 */
async function computeSetTotalGp(
  admin: SupabaseClient,
  campaignId: string,
  items: SetItem[],
): Promise<number> {
  if (items.length === 0) return 0
  const { data: campRow } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle()
  const settings =
    (campRow as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  const defaults = parseItemDefaultPrices(settings.item_default_prices)
  const policy = parseItemPurchasePolicy(settings.item_purchase_policy)

  const { data: attrRows } = await admin
    .from('nodes')
    .select('id, item_attributes!inner(price_gp, rarity, category_slug)')
    .eq('campaign_id', campaignId)
    .in(
      'id',
      items.map((i) => i.itemNodeId),
    )
  const attrById = new Map<
    string,
    { priceGp: number | null; rarity: string | null; categorySlug: string }
  >()
  for (const r of (attrRows ?? []) as Array<{
    id: string
    item_attributes:
      | { price_gp: number | null; rarity: string | null; category_slug: string }
      | { price_gp: number | null; rarity: string | null; category_slug: string }[]
      | null
  }>) {
    const a = Array.isArray(r.item_attributes) ? r.item_attributes[0] : r.item_attributes
    if (!a) continue
    attrById.set(r.id, {
      priceGp: a.price_gp,
      rarity: a.rarity,
      categorySlug: a.category_slug,
    })
  }

  let total = 0
  for (const it of items) {
    const a = attrById.get(it.itemNodeId)
    if (!a) continue
    const unit = resolveBuyUnitPriceGp({
      priceGp: a.priceGp,
      categorySlug: a.categorySlug,
      rarity: normalizeRarity(a.rarity),
      defaults,
      policy,
    })
    if (unit != null) total += unit * it.qty
  }
  return total
}

export async function createSet(input: {
  campaignId: string
  title: string
  items: SetItem[]
}): Promise<ActionResult<{ id: string }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  const title = input.title?.trim()
  if (!title) return { ok: false, error: 'Название набора пустое' }
  const items = sanitizeItems(input.items)
  if (items.length === 0) return { ok: false, error: 'В наборе нет предметов' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()
  const typeId = await resolveSetTypeId(admin, input.campaignId)
  if (!typeId) {
    return { ok: false, error: 'Тип «набор» не зарегистрирован (миграция 120)' }
  }

  const { data, error } = await admin
    .from('nodes')
    .insert({
      campaign_id: input.campaignId,
      type_id: typeId,
      title,
      fields: { items, ownerUserId: user.id },
    })
    .select('id')
    .single()
  if (error || !data) {
    return {
      ok: false,
      error: `Не удалось создать набор: ${error?.message ?? 'unknown'}`,
    }
  }
  invalidateSidebar(input.campaignId)

  // Best-effort feed post — must never fail the create (the set already exists).
  if (ledgerFeedConfigured()) {
    try {
      const totalGp = await computeSetTotalGp(admin, input.campaignId, items)
      await notifyLedgerEvent({
        type: 'set-created',
        campaignId: input.campaignId,
        authorUserId: user.id,
        setTitle: title,
        items: items.map((i) => ({ name: i.name, qty: i.qty })),
        totalGp,
      })
    } catch (e) {
      console.error('[ledger-feed] set-created notify failed', e)
    }
  }

  return { ok: true, id: (data as { id: string }).id }
}

export async function updateSet(input: {
  campaignId: string
  setId: string
  title?: string
  items?: SetItem[]
}): Promise<ActionResult> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.setId) return { ok: false, error: 'Не указан набор' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()
  const owner = await loadSetOwner(admin, input.campaignId, input.setId)
  if (!owner) return { ok: false, error: 'Набор не найден' }
  if (!canManageSet(owner.ownerUserId, user.id, membership.role)) {
    return { ok: false, error: 'Редактировать набор может только автор или ДМ' }
  }

  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) return { ok: false, error: 'Название набора пустое' }
    patch.title = t
  }
  if (input.items !== undefined) {
    const items = sanitizeItems(input.items)
    if (items.length === 0) return { ok: false, error: 'В наборе нет предметов' }
    // Preserve ownerUserId (and any other fields) when rewriting items.
    patch.fields = { ...owner.fields, items }
  }
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await admin
    .from('nodes')
    .update(patch)
    .eq('id', input.setId)
    .eq('campaign_id', input.campaignId)
  if (error) return { ok: false, error: `Не удалось обновить набор: ${error.message}` }
  invalidateSidebar(input.campaignId)
  return { ok: true }
}

export async function deleteSet(input: {
  campaignId: string
  setId: string
}): Promise<ActionResult> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.setId) return { ok: false, error: 'Не указан набор' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()
  const owner = await loadSetOwner(admin, input.campaignId, input.setId)
  if (!owner) return { ok: false, error: 'Набор не найден' }
  if (!canManageSet(owner.ownerUserId, user.id, membership.role)) {
    return { ok: false, error: 'Удалить набор может только автор или ДМ' }
  }

  const { error } = await admin
    .from('nodes')
    .delete()
    .eq('id', input.setId)
    .eq('campaign_id', input.campaignId)
  if (error) return { ok: false, error: `Не удалось удалить набор: ${error.message}` }
  invalidateSidebar(input.campaignId)
  return { ok: true }
}

/**
 * Buy an explicit list of catalog items for a PC as one batch (spec-052, US4
 * core — C-06/C-16). Used by buySet and by edit-on-buy's one-off purchase
 * (C-19). All-or-nothing: the total is pre-checked against the funding source,
 * then each item is bought through createPurchase sharing one batch + one
 * status. Approval aggregates by max rarity (C-16). Any «нельзя купить» or
 * priceless item blocks the buy.
 *
 * Funding (spec-053): own gold, общак directly, or `pc_with_stash` (own +
 * общак with an optional `keepGp` floor). For pc_with_stash the shortfall is
 * borrowed ONCE up front on the aggregated set total (a per-item topup would
 * re-apply keep and misread the wallet), then every item is bought as 'pc'.
 *
 * Atomicity: the topup + every purchase share one `batchId`, and a mid-loop
 * failure deletes the whole batch — so a failed set-buy never strands общак
 * gold on the buyer's wallet.
 */
export async function buyItems(input: {
  campaignId: string
  items: SetItem[]
  buyerPcId: string
  fundingSource: 'pc' | 'stash' | 'pc_with_stash'
  loopNumber: number
  dayInLoop: number
  comment?: string
  /** Spec-053: set title for the «взят набор» feed post. Edit-on-buy omits it. */
  setTitle?: string
  /** Spec-053 «оставить на руках»: own-wallet floor for pc_with_stash. */
  keepGp?: number
}): Promise<ActionResult<{ status: 'approved' | 'pending'; count: number }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.buyerPcId) return { ok: false, error: 'Не выбран персонаж' }
  if (
    input.fundingSource !== 'pc' &&
    input.fundingSource !== 'stash' &&
    input.fundingSource !== 'pc_with_stash'
  ) {
    return { ok: false, error: 'Купить можно за свои, из общака или свои+общак' }
  }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()
  const items = sanitizeItems(input.items)
  if (items.length === 0) return { ok: false, error: 'Список предметов пуст' }

  // Campaign buy config.
  const { data: campRow, error: campErr } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', input.campaignId)
    .single()
  if (campErr) {
    return { ok: false, error: `Не удалось прочитать настройки: ${campErr.message}` }
  }
  const settings =
    (campRow as { settings?: Record<string, unknown> }).settings ?? {}
  const defaults = parseItemDefaultPrices(settings.item_default_prices)
  const policy = parseItemPurchasePolicy(settings.item_purchase_policy)

  // Resolve each item's attrs (price / rarity / category + no_purchase).
  const ids = items.map((i) => i.itemNodeId)
  const { data: attrRows } = await admin
    .from('nodes')
    .select('id, fields, item_attributes!inner(price_gp, rarity, category_slug)')
    .eq('campaign_id', input.campaignId)
    .in('id', ids)
  const attrById = new Map<
    string,
    {
      priceGp: number | null
      rarity: string | null
      categorySlug: string
      noPurchase: boolean
    }
  >()
  for (const r of (attrRows ?? []) as Array<{
    id: string
    fields: Record<string, unknown> | null
    item_attributes:
      | { price_gp: number | null; rarity: string | null; category_slug: string }
      | { price_gp: number | null; rarity: string | null; category_slug: string }[]
      | null
  }>) {
    const a = Array.isArray(r.item_attributes)
      ? r.item_attributes[0]
      : r.item_attributes
    if (!a) continue
    attrById.set(r.id, {
      priceGp: a.price_gp,
      rarity: a.rarity,
      categorySlug: a.category_slug,
      noPurchase: (r.fields ?? {}).no_purchase === true,
    })
  }

  // Guards + price / total / rarity aggregation.
  let totalGp = 0
  const rarities: RarityKey[] = []
  for (const it of items) {
    const a = attrById.get(it.itemNodeId)
    if (!a) {
      return {
        ok: false,
        error: `Предмет «${it.name}» больше не в каталоге — обновите набор`,
      }
    }
    if (a.noPurchase) {
      return {
        ok: false,
        error: `«${it.name}» нельзя купить — уберите его из набора`,
      }
    }
    const rarity = normalizeRarity(a.rarity)
    const unit = resolveBuyUnitPriceGp({
      priceGp: a.priceGp,
      categorySlug: a.categorySlug,
      rarity,
      defaults,
      policy,
    })
    if (unit == null) {
      return { ok: false, error: `У «${it.name}» нет цены — купить набор нельзя` }
    }
    totalGp += unit * it.qty
    rarities.push(rarity)
  }

  // Aggregated approval by max rarity (C-16). Spec-053: the campaign
  // kill-switch short-circuits it, so the returned status matches what
  // createPurchase actually writes (approved) when approvals are off.
  const status: 'approved' | 'pending' =
    approvalsEnabledFromSettings(settings) && setBuyRequiresApproval(policy, rarities)
      ? 'pending'
      : 'approved'

  // All-or-nothing affordability pre-check (avoids partial inserts). For
  // pc_with_stash we also compute the single aggregated topup up front.
  const stashNode =
    input.fundingSource === 'pc' ? null : await getStashNode(input.campaignId)
  if (input.fundingSource !== 'pc' && !stashNode) {
    return { ok: false, error: 'Общак не найден' }
  }
  let toBorrow = 0
  if (input.fundingSource === 'pc') {
    const w = await getWallet(input.buyerPcId, input.loopNumber)
    if (w.aggregate_gp < totalGp) {
      return { ok: false, error: 'Недостаточно золота на весь набор' }
    }
  } else if (input.fundingSource === 'stash') {
    const w = await getWallet(stashNode!.nodeId, input.loopNumber)
    if (w.aggregate_gp < totalGp) {
      return { ok: false, error: 'В общаке недостаточно золота на весь набор' }
    }
  } else {
    // pc_with_stash — no общак coverage for a set on approval (C-14 parity).
    if (status === 'pending') {
      return {
        ok: false,
        error:
          'Покрытие из общака недоступно для набора на одобрении — купи за свои или из общака напрямую',
      }
    }
    const [pcW, stashW] = await Promise.all([
      getWallet(input.buyerPcId, input.loopNumber),
      getWallet(stashNode!.nodeId, input.loopNumber),
    ])
    const sf = computeShortfall(
      pcW.aggregate_gp,
      totalGp,
      stashW.aggregate_gp,
      input.keepGp ?? 0,
    )
    if (sf.remainderNegative > 0) {
      return { ok: false, error: 'Недостаточно золота даже с общаком' }
    }
    toBorrow = sf.toBorrow
  }

  // Execute: one batch, one shared status, routed through createPurchase.
  const batchId = crypto.randomUUID()
  const comment = input.comment ?? 'Покупка'

  // pc_with_stash: borrow the whole set's shortfall ONCE (общак → buyer,
  // auto-approved, same batch), then buy every item as 'pc'. Keeps the wallet
  // read once and centralises keep, vs a per-item topup that would drift.
  if (toBorrow > 0) {
    const topup = await createTransfer({
      campaignId: input.campaignId,
      senderPcId: stashNode!.nodeId,
      recipientPcId: input.buyerPcId,
      amountGp: toBorrow,
      categorySlug: 'transfer',
      comment: `Покрытие набора: ${input.setTitle ?? comment}`,
      loopNumber: input.loopNumber,
      dayInLoop: input.dayInLoop,
      autoApprove: true,
      batchId,
    })
    if (!topup.ok) return topup
  }
  // After the topup the buyer holds enough, so each item is a plain 'pc' buy.
  const perItemFunding: 'pc' | 'stash' =
    input.fundingSource === 'stash' ? 'stash' : 'pc'

  let count = 0
  for (const it of items) {
    const res = await createPurchase({
      campaignId: input.campaignId,
      buyerPcId: input.buyerPcId,
      itemNodeId: it.itemNodeId,
      qty: it.qty,
      fundingSource: perItemFunding,
      loopNumber: input.loopNumber,
      dayInLoop: input.dayInLoop,
      batchId,
      forceStatus: status,
      comment,
    })
    if (!res.ok) {
      // Roll back the whole batch — completed purchases AND the topup share
      // batchId — so a mid-loop failure doesn't strand общак gold on the buyer.
      await admin.from('transactions').delete().eq('batch_id', batchId)
      return { ok: false, error: `Ошибка на позиции ${count + 1}: ${res.error}` }
    }
    count++
  }

  // Spec-053: one aggregate «взят набор» post (the inner createPurchase calls
  // stay silent). totalGp + items are already resolved above.
  await notifyLedgerEvent({
    type: 'set-bought',
    campaignId: input.campaignId,
    actorPcId: input.buyerPcId,
    authorUserId: user.id,
    setTitle: input.setTitle ?? null,
    items: items.map((i) => ({ name: i.name, qty: i.qty })),
    totalGp,
  })

  return { ok: true, status, count }
}

/**
 * Buy a stored set for a PC (spec-052, US4). Thin wrapper: loads the set's
 * items and delegates to buyItems. Edit-on-buy's one-off purchase calls
 * buyItems directly with an edited list, so the source set is never touched
 * (C-19).
 */
export async function buySet(input: {
  campaignId: string
  setId: string
  buyerPcId: string
  fundingSource: 'pc' | 'stash' | 'pc_with_stash'
  loopNumber: number
  dayInLoop: number
  keepGp?: number
}): Promise<ActionResult<{ status: 'approved' | 'pending'; count: number }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.setId) return { ok: false, error: 'Не указан набор' }

  const admin = createAdminClient()
  const { data: setRow } = await admin
    .from('nodes')
    .select('title, fields, node_types!inner(slug)')
    .eq('id', input.setId)
    .eq('campaign_id', input.campaignId)
    .eq('node_types.slug', 'set')
    .maybeSingle()
  if (!setRow) return { ok: false, error: 'Набор не найден' }
  const setTitle = (setRow as { title?: string }).title ?? ''
  const setFields = (setRow as { fields?: Record<string, unknown> }).fields ?? {}
  const items = sanitizeItems(setFields.items)

  return buyItems({
    campaignId: input.campaignId,
    items,
    buyerPcId: input.buyerPcId,
    fundingSource: input.fundingSource,
    keepGp: input.keepGp,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    comment: setTitle ? `Набор: ${setTitle}` : 'Набор',
    setTitle: setTitle || undefined,
  })
}
