'use server'

/**
 * Expedition server actions — spec-055 «Вылазки».
 *
 * A player-facing /tg feature on the TRUST MODEL (no DM approval — spec-053
 * turned approvals off; every write here auto-approves). A вылазка is: a player
 * gathers a pack of PCs, spends consumables, and brings a reward home. Money
 * flows ONLY through the общак (stash node) and «out of the world» — there is
 * no PC counterparty:
 *   • consumables  → a money EXPENSE on the общак (−consumablesCostGp),
 *   • reward money → a money INCOME on the общак  (+rewardMoneyGp),
 *   • reward items → item rows credited to the общак (+qty each).
 * One `expedition_runs` row records who/when/what; one 'expedition' ledger
 * event narrates it (never per-row — the feed must not flood).
 *
 * ── Gating decision (documented per AGENTS.md) ─────────────────────────────
 * The financial rows have actor = the общак node, NOT a PC. `createTransaction`
 * / `createItemTransfer` gate players via `isPcOwner(actorPcId)`, which the
 * stash node can never satisfy — so a player-initiated вылазка cannot go
 * through those actions. Mirroring what the stash wrappers effectively rely on
 * (free-общак, auto-approved) and what migration 124's header prescribes, this
 * module writes the transaction rows DIRECTLY via the admin client, gated by
 * its OWN `getMembership(campaignId)` check (any campaign member — player or
 * DM — may run a вылазка; spec-055 «и ДМ, и игроки»). RLS on the transactions
 * table (member-scoped writes) is the hard safety net underneath.
 *
 * ── Pricing decision ───────────────────────────────────────────────────────
 * Consumable unit price is resolved AUTHORITATIVELY server-side, the exact
 * same way `createPurchase` prices a buy: per catalog item via `getItemById`
 * → `resolveBuyUnitPriceGp({ priceGp, categorySlug, rarity, defaults, policy })`
 * with the campaign's `item_default_prices` + `item_purchase_policy`. Free-text
 * consumables (no `itemNodeId`) and unpriced catalog items contribute 0 gp.
 * The summation is the pure `computeConsumablesCostGp` (unit-tested).
 *
 * ── Category decision ──────────────────────────────────────────────────────
 * There is no seeded 'consumables' transaction category (mig 034/119 seed:
 * income/expense/credit/loot/transfer/other/purchase). Rather than write an
 * unlabeled slug that the ledger filter can't render, the run uses the existing
 * semantic categories: consumables spend → 'expense', reward money → 'income',
 * reward items → 'loot'. `category_slug` has no FK, but keeping to the seeded
 * set keeps the desktop ledger filters clean.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { getStashNode } from '@/lib/stash'
import { getWallet } from '@/lib/transactions'
import { getItemById } from '@/lib/items'
import {
  resolveEarn,
  resolveSpend,
  signedCoinsToStored,
  aggregateGp,
} from '@/lib/transaction-resolver'
import {
  parseItemDefaultPrices,
  type ItemDefaultPrices,
} from '@/lib/item-default-prices'
import {
  parseItemPurchasePolicy,
  normalizeRarity,
  resolveBuyUnitPriceGp,
  type ItemPurchasePolicy,
} from '@/lib/item-purchase-policy'
import { validateDayInLoop, validateItemQty } from '@/lib/transaction-validation'
import { notifyLedgerEvent, type LedgerEvent } from '@/lib/telegram/ledger-feed'
import { computeConsumablesCostGp } from '@/lib/expeditions'
import { validateExpeditionWindow } from '@/lib/expedition-calendar'
import type { ActionResult } from './transactions'
import crypto from 'node:crypto'

// ============================================================================
// Input shapes
// ============================================================================

export type ExpeditionConsumable = {
  /** Optional catalog link — drives the authoritative unit price. */
  itemNodeId?: string | null
  /** Snapshot name (shown in the ledger event + stored on the run). */
  name: string
  qty: number
}

export type ExpeditionRewardItem = {
  name: string
  itemNodeId?: string | null
  qty: number
}

export type AddExpeditionInput = {
  campaignId: string
  title: string
  description?: string
  /** Menu default: [{ itemNodeId?|name, qty }] — stored verbatim as jsonb. */
  defaultConsumables?: ExpeditionConsumable[]
  defaultDurationTicks?: number | null
  /** Default reward money — whole gp, rounded like a run's rewardMoneyGp. */
  rewardMoneyGp?: number
  /** Default reward items — [{ name, itemNodeId?, qty }], cleaned like a run's. */
  rewardItems?: ExpeditionRewardItem[]
  /** Default roster — character node ids (empty strings dropped). */
  defaultParticipantNodeIds?: string[]
  /** Default minute-of-day the вылазка starts (0..1439), or null for none. */
  defaultStartMinute?: number | null
  /** Default вылазка length in minutes (> 0), or null for none. */
  defaultDurationMinute?: number | null
}

export type UpdateExpeditionInput = {
  id: string
  campaignId: string
  title?: string
  description?: string
  defaultConsumables?: ExpeditionConsumable[]
  defaultDurationTicks?: number | null
  rewardMoneyGp?: number
  rewardItems?: ExpeditionRewardItem[]
  defaultParticipantNodeIds?: string[]
  defaultStartMinute?: number | null
  defaultDurationMinute?: number | null
}

export type RunExpeditionInput = {
  campaignId: string
  /** Menu template this run came from, or null for an ad-hoc вылазка. */
  expeditionId?: string | null
  participantNodeIds: string[]
  /** Where the pack went — free text, shown in the event. */
  target: string
  loopNumber: number
  dayInLoop: number
  consumables: ExpeditionConsumable[]
  rewardMoneyGp?: number
  rewardItems?: ExpeditionRewardItem[]
  /** Minute-of-day (0..1439) the вылазка starts. Omit for a legacy/no-window run. */
  startMinute?: number
  /** Вылазка length in minutes. Paired with startMinute for the loop-window gate. */
  durationMinute?: number
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Load the campaign's buy config (default prices + policy) once. */
async function loadBuyConfig(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
): Promise<{ defaults: ItemDefaultPrices; policy: ItemPurchasePolicy }> {
  const { data } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle()
  const settings =
    (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  return {
    defaults: parseItemDefaultPrices(settings.item_default_prices),
    policy: parseItemPurchasePolicy(settings.item_purchase_policy),
  }
}

/**
 * Resolve each consumable's charged unit price the same way createPurchase
 * does. Free-text lines (no node id) and unpriced items → null (→ 0 gp in the
 * sum). Returns lines shaped for the pure `computeConsumablesCostGp`.
 */
async function priceConsumables(
  campaignId: string,
  consumables: ExpeditionConsumable[],
  cfg: { defaults: ItemDefaultPrices; policy: ItemPurchasePolicy },
): Promise<{ unitPriceGp: number | null; qty: number }[]> {
  return Promise.all(
    consumables.map(async (c) => {
      if (!c.itemNodeId) return { unitPriceGp: null, qty: c.qty }
      const item = await getItemById(campaignId, c.itemNodeId)
      if (!item) return { unitPriceGp: null, qty: c.qty }
      const unitPriceGp = resolveBuyUnitPriceGp({
        priceGp: item.priceGp,
        categorySlug: item.categorySlug,
        rarity: normalizeRarity(item.rarity),
        defaults: cfg.defaults,
        policy: cfg.policy,
      })
      return { unitPriceGp, qty: c.qty }
    }),
  )
}

/** Sanitise a consumables/reward jsonb payload down to the stored shape. */
function cleanConsumables(list: ExpeditionConsumable[] | undefined) {
  return (list ?? [])
    .filter((c) => c && typeof c.name === 'string' && c.name.trim() !== '')
    .map((c) => ({
      itemNodeId: c.itemNodeId ?? null,
      name: c.name.trim(),
      qty: Number.isFinite(c.qty) && c.qty > 0 ? c.qty : 1,
    }))
}

/**
 * Sanitise a reward-items payload down to the stored [{name, itemNodeId, qty}]
 * shape — the same cleaning runExpedition applies to a run's reward items (trim
 * name, drop blanks, qty>0 else 1, keep the optional catalog link).
 */
function cleanRewardItems(list: ExpeditionRewardItem[] | undefined) {
  return (list ?? [])
    .filter((r) => r && typeof r.name === 'string' && r.name.trim() !== '')
    .map((r) => ({
      name: r.name.trim(),
      itemNodeId: r.itemNodeId ?? null,
      qty: Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 1,
    }))
}

/**
 * Whole-gp reward money, rounded exactly like runExpedition rounds a run's
 * rewardMoneyGp (the money columns are int; no fractional gp on the template).
 */
function cleanRewardMoneyGp(v: number | undefined): number {
  return Number.isFinite(v) && (v ?? 0) > 0 ? Math.round(v as number) : 0
}

/** Keep only non-empty node ids (mirrors runExpedition's participant filter). */
function cleanParticipantIds(ids: string[] | undefined): string[] {
  return (ids ?? []).filter((v): v is string => typeof v === 'string' && v.length > 0)
}

/**
 * Validate an optional minute-of-day default (whole int, 0..1439) or null.
 * The DB column stays permissive; the range gate lives here, like the run-time
 * window check in validateExpeditionWindow.
 */
function coerceStartMinute(
  v: number | null | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v == null) return { ok: true, value: null }
  const n = Math.round(v)
  if (!Number.isFinite(n) || n < 0 || n > 1439) {
    return { ok: false, error: 'Минута старта вылазки — от 0 до 1439' }
  }
  return { ok: true, value: n }
}

/** Validate an optional duration-in-minutes default (whole int, > 0) or null. */
function coerceDurationMinute(
  v: number | null | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v == null) return { ok: true, value: null }
  const n = Math.round(v)
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'Длительность вылазки — больше 0 минут' }
  }
  return { ok: true, value: n }
}

// ============================================================================
// addExpedition — any member curates the menu
// ============================================================================

export async function addExpedition(
  input: AddExpeditionInput,
): Promise<ActionResult<{ id: string }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  const title = input.title?.trim()
  if (!title) return { ok: false, error: 'Укажите название вылазки' }

  const startCheck = coerceStartMinute(input.defaultStartMinute)
  if (!startCheck.ok) return startCheck
  const durationCheck = coerceDurationMinute(input.defaultDurationMinute)
  if (!durationCheck.ok) return durationCheck

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('expeditions')
    .insert({
      campaign_id: input.campaignId,
      title,
      description: input.description?.trim() ?? '',
      default_consumables: cleanConsumables(input.defaultConsumables),
      default_duration_ticks: input.defaultDurationTicks ?? null,
      reward_money_gp: cleanRewardMoneyGp(input.rewardMoneyGp),
      reward_items: cleanRewardItems(input.rewardItems),
      default_participant_node_ids: cleanParticipantIds(input.defaultParticipantNodeIds),
      default_start_minute: startCheck.value,
      default_duration_minute: durationCheck.value,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: `Не удалось сохранить: ${error.message}` }
  return { ok: true, id: (data as { id: string }).id }
}

// ============================================================================
// updateExpedition / deleteExpedition — author or DM/owner only
// ============================================================================

/**
 * Load a menu row's campaign + author and gate: the author may edit their own
 * row, otherwise only owner/dm. Returns the admin client + userId on success.
 */
async function gateExpeditionMutation(
  id: string,
  campaignId: string,
): Promise<
  | { ok: true; admin: ReturnType<typeof createAdminClient>; userId: string }
  | { ok: false; error: string }
> {
  if (!id) return { ok: false, error: 'Не указана вылазка' }
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()
  const { data: existing, error: loadErr } = await admin
    .from('expeditions')
    .select('id, campaign_id, created_by')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  if (!existing) return { ok: false, error: 'Вылазка не найдена' }
  const row = existing as { campaign_id: string; created_by: string | null }
  if (row.campaign_id !== campaignId) {
    return { ok: false, error: 'Вылазка принадлежит другой кампании' }
  }

  const isAuthor = row.created_by === user.id
  const isDm = membership.role === 'owner' || membership.role === 'dm'
  if (!isAuthor && !isDm) {
    return { ok: false, error: 'Изменять вылазку может только её автор или ДМ' }
  }
  return { ok: true, admin, userId: user.id }
}

export async function updateExpedition(
  input: UpdateExpeditionInput,
): Promise<ActionResult> {
  const gate = await gateExpeditionMutation(input.id, input.campaignId)
  if (!gate.ok) return gate

  const patch: Record<string, unknown> = {}
  if (input.title !== undefined) {
    const t = input.title.trim()
    if (!t) return { ok: false, error: 'Укажите название вылазки' }
    patch.title = t
  }
  if (input.description !== undefined) patch.description = input.description.trim()
  if (input.defaultConsumables !== undefined) {
    patch.default_consumables = cleanConsumables(input.defaultConsumables)
  }
  if (input.defaultDurationTicks !== undefined) {
    patch.default_duration_ticks = input.defaultDurationTicks
  }
  if (input.rewardMoneyGp !== undefined) {
    patch.reward_money_gp = cleanRewardMoneyGp(input.rewardMoneyGp)
  }
  if (input.rewardItems !== undefined) {
    patch.reward_items = cleanRewardItems(input.rewardItems)
  }
  if (input.defaultParticipantNodeIds !== undefined) {
    patch.default_participant_node_ids = cleanParticipantIds(input.defaultParticipantNodeIds)
  }
  if (input.defaultStartMinute !== undefined) {
    const c = coerceStartMinute(input.defaultStartMinute)
    if (!c.ok) return c
    patch.default_start_minute = c.value
  }
  if (input.defaultDurationMinute !== undefined) {
    const c = coerceDurationMinute(input.defaultDurationMinute)
    if (!c.ok) return c
    patch.default_duration_minute = c.value
  }
  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await gate.admin
    .from('expeditions')
    .update(patch)
    .eq('id', input.id)
  if (error) return { ok: false, error: `Не удалось обновить: ${error.message}` }
  return { ok: true }
}

export async function deleteExpedition(input: {
  id: string
  campaignId: string
}): Promise<ActionResult> {
  const gate = await gateExpeditionMutation(input.id, input.campaignId)
  if (!gate.ok) return gate

  const { error } = await gate.admin
    .from('expeditions')
    .delete()
    .eq('id', input.id)
  if (error) return { ok: false, error: `Не удалось удалить: ${error.message}` }
  return { ok: true }
}

// ============================================================================
// runExpedition — the core
// ============================================================================

export async function runExpedition(
  input: RunExpeditionInput,
): Promise<ActionResult<{ runId: string }>> {
  // --- Shape validation ---
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  const target = input.target?.trim()
  if (!target) return { ok: false, error: 'Укажите цель вылазки' }

  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  // Optional intra-day window (spec-055 time layer). When BOTH start and
  // duration are supplied, gate them STRICTLY against the loop calendar
  // (30-day «месяц странствий», 02:00 day 1 → 02:00 day 31) BEFORE any write.
  const { startMinute, durationMinute } = input
  if (startMinute != null && durationMinute != null) {
    const windowCheck = validateExpeditionWindow({
      day: input.dayInLoop,
      startMinute,
      durationMinute,
    })
    if (!windowCheck.ok) return { ok: false, error: windowCheck.error }
  }

  const participants = (input.participantNodeIds ?? []).filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  )
  if (participants.length === 0) {
    return { ok: false, error: 'Выберите хотя бы одного участника вылазки' }
  }

  const consumables = cleanConsumables(input.consumables)
  const rewardItems = (input.rewardItems ?? [])
    .filter((r) => r && typeof r.name === 'string' && r.name.trim() !== '')
    .map((r) => ({
      name: r.name.trim(),
      itemNodeId: r.itemNodeId ?? null,
      qty: Number.isFinite(r.qty) && r.qty > 0 ? r.qty : 1,
    }))
  for (const r of rewardItems) {
    const qtyErr = validateItemQty(r.qty)
    if (qtyErr) return { ok: false, error: qtyErr }
  }

  // Whole gp: the reward is credited as a money row whose amount columns are
  // `int` (mig 034). Buy prices / loop credit / every "money from the world"
  // flow use whole gp too, so rounding here keeps the coins integral and the
  // ledger consistent (no fractional gp the int columns would reject).
  const rewardMoneyGp =
    Number.isFinite(input.rewardMoneyGp) && (input.rewardMoneyGp ?? 0) > 0
      ? Math.round(input.rewardMoneyGp as number)
      : 0

  // --- Auth: any campaign member (player or DM) may run a вылазка ---
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

  // --- Consumables cost: authoritative, server-side (like createPurchase) ---
  const cfg = await loadBuyConfig(admin, input.campaignId)
  const pricedLines = await priceConsumables(input.campaignId, consumables, cfg)
  const consumablesCostGp = computeConsumablesCostGp(pricedLines)

  const nowIso = new Date().toISOString()
  // Group the run's financial rows so they read as one batch in the ledger.
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

  const rows: Record<string, unknown>[] = []

  // Consumables expense on the общак (−cost). Break the coins the stash
  // actually holds and verify coverage — same non-silent stance as every
  // other spend path (createTransaction.resolveAndCheckSpend): a вылазка
  // must not overdraw the общак into a negative no UI surfaces.
  if (consumablesCostGp > 0) {
    const stashWallet = await getWallet(stash.nodeId, input.loopNumber)
    const spendCoins = resolveSpend(stashWallet.coins, consumablesCostGp)
    const covered = Math.abs(aggregateGp(spendCoins))
    if (covered + 1e-9 < consumablesCostGp) {
      const have = aggregateGp(stashWallet.coins)
      return {
        ok: false,
        error:
          have + 1e-9 < consumablesCostGp
            ? `В общаке недостаточно золота на расходники — нужно ${consumablesCostGp} зм, есть ${Math.round(have * 100) / 100} зм`
            : 'В общаке недостаточно монет на расходники без размена',
      }
    }
    rows.push({
      ...approvedBase,
      actor_pc_id: stash.nodeId,
      kind: 'money',
      amount_cp: spendCoins.cp,
      amount_sp: spendCoins.sp,
      amount_gp: spendCoins.gp,
      amount_pp: spendCoins.pp,
      item_name: null,
      item_node_id: null,
      item_qty: 1,
      category_slug: 'expense',
      comment: `Расходники вылазки: ${target}`,
      session_id: null,
    })
  }

  // Reward money income on the общак (+reward). Credit to the gp pile.
  if (rewardMoneyGp > 0) {
    const earnCoins = signedCoinsToStored(false, resolveEarn(rewardMoneyGp))
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
      comment: `Награда вылазки: ${target}`,
      session_id: null,
    })
  }

  // Reward items credited to the общак (+qty each), one row per item.
  for (const r of rewardItems) {
    rows.push({
      ...approvedBase,
      actor_pc_id: stash.nodeId,
      kind: 'item',
      amount_cp: 0,
      amount_sp: 0,
      amount_gp: 0,
      amount_pp: 0,
      item_name: r.name,
      item_node_id: r.itemNodeId,
      item_qty: r.qty,
      category_slug: 'loot',
      comment: `Награда вылазки: ${target}`,
      session_id: null,
    })
  }

  // --- Write the financial rows (one multi-row insert = one statement) ---
  if (rows.length > 0) {
    const { error: txErr } = await admin.from('transactions').insert(rows)
    if (txErr) {
      return { ok: false, error: `Не удалось записать движения: ${txErr.message}` }
    }
  }

  // --- Record the run ---
  const { data: runRow, error: runErr } = await admin
    .from('expedition_runs')
    .insert({
      expedition_id: input.expeditionId ?? null,
      campaign_id: input.campaignId,
      loop_number: input.loopNumber,
      day_in_loop: input.dayInLoop,
      start_minute: input.startMinute ?? null,
      duration_minute: input.durationMinute ?? null,
      participant_node_ids: participants,
      reward_money_gp: rewardMoneyGp,
      reward_items: rewardItems.map(({ name, qty }) => ({ name, qty })),
      consumables_cost_gp: consumablesCostGp,
      consumables_items: consumables.map(({ name, qty }) => ({ name, qty })),
      created_by: userId,
    })
    .select('id')
    .single()

  if (runErr) {
    // The financial rows already landed. Surface the error but note the money
    // moved — the DM can see the rows in the ledger and reconcile by hand.
    return {
      ok: false,
      error:
        rows.length > 0
          ? `Движения записаны, но лог вылазки не сохранён: ${runErr.message}. Транзакции видны в ленте.`
          : `Не удалось сохранить вылазку: ${runErr.message}`,
    }
  }

  // --- One ledger event for the whole run. Never blocks/rolls back the write
  //     (notifyLedgerEvent is off the critical path and never throws). ---
  // Resolve reward nominals for the feed: a resource (catalog category
  // 'resource' with a price) shows its номинал × qty in parens; regular loot
  // shows no price (spec-055 доработки — «у ресурсов цена в скобках»).
  const rewardEventItems = await Promise.all(
    rewardItems.map(async (r) => {
      if (!r.itemNodeId) return { name: r.name, qty: r.qty }
      const item = await getItemById(input.campaignId, r.itemNodeId)
      if (item && item.categorySlug === 'resource' && item.priceGp != null) {
        return { name: r.name, qty: r.qty, priceGp: item.priceGp }
      }
      return { name: r.name, qty: r.qty }
    }),
  )

  const event: LedgerEvent = {
    type: 'expedition',
    campaignId: input.campaignId,
    authorUserId: userId,
    participantPcIds: participants,
    target,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    startMinute: input.startMinute,
    durationMinute: input.durationMinute,
    rewardMoneyGp: rewardMoneyGp > 0 ? rewardMoneyGp : undefined,
    rewardItems: rewardEventItems,
    consumablesItems: consumables.map(({ name, qty }) => ({ name, qty })),
  }
  await notifyLedgerEvent(event)

  return { ok: true, runId: (runRow as { id: string }).id }
}
