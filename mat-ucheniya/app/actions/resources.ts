'use server'

/**
 * Resource server actions — spec-055 «Вылазки» (РЕСУРСЫ).
 *
 * A вылазка reward may include «ресурсы» — items with a nominal price («Сердце
 * ивы» 3000 зм, «Палец морозного великана» 300 зм). Andrey's decisions:
 *   (1) a ресурс is a PERMANENT catalog item, category «Ресурс»
 *       (`node_type='item'`, `item_attributes.category_slug='resource'`,
 *       `price_gp = nominal`);
 *   (2) it's sold FROM the общак at that nominal;
 *   (3) with a chosen quantity.
 * The sell action is shared: both /tg (players) and the desktop (DM) call it.
 *
 * ── Gating decision (documented per AGENTS.md) ─────────────────────────────
 * Both actions gate on `getMembership(campaignId)` — any campaign member (player
 * or DM) may curate resources and sell them from the общак (spec-055 «и ДМ, и
 * игроки»). The sale's financial rows have actor = the общак node, NOT a PC, so
 * they cannot go through `createTransaction`/`createItemTransfer` (those gate
 * players via `isPcOwner`, which the stash node can never satisfy). Mirroring
 * the sibling `runExpedition`, this module writes the transaction rows DIRECTLY
 * via the admin client, gated by its own membership check; RLS on transactions
 * (member-scoped writes) is the hard safety net underneath.
 *
 * ── Item-create decision ───────────────────────────────────────────────────
 * `createResourceItem` mirrors `createItemAction`'s two-step write (nodes row →
 * item_attributes row, FK needs the node id first; roll back the orphan node on
 * attrs failure). Minimal attrs: `category_slug='resource'`, the nominal
 * `price_gp`, `rarity=null`, and `use_default_price=false` (the nominal is an
 * explicit authoritative price, not one tracked against the campaign default
 * table). Every other attr column is nullable or DB-defaulted (mig 043/048/055).
 * Inserting a node touches the sidebar cache → `invalidateSidebar` (AGENTS.md).
 *
 * ── Sale row shape ─────────────────────────────────────────────────────────
 * Same as `runExpedition`: an `approvedBase` (approved, admin, one shared
 * `transfer_group_id`) plus two per-rows on the общак node:
 *   (a) item WITHDRAWAL  −qty  (kind 'item', amounts 0, item_name = title,
 *       item_node_id linked, category 'loot'; mig 036 allows signed item_qty);
 *   (b) money INCOME     +soldGp (kind 'money', category 'income', comment).
 * The income row is written only when `soldGp > 0` — mig 034's kind↔amount CHECK
 * forbids a zero-amount money row (matches `runExpedition`'s `> 0` discipline).
 *
 * ── Holdings decision ──────────────────────────────────────────────────────
 * "Enough in the общак?" nets `item_qty` over approved item rows on the stash
 * node this loop, keyed by the resource's authoritative title — the canonical
 * stash-holdings math (`getStashItemHoldingsTg` groups by name identically), so
 * the check agrees with what the /tg stash inventory shows.
 */

import crypto from 'node:crypto'

import { getCurrentUser, getMembership } from '@/lib/auth'
import { getStashNode } from '@/lib/stash'
import { resolveEarn, signedCoinsToStored } from '@/lib/transaction-resolver'
import { validateDayInLoop, validateItemQty } from '@/lib/transaction-validation'
import { notifyLedgerEvent, type LedgerEvent } from '@/lib/telegram/ledger-feed'
import { invalidateSidebar } from '@/lib/sidebar-cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeSoldGp, netStashQty } from '@/lib/resources'
import type { ActionResult } from './transactions'

/** The item category that marks a catalog item as a вылазка «ресурс». */
const RESOURCE_CATEGORY_SLUG = 'resource'

// ============================================================================
// createResourceItem — any member curates the resource catalog
// ============================================================================

export type CreateResourceItemInput = {
  campaignId: string
  name: string
  priceGp: number
}

/**
 * Find-or-create a permanent catalog item of category 'resource'. Dedup key is
 * (campaign, trimmed title, category='resource'): an existing resource with the
 * same name is reused (returns its id) rather than duplicated.
 */
export async function createResourceItem(
  input: CreateResourceItemInput,
): Promise<ActionResult<{ itemNodeId: string; name: string }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'Укажите название ресурса' }
  if (!Number.isFinite(input.priceGp) || input.priceGp < 0) {
    return { ok: false, error: 'Цена ресурса не может быть отрицательной' }
  }
  // Store at cp-precision — price_gp is numeric(12,2) (mig 043).
  const priceGp = Math.round(input.priceGp * 100) / 100

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()

  // Resolve the campaign's item node_type (mig 043 seeds one per campaign).
  const { data: typeRow, error: typeErr } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', input.campaignId)
    .eq('slug', 'item')
    .maybeSingle()
  if (typeErr) {
    return { ok: false, error: `Не удалось загрузить типы: ${typeErr.message}` }
  }
  if (!typeRow) {
    return {
      ok: false,
      error: 'В этой кампании нет каталога предметов (node_type=item)',
    }
  }
  const typeId = (typeRow as { id: string }).id

  // Dedup — an existing 'resource' item with this exact title is reused. Two
  // steps to sidestep the PostgREST embed-only-filter trap (see getStashNode):
  // find item nodes with the title, then check which is a resource.
  const { data: sameTitle, error: dupErr } = await admin
    .from('nodes')
    .select('id')
    .eq('campaign_id', input.campaignId)
    .eq('type_id', typeId)
    .eq('title', name)
  if (dupErr) {
    return { ok: false, error: `Не удалось проверить дубликаты: ${dupErr.message}` }
  }
  const candidateIds = ((sameTitle ?? []) as { id: string }[]).map((r) => r.id)
  if (candidateIds.length > 0) {
    const { data: existing, error: exErr } = await admin
      .from('item_attributes')
      .select('node_id')
      .in('node_id', candidateIds)
      .eq('category_slug', RESOURCE_CATEGORY_SLUG)
      .limit(1)
      .maybeSingle()
    if (exErr) {
      return { ok: false, error: `Не удалось проверить дубликаты: ${exErr.message}` }
    }
    if (existing) {
      return { ok: true, itemNodeId: (existing as { node_id: string }).node_id, name }
    }
  }

  // Step 1 — nodes row (its generated id feeds the item_attributes FK).
  const { data: nodeRow, error: nodeErr } = await admin
    .from('nodes')
    .insert({ campaign_id: input.campaignId, type_id: typeId, title: name, fields: {} })
    .select('id')
    .single()
  if (nodeErr || !nodeRow) {
    return { ok: false, error: `Не удалось создать ресурс: ${nodeErr?.message ?? 'unknown'}` }
  }
  const itemNodeId = (nodeRow as { id: string }).id

  // Step 2 — item_attributes. On failure delete the orphan node we just made.
  const { error: attrsErr } = await admin.from('item_attributes').insert({
    node_id: itemNodeId,
    category_slug: RESOURCE_CATEGORY_SLUG,
    price_gp: priceGp,
    rarity: null,
    use_default_price: false,
  })
  if (attrsErr) {
    await admin.from('nodes').delete().eq('id', itemNodeId)
    return { ok: false, error: `Не удалось сохранить атрибуты ресурса: ${attrsErr.message}` }
  }

  // A new item node changes the catalog surface — invalidate the sidebar cache
  // (AGENTS.md: any nodes/node_types mutation must).
  invalidateSidebar(input.campaignId)
  return { ok: true, itemNodeId, name }
}

// ============================================================================
// sellStashResource — sell a resource from the общак at its nominal
// ============================================================================

export type SellStashResourceInput = {
  campaignId: string
  itemNodeId: string
  qty: number
  loopNumber: number
  dayInLoop: number
}

export async function sellStashResource(
  input: SellStashResourceInput,
): Promise<ActionResult<{ soldGp: number }>> {
  // --- Shape validation ---
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.itemNodeId) return { ok: false, error: 'Не выбран ресурс' }

  const qtyErr = validateItemQty(input.qty)
  if (qtyErr) return { ok: false, error: qtyErr }
  // validateItemQty allows negatives (signed transfer legs); a sale is positive.
  if (input.qty < 0) return { ok: false, error: 'Количество должно быть больше нуля' }
  const qty = input.qty

  if (!Number.isInteger(input.loopNumber) || input.loopNumber < 1) {
    return { ok: false, error: 'Некорректный номер петли' }
  }
  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  // --- Auth: any campaign member (player or DM) ---
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  const userId = user.id

  // --- Resolve the общак ---
  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }

  const admin = createAdminClient()

  // --- Load the resource: authoritative title + nominal price ---
  const { data: nodeRow, error: nodeErr } = await admin
    .from('nodes')
    .select('id, title')
    .eq('id', input.itemNodeId)
    .eq('campaign_id', input.campaignId)
    .maybeSingle()
  if (nodeErr) {
    return { ok: false, error: `Не удалось загрузить ресурс: ${nodeErr.message}` }
  }
  if (!nodeRow) return { ok: false, error: 'Ресурс не найден' }
  const name = (nodeRow as { title: string }).title

  const { data: attrsRow, error: attrsErr } = await admin
    .from('item_attributes')
    .select('price_gp')
    .eq('node_id', input.itemNodeId)
    .maybeSingle()
  if (attrsErr) {
    return { ok: false, error: `Не удалось загрузить цену: ${attrsErr.message}` }
  }
  const priceGp = (attrsRow as { price_gp: number | null } | null)?.price_gp ?? null
  if (priceGp == null) return { ok: false, error: 'У ресурса нет цены' }

  // --- Coverage: net item_qty of this resource in the общак this loop ---
  // Keyed by title — the canonical stash-holdings key (getStashItemHoldingsTg).
  const { data: holdRows, error: holdErr } = await admin
    .from('transactions')
    .select('item_qty')
    .eq('campaign_id', input.campaignId)
    .eq('actor_pc_id', stash.nodeId)
    .eq('loop_number', input.loopNumber)
    .eq('kind', 'item')
    .eq('status', 'approved')
    .eq('item_name', name)
  if (holdErr) {
    return { ok: false, error: `Не удалось посчитать остаток: ${holdErr.message}` }
  }
  const available = netStashQty((holdRows ?? []) as { item_qty: number }[])
  if (available < qty) {
    return { ok: false, error: `В общаке недостаточно: есть ${available}` }
  }

  const soldGp = computeSoldGp(priceGp, qty)

  // --- Write the sale on the общак: one transfer_group_id, auto-approved ---
  const nowIso = new Date().toISOString()
  const groupId = crypto.randomUUID()
  const approvedBase = {
    campaign_id: input.campaignId,
    loop_number: input.loopNumber,
    day_in_loop: input.dayInLoop,
    transfer_group_id: groupId,
    status: 'approved' as const,
    author_user_id: userId,
    batch_id: null,
    approved_by_user_id: userId,
    approved_at: nowIso,
  }
  const comment = `Продажа ресурса: ${name} ×${qty}`

  const rows: Record<string, unknown>[] = []

  // (a) Item withdrawal from the общак (−qty). Item rows carry zero money
  //     amounts (mig 034 kind↔amount CHECK); signed item_qty is legal (mig 036).
  rows.push({
    ...approvedBase,
    actor_pc_id: stash.nodeId,
    kind: 'item',
    amount_cp: 0,
    amount_sp: 0,
    amount_gp: 0,
    amount_pp: 0,
    item_name: name,
    item_node_id: input.itemNodeId,
    item_qty: -qty,
    category_slug: 'loot',
    comment,
    session_id: null,
  })

  // (b) Money income on the общак (+soldGp). Skipped at soldGp=0 — mig 034
  //     forbids a zero-amount money row; a 0-value resource just leaves stock.
  if (soldGp > 0) {
    const earnCoins = signedCoinsToStored(false, resolveEarn(soldGp))
    rows.push({
      ...approvedBase,
      actor_pc_id: stash.nodeId,
      kind: 'money',
      amount_cp: earnCoins.cp,
      amount_sp: earnCoins.sp,
      amount_gp: earnCoins.gp,
      amount_pp: earnCoins.pp,
      item_name: null,
      item_node_id: null,
      item_qty: 1,
      category_slug: 'income',
      comment,
      session_id: null,
    })
  }

  const { error: txErr } = await admin.from('transactions').insert(rows)
  if (txErr) {
    return { ok: false, error: `Не удалось записать продажу: ${txErr.message}` }
  }

  // --- One ledger event, reusing the existing 'income' type (off the critical
  //     path, never throws). Only when there was income to narrate. ---
  if (soldGp > 0) {
    const event: LedgerEvent = {
      type: 'income',
      campaignId: input.campaignId,
      actorPcId: stash.nodeId,
      authorUserId: userId,
      amountGp: soldGp,
      comment,
    }
    await notifyLedgerEvent(event)
  }

  return { ok: true, soldGp }
}
