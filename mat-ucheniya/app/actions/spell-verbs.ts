'use server'

/**
 * Spell verbs — spec-059: ПЕРЕПОДГОТОВКА (house) и КОПИРОВАНИЕ в книгу (RAW
 * волшебника). Оба — одиночный PC-акт, мгновенный, деньги с кошелька PC (дефолт)
 * или общака. Числа — `parseSpellSettings(campaigns.settings.spell_settings)`.
 *
 * ── Отличие от scribe/craft ────────────────────────────────────────────────
 * Нет писцов/часов и нет runs-таблицы (v1 доверие, состояние «известных
 * заклинаний» не трекаем — движок 045 не построен). Реальный эффект в БД:
 *   • переподготовка — одна money-строка расхода;
 *   • копирование свиток→книга — расход свитка (−1 item) + money-строка;
 *   • копирование книга→книга — только money-строка (ничего не расходуется).
 * Одно событие ленты ('reprep' | 'copy').
 *
 * ── Гейты (AGENTS.md) ──────────────────────────────────────────────────────
 * getMembership плюс проверка, что actorPcId принадлежит кампании. Любой
 * участник может действовать за любого её персонажа. funding='stash' — деньги
 * с общака (актор строки = общак). Пишем admin-клиентом.
 */

import crypto from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { getStashNode } from '@/lib/stash'
import { getWallet, type CoinSet } from '@/lib/transactions'
import { resolveSpend, aggregateGp } from '@/lib/transaction-resolver'
import { validateDayInLoop } from '@/lib/transaction-validation'
import { netStashQty } from '@/lib/resources'
import { notifyLedgerEvent, type LedgerEvent } from '@/lib/telegram/ledger-feed'
import { parseSpellSettings, reprepCostGp, copyCostGp } from '@/lib/spell-settings'
import { maxSpellLevel } from '@/lib/party-level'
import { parseSpellLevel } from '@/lib/spell'
import { loadCampaignNode, loadCurrentPartyLevel } from '@/lib/action-loaders'
import type { ActionResult } from './transactions'

// ============================================================================
// Internal helpers
// ============================================================================

/** Load `campaigns.settings.spell_settings`, parsed with defaults. */
async function loadSpellSettings(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
) {
  const { data } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle()
  const settings =
    (data as { settings?: Record<string, unknown> } | null)?.settings ?? {}
  return parseSpellSettings(settings.spell_settings)
}

/** Load a spell node (title + level 0..9), verifying node_type='spell'. */
async function loadSpellNode(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
  spellNodeId: string,
): Promise<
  | { ok: true; id: string; title: string; level: number }
  | { ok: false; error: string }
> {
  const { data, error } = await admin
    .from('nodes')
    .select('id, title, fields, node_types!inner(slug)')
    .eq('id', spellNodeId)
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'spell')
    .maybeSingle()
  if (error) return { ok: false, error: `Не удалось загрузить заклинание: ${error.message}` }
  if (!data) return { ok: false, error: 'Заклинание не найдено' }
  const row = data as { id: string; title: string; fields: Record<string, unknown> | null }
  const level = parseSpellLevel((row.fields ?? {}).level)
  if (level == null) return { ok: false, error: 'У заклинания не определён уровень' }
  return { ok: true, id: row.id, title: row.title, level }
}

/**
 * Resolve the coins to spend from a wallet node + verify coverage (non-silent,
 * как крафт/scribe). costGp must be > 0 (a zero-amount money row is forbidden —
 * mig 034; callers guard the 0 case).
 */
async function resolveMoneyOut(
  walletNodeId: string,
  loopNumber: number,
  costGp: number,
  who: string,
): Promise<{ ok: true; coins: CoinSet } | { ok: false; error: string }> {
  const wallet = await getWallet(walletNodeId, loopNumber)
  const spendCoins = resolveSpend(wallet.coins, costGp)
  const covered = Math.abs(aggregateGp(spendCoins))
  if (covered + 1e-9 < costGp) {
    const have = aggregateGp(wallet.coins)
    return {
      ok: false,
      error:
        have + 1e-9 < costGp
          ? `У ${who} недостаточно золота — нужно ${costGp} зм, есть ${Math.round(have * 100) / 100} зм`
          : `У ${who} недостаточно монет без размена`,
    }
  }
  return { ok: true, coins: spendCoins }
}

/** Common auth: any campaign member can act for any PC. */
async function gateActor(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  return { ok: true, userId: user.id }
}

// ============================================================================
// runReprep — переподготовка заклинания (house)
// ============================================================================

export type RunReprepInput = {
  campaignId: string
  /** PC, который переподготавливается (владелец = актор). */
  actorPcId: string
  /** Новое заклинание (node_type='spell'), на которое меняем. */
  newSpellNodeId: string
  /** Старое заклинание (нарратив, свободный текст); опционально. */
  oldSpellName?: string
  loopNumber: number
  dayInLoop: number
  /** Источник денег: кошелёк PC (дефолт) или общак. */
  funding?: 'pc' | 'stash'
}

export async function runReprep(
  input: RunReprepInput,
): Promise<ActionResult<{ costGp: number }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.actorPcId) return { ok: false, error: 'Не выбран персонаж' }
  if (!input.newSpellNodeId) return { ok: false, error: 'Не выбрано новое заклинание' }
  if (!Number.isInteger(input.loopNumber) || input.loopNumber < 1) {
    return { ok: false, error: 'Некорректный номер петли' }
  }
  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  const admin = createAdminClient()
  const gate = await gateActor(admin, input.campaignId)
  if (!gate.ok) return gate
  const userId = gate.userId

  // Acting PC must belong to this campaign.
  const actor = await loadCampaignNode(admin, input.campaignId, input.actorPcId)
  if (!actor) return { ok: false, error: 'Персонаж не найден' }

  const spell = await loadSpellNode(admin, input.campaignId, input.newSpellNodeId)
  if (!spell.ok) return spell
  const { level } = spell

  // Gate: spell level ≤ maxSpellLevel(party_level текущей петли).
  const levelCheck = await loadCurrentPartyLevel(admin, input.campaignId)
  if (!levelCheck.ok) return levelCheck
  const maxLevel = maxSpellLevel(levelCheck.partyLevel)
  if (level > maxLevel) {
    return {
      ok: false,
      error: `Заклинание ${level} ур. недоступно: партии ${levelCheck.partyLevel} ур. доступны до ${maxLevel} ур.`,
    }
  }

  const settings = await loadSpellSettings(admin, input.campaignId)
  const costGp = Math.round(reprepCostGp(settings, level) * 100) / 100

  const funding = input.funding === 'stash' ? 'stash' : 'pc'
  let walletNodeId = input.actorPcId
  if (funding === 'stash') {
    const stash = await getStashNode(input.campaignId)
    if (!stash) return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
    walletNodeId = stash.nodeId
  }

  const nowIso = new Date().toISOString()
  const groupId = crypto.randomUUID()
  const comment = `Переподготовка: ${spell.title}`

  // Money-out (skip entirely at 0 — заговор бесплатен, mig 034 forbids a 0 row).
  if (costGp > 0) {
    const money = await resolveMoneyOut(
      walletNodeId,
      input.loopNumber,
      costGp,
      funding === 'stash' ? 'общака' : 'персонажа',
    )
    if (!money.ok) return money
    const { error: txErr } = await admin.from('transactions').insert({
      campaign_id: input.campaignId,
      loop_number: input.loopNumber,
      day_in_loop: input.dayInLoop,
      transfer_group_id: groupId,
      status: 'approved' as const,
      author_user_id: userId,
      batch_id: null,
      approved_by_user_id: userId,
      approved_at: nowIso,
      actor_pc_id: walletNodeId,
      kind: 'money',
      amount_cp: money.coins.cp,
      amount_sp: money.coins.sp,
      amount_gp: money.coins.gp,
      amount_pp: money.coins.pp,
      item_name: null,
      item_node_id: null,
      item_qty: 1,
      category_slug: 'expense',
      comment,
      session_id: null,
    })
    if (txErr) return { ok: false, error: `Не удалось записать расход: ${txErr.message}` }
  }

  const event: LedgerEvent = {
    type: 'reprep',
    campaignId: input.campaignId,
    actorPcId: input.actorPcId,
    authorUserId: userId,
    newSpell: spell.title,
    oldSpell: input.oldSpellName?.trim() || null,
    level,
    costGp,
  }
  await notifyLedgerEvent(event)

  return { ok: true, costGp }
}

// ============================================================================
// runCopySpell — копирование в книгу (свиток→книга / книга→книга), RAW
// ============================================================================

export type RunCopySpellInput = {
  campaignId: string
  /** PC-волшебник, переписывающий в свою книгу (владелец = актор). */
  actorPcId: string
  copyMode: 'scroll-to-book' | 'book-to-book'
  /** scroll-to-book: предмет-свиток из инвентаря PC (уничтожается). */
  scrollItemNodeId?: string
  /** book-to-book: заклинание из базы (node_type='spell'), что переписываем. */
  spellNodeId?: string
  /** book-to-book: у кого переписываем (нарратив, свободный текст). */
  sourceName?: string
  loopNumber: number
  dayInLoop: number
  funding?: 'pc' | 'stash'
}

export async function runCopySpell(
  input: RunCopySpellInput,
): Promise<ActionResult<{ costGp: number }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.actorPcId) return { ok: false, error: 'Не выбран персонаж' }
  if (!Number.isInteger(input.loopNumber) || input.loopNumber < 1) {
    return { ok: false, error: 'Некорректный номер петли' }
  }
  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  const admin = createAdminClient()
  const gate = await gateActor(admin, input.campaignId)
  if (!gate.ok) return gate
  const userId = gate.userId

  const actor = await loadCampaignNode(admin, input.campaignId, input.actorPcId)
  if (!actor) return { ok: false, error: 'Персонаж не найден' }

  // Resolve the spell (name + level) + optional scroll to consume.
  let spellName = ''
  let level = 0
  let scrollNodeId: string | null = null
  let scrollTitle = ''
  if (input.copyMode === 'scroll-to-book') {
    if (!input.scrollItemNodeId) return { ok: false, error: 'Не выбран свиток' }
    const scroll = await loadCampaignNode(admin, input.campaignId, input.scrollItemNodeId)
    if (!scroll) return { ok: false, error: 'Свиток не найден' }
    scrollNodeId = scroll.id
    scrollTitle = scroll.title
    const lvl = parseSpellLevel(scroll.fields.level)
    if (lvl == null) return { ok: false, error: 'У свитка не определён уровень заклинания' }
    level = lvl
    // Spell name: prefer the linked spell node's title, else the scroll title.
    const linkedId =
      typeof scroll.fields.spell_node_id === 'string' ? scroll.fields.spell_node_id : null
    if (linkedId) {
      const linked = await loadCampaignNode(admin, input.campaignId, linkedId)
      if (linked) spellName = linked.title
    }
    if (!spellName) spellName = scroll.title

    // Coverage: the PC must actually hold ≥1 of this scroll this loop.
    const { data: holdRows, error: holdErr } = await admin
      .from('transactions')
      .select('item_qty')
      .eq('campaign_id', input.campaignId)
      .eq('actor_pc_id', input.actorPcId)
      .eq('loop_number', input.loopNumber)
      .eq('kind', 'item')
      .eq('status', 'approved')
      .eq('item_name', scroll.title)
    if (holdErr) return { ok: false, error: `Не удалось посчитать свитки: ${holdErr.message}` }
    const available = netStashQty((holdRows ?? []) as { item_qty: number }[])
    if (available < 1) return { ok: false, error: 'У персонажа нет этого свитка' }
  } else {
    if (!input.spellNodeId) return { ok: false, error: 'Не выбрано заклинание' }
    const spell = await loadSpellNode(admin, input.campaignId, input.spellNodeId)
    if (!spell.ok) return spell
    spellName = spell.title
    level = spell.level
  }

  // Gate: spell level ≤ maxSpellLevel(party_level).
  const levelCheck = await loadCurrentPartyLevel(admin, input.campaignId)
  if (!levelCheck.ok) return levelCheck
  const maxLevel = maxSpellLevel(levelCheck.partyLevel)
  if (level > maxLevel) {
    return {
      ok: false,
      error: `Заклинание ${level} ур. недоступно: партии ${levelCheck.partyLevel} ур. доступны до ${maxLevel} ур.`,
    }
  }

  const settings = await loadSpellSettings(admin, input.campaignId)
  const costGp = Math.round(copyCostGp(settings, level) * 100) / 100

  const funding = input.funding === 'stash' ? 'stash' : 'pc'
  let walletNodeId = input.actorPcId
  if (funding === 'stash') {
    const stash = await getStashNode(input.campaignId)
    if (!stash) return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
    walletNodeId = stash.nodeId
  }

  const nowIso = new Date().toISOString()
  const groupId = crypto.randomUUID()
  const comment = `Переписал заклинание: ${spellName}`
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

  // Money-out (skip at 0).
  if (costGp > 0) {
    const money = await resolveMoneyOut(
      walletNodeId,
      input.loopNumber,
      costGp,
      funding === 'stash' ? 'общака' : 'персонажа',
    )
    if (!money.ok) return money
    rows.push({
      ...approvedBase,
      actor_pc_id: walletNodeId,
      kind: 'money',
      amount_cp: money.coins.cp,
      amount_sp: money.coins.sp,
      amount_gp: money.coins.gp,
      amount_pp: money.coins.pp,
      item_name: null,
      item_node_id: null,
      item_qty: 1,
      category_slug: 'expense',
      comment,
      session_id: null,
    })
  }

  // scroll-to-book: destroy the scroll (−1 item on the PC, category 'other').
  if (input.copyMode === 'scroll-to-book' && scrollNodeId) {
    rows.push({
      ...approvedBase,
      actor_pc_id: input.actorPcId,
      kind: 'item',
      amount_cp: 0,
      amount_sp: 0,
      amount_gp: 0,
      amount_pp: 0,
      item_name: scrollTitle,
      item_node_id: scrollNodeId,
      item_qty: -1,
      category_slug: 'other',
      comment: `Свиток переписан в книгу: ${spellName}`,
      session_id: null,
    })
  }

  if (rows.length > 0) {
    const { error: txErr } = await admin.from('transactions').insert(rows)
    if (txErr) return { ok: false, error: `Не удалось записать движения: ${txErr.message}` }
  }

  const event: LedgerEvent = {
    type: 'copy',
    campaignId: input.campaignId,
    actorPcId: input.actorPcId,
    authorUserId: userId,
    spell: spellName,
    source: input.copyMode === 'book-to-book' ? input.sourceName?.trim() || null : null,
    copyMode: input.copyMode,
    level,
    costGp,
    scrollConsumed: input.copyMode === 'scroll-to-book',
  }
  await notifyLedgerEvent(event)

  return { ok: true, costGp }
}
