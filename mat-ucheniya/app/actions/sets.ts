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
import { createPurchase } from '@/app/actions/transactions'
import { getWallet } from '@/lib/transactions'
import { getStashNode } from '@/lib/stash'
import { parseItemDefaultPrices, type RarityKey } from '@/lib/item-default-prices'
import {
  parseItemPurchasePolicy,
  resolveBuyUnitPriceGp,
  setBuyRequiresApproval,
  normalizeRarity,
} from '@/lib/item-purchase-policy'

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
 * priceless item blocks the buy. Funding is own gold or общак directly — the
 * topup source isn't offered here, because draining общак across several
 * per-item topups can't be pre-validated cleanly.
 *
 * Partial-insert note: the up-front guards make a mid-loop failure unlikely,
 * but createPurchase writes per item, so a rare mid-loop DB error can leave
 * the already-inserted legs in place (the DM can reject the batch).
 */
export async function buyItems(input: {
  campaignId: string
  items: SetItem[]
  buyerPcId: string
  fundingSource: 'pc' | 'stash'
  loopNumber: number
  dayInLoop: number
  comment?: string
}): Promise<ActionResult<{ status: 'approved' | 'pending'; count: number }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.buyerPcId) return { ok: false, error: 'Не выбран персонаж' }
  if (input.fundingSource !== 'pc' && input.fundingSource !== 'stash') {
    return { ok: false, error: 'Купить можно за свои или из общака' }
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

  // Aggregated approval by max rarity (C-16).
  const status: 'approved' | 'pending' = setBuyRequiresApproval(policy, rarities)
    ? 'pending'
    : 'approved'

  // All-or-nothing affordability pre-check (avoids partial inserts).
  if (input.fundingSource === 'pc') {
    const w = await getWallet(input.buyerPcId, input.loopNumber)
    if (w.aggregate_gp < totalGp) {
      return { ok: false, error: 'Недостаточно золота на весь набор' }
    }
  } else {
    const stash = await getStashNode(input.campaignId)
    if (!stash) return { ok: false, error: 'Общак не найден' }
    const w = await getWallet(stash.nodeId, input.loopNumber)
    if (w.aggregate_gp < totalGp) {
      return { ok: false, error: 'В общаке недостаточно золота на весь набор' }
    }
  }

  // Execute: one batch, one shared status, routed through createPurchase.
  const batchId = crypto.randomUUID()
  const comment = input.comment ?? 'Покупка'
  let count = 0
  for (const it of items) {
    const res = await createPurchase({
      campaignId: input.campaignId,
      buyerPcId: input.buyerPcId,
      itemNodeId: it.itemNodeId,
      qty: it.qty,
      fundingSource: input.fundingSource,
      loopNumber: input.loopNumber,
      dayInLoop: input.dayInLoop,
      batchId,
      forceStatus: status,
      comment,
    })
    if (!res.ok) {
      return { ok: false, error: `Куплено позиций: ${count}. Дальше ошибка: ${res.error}` }
    }
    count++
  }

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
  fundingSource: 'pc' | 'stash'
  loopNumber: number
  dayInLoop: number
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
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    comment: setTitle ? `Набор: ${setTitle}` : 'Набор',
  })
}
