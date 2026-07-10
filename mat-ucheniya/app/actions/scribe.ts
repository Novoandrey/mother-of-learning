'use server'

/**
 * Scribe server actions — spec-059 «Написание свитков».
 *
 * Player-facing /tg feature на модели доверия (клон крафта 056). Акт записи:
 * писцы вкладывают ЧАСЫ, общак платит ФИКС-цену уровня заклинания, свиток
 * ложится в общак или конкретному PC. Одна `scribe_runs` строка + одно 'craft'-
 * событие ленты (mode 'scribe').
 *
 * ── Отличие экономики от крафта ────────────────────────────────────────────
 * Крафт: Σ(часы)×ставка(БМ) ≥ рабочая_цена, деньги = вложенное. Свитки: часы —
 * ПОРОГ (Σ ≥ норма_часов таблицы для уровня), деньги — ФИКС из таблицы (НЕ
 * часы×ставка). Числа — `parseScribeSettings(campaigns.settings.scribe_settings)`.
 *
 * ── Гейты (как крафт) ──────────────────────────────────────────────────────
 * membership (модель доверия, актор = общак → пишем admin-клиентом, RLS —
 * защитная сетка) → уровень заклинания ≤ maxSpellLevel(party_level текущей
 * петли) → Σ(часы) ≥ норма. party_level null → отказ. Заговор (0) доступен всегда.
 */

import crypto from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { getStashNode } from '@/lib/stash'
import { getWallet } from '@/lib/transactions'
import { resolveSpend, aggregateGp } from '@/lib/transaction-resolver'
import { validateDayInLoop } from '@/lib/transaction-validation'
import { notifyLedgerEvent, type LedgerEvent } from '@/lib/telegram/ledger-feed'
import { invalidateSidebar } from '@/lib/sidebar-cache'
import { parseScribeSettings, scribeRowFor } from '@/lib/scribe-settings'
import { maxSpellLevel } from '@/lib/party-level'
import {
  cleanScribeParticipants,
  totalScribeHours,
  missingScribeHours,
  type ScribeParticipantInput,
} from '@/lib/scribe'
import { parseSpellLevel, spellLevelLabel, scrollTitle } from '@/lib/spell'
import {
  loadCampaignNode,
  loadCurrentPartyLevel,
  coerceStartMinute,
} from '@/lib/action-loaders'
import type { ActionResult } from './transactions'

/** Item category marking a catalog item as a свиток заклинания. */
const SCROLL_CATEGORY_SLUG = 'scroll'

// ============================================================================
// Internal helpers
// ============================================================================

/** Load `campaigns.settings.scribe_settings`, parsed with defaults. */
async function loadScribeSettings(
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
  return parseScribeSettings(settings.scribe_settings)
}

/**
 * Load a spell node of this campaign: title + level (0..9). Verifies the node
 * is really type 'spell' (single FK nodes→node_types, unambiguous embed).
 */
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
  if (level == null) {
    return { ok: false, error: 'У заклинания не определён уровень' }
  }
  return { ok: true, id: row.id, title: row.title, level }
}

// ============================================================================
// createScrollItem — find-or-create a scroll catalog item «Свиток: X (N ур.)»
// ============================================================================

export type CreateScrollItemInput = {
  campaignId: string
  /** Имя заклинания (для заголовка свитка). */
  spellName: string
  /** Уровень заклинания (0..9) — в заголовок и в fields.level. */
  level: number
  /** Нода заклинания — soft-линк в fields.spell_node_id (БЕЗ FK, грабля 128). */
  spellNodeId?: string | null
}

/**
 * Find-or-create постоянный предмет каталога категории 'scroll'. Ключ дедупа —
 * (campaign, trimmed title, category='scroll'): существующий свиток с тем же
 * именем переиспользуется. Зеркало createSchemaItem, но линк на спелл — soft-
 * поле nodes.fields.spell_node_id (не item_attributes.schema_for_node_id).
 */
export async function createScrollItem(
  input: CreateScrollItemInput,
): Promise<ActionResult<{ itemNodeId: string; name: string }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  const spellName = input.spellName?.trim()
  if (!spellName) return { ok: false, error: 'Укажите заклинание' }
  const level = Math.min(9, Math.max(0, Math.trunc(input.level)))
  const name = scrollTitle(spellName, level)

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
  if (typeErr) return { ok: false, error: `Не удалось загрузить типы: ${typeErr.message}` }
  if (!typeRow) {
    return { ok: false, error: 'В этой кампании нет каталога предметов (node_type=item)' }
  }
  const typeId = (typeRow as { id: string }).id

  // Dedup — existing 'scroll' item with this exact title is reused (two steps
  // to sidestep the PostgREST embed-only-filter trap).
  const { data: sameTitle, error: dupErr } = await admin
    .from('nodes')
    .select('id')
    .eq('campaign_id', input.campaignId)
    .eq('type_id', typeId)
    .eq('title', name)
  if (dupErr) return { ok: false, error: `Не удалось проверить дубликаты: ${dupErr.message}` }
  const candidateIds = ((sameTitle ?? []) as { id: string }[]).map((r) => r.id)
  if (candidateIds.length > 0) {
    const { data: existing, error: exErr } = await admin
      .from('item_attributes')
      .select('node_id')
      .in('node_id', candidateIds)
      .eq('category_slug', SCROLL_CATEGORY_SLUG)
      .limit(1)
      .maybeSingle()
    if (exErr) return { ok: false, error: `Не удалось проверить дубликаты: ${exErr.message}` }
    if (existing) {
      return { ok: true, itemNodeId: (existing as { node_id: string }).node_id, name }
    }
  }

  // Step 1 — nodes row. Spell link + level live in fields (soft, no FK).
  const fields: Record<string, unknown> = { level }
  if (input.spellNodeId) fields.spell_node_id = input.spellNodeId
  const { data: nodeRow, error: nodeErr } = await admin
    .from('nodes')
    .insert({ campaign_id: input.campaignId, type_id: typeId, title: name, fields })
    .select('id')
    .single()
  if (nodeErr || !nodeRow) {
    return { ok: false, error: `Не удалось создать свиток: ${nodeErr?.message ?? 'unknown'}` }
  }
  const itemNodeId = (nodeRow as { id: string }).id

  // Step 2 — item_attributes (category 'scroll', rarity NULL, no price). On
  // failure delete the orphan node.
  const { error: attrsErr } = await admin.from('item_attributes').insert({
    node_id: itemNodeId,
    category_slug: SCROLL_CATEGORY_SLUG,
    price_gp: null,
    rarity: null,
    use_default_price: false,
  })
  if (attrsErr) {
    await admin.from('nodes').delete().eq('id', itemNodeId)
    return { ok: false, error: `Не удалось сохранить атрибуты свитка: ${attrsErr.message}` }
  }

  invalidateSidebar(input.campaignId)
  return { ok: true, itemNodeId, name }
}

// ============================================================================
// runScribe — the core
// ============================================================================

export type ScribeParticipant = ScribeParticipantInput

export type RunScribeInput = {
  campaignId: string
  /** Нода заклинания (node_type='spell'), которое записываем в свиток. */
  spellNodeId: string
  loopNumber: number
  dayInLoop: number
  /** Minute-of-day (0..1439) начала работы. Omit = без времени. */
  startMinute?: number
  /** Писцы и их часы (редактируемые, дефолт поровну — на клиенте). */
  participants: ScribeParticipant[]
  /** Получатель свитка (PC node id); null/omitted = общак. */
  recipientNodeId?: string | null
}

export async function runScribe(
  input: RunScribeInput,
): Promise<ActionResult<{ runId: string }>> {
  // --- Shape validation ---
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.spellNodeId) return { ok: false, error: 'Не выбрано заклинание' }
  if (!Number.isInteger(input.loopNumber) || input.loopNumber < 1) {
    return { ok: false, error: 'Некорректный номер петли' }
  }
  const participants = cleanScribeParticipants(input.participants)
  if (participants.length === 0) {
    return { ok: false, error: 'Выберите хотя бы одного писца с часами' }
  }

  // --- Gate 1: membership (any campaign member — модель доверия) ---
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  const userId = user.id

  const admin = createAdminClient()

  // --- Load the spell + its level ---
  const spell = await loadSpellNode(admin, input.campaignId, input.spellNodeId)
  if (!spell.ok) return spell
  const { level } = spell

  // --- Gate 2: party level of the CURRENT loop → maxSpellLevel gate ---
  const levelCheck = await loadCurrentPartyLevel(admin, input.campaignId)
  if (!levelCheck.ok) return levelCheck
  const { partyLevel } = levelCheck
  const maxLevel = maxSpellLevel(partyLevel)
  if (level > maxLevel) {
    return {
      ok: false,
      error: `Заклинание ${level} ур. недоступно: партии ${partyLevel} ур. доступны свитки до ${maxLevel} ур.`,
    }
  }

  // --- Cost + required hours from the scribe table (fixed by spell level) ---
  const settings = await loadScribeSettings(admin, input.campaignId)
  const row = scribeRowFor(settings, level)
  const costGp = Math.round(row.costGp * 100) / 100
  const requiredHours = row.hours

  // --- Gate 3: Σ(hours) ≥ required hours (threshold, not hours×rate) ---
  const hours = totalScribeHours(participants)
  const missing = missingScribeHours(requiredHours, hours)
  if (missing > 0) {
    return {
      ok: false,
      error: `Недостаточно часов: вложено ${hours} ч из ${requiredHours} ч — надо ещё ${missing} ч`,
    }
  }

  // --- Gate 4: day + optional start minute ---
  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }
  const startCheck = coerceStartMinute(input.startMinute)
  if (!startCheck.ok) return startCheck

  // --- Resolve общак + recipient (свиток → общак | конкретный PC) ---
  const stash = await getStashNode(input.campaignId)
  if (!stash) return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  const recipientNodeId = input.recipientNodeId ?? null
  if (recipientNodeId) {
    const recipient = await loadCampaignNode(admin, input.campaignId, recipientNodeId)
    if (!recipient) return { ok: false, error: 'Получатель свитка не найден' }
  }

  // --- Find-or-create the scroll catalog item «Свиток: X (N ур.)» ---
  const scrollRes = await createScrollItem({
    campaignId: input.campaignId,
    spellName: spell.title,
    level,
    spellNodeId: spell.id,
  })
  if (!scrollRes.ok) return scrollRes
  const scrollNodeId = scrollRes.itemNodeId
  const scrollName = scrollRes.name

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
  const comment = `Свиток: ${spell.title}`
  const rows: Record<string, unknown>[] = []

  // --- Expense: общак pays the fixed cost (skip at 0 — mig 034 forbids a
  //     zero-amount money row). Coverage checked non-silently, like крафт. ---
  if (costGp > 0) {
    const stashWallet = await getWallet(stash.nodeId, input.loopNumber)
    const spendCoins = resolveSpend(stashWallet.coins, costGp)
    const covered = Math.abs(aggregateGp(spendCoins))
    if (covered + 1e-9 < costGp) {
      const have = aggregateGp(stashWallet.coins)
      return {
        ok: false,
        error:
          have + 1e-9 < costGp
            ? `В общаке недостаточно золота на свиток — нужно ${costGp} зм, есть ${Math.round(have * 100) / 100} зм`
            : 'В общаке недостаточно монет на свиток без размена',
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
      comment,
      session_id: null,
    })
  }

  // Свиток: item row credited to the recipient (общак by default).
  rows.push({
    ...approvedBase,
    actor_pc_id: recipientNodeId ?? stash.nodeId,
    kind: 'item',
    amount_cp: 0,
    amount_sp: 0,
    amount_gp: 0,
    amount_pp: 0,
    item_name: scrollName,
    item_node_id: scrollNodeId,
    item_qty: 1,
    category_slug: 'loot',
    comment,
    session_id: null,
  })

  // --- Write the financial rows (one multi-row insert) ---
  const { error: txErr } = await admin.from('transactions').insert(rows)
  if (txErr) {
    return { ok: false, error: `Не удалось записать движения: ${txErr.message}` }
  }

  // --- Record the run ---
  const { data: runRow, error: runErr } = await admin
    .from('scribe_runs')
    .insert({
      campaign_id: input.campaignId,
      spell_node_id: spell.id,
      level,
      loop_number: input.loopNumber,
      day_in_loop: input.dayInLoop,
      start_minute: startCheck.value,
      participants,
      invested_gp: costGp,
      output_scroll_node_id: scrollNodeId,
      output_scroll_name: scrollName,
      recipient_node_id: recipientNodeId,
      created_by: userId,
    })
    .select('id')
    .single()
  if (runErr) {
    // Financial rows landed but the run log didn't — compensate (a retry would
    // double-charge the общак), same as runCraft.
    const { error: undoErr } = await admin
      .from('transactions')
      .delete()
      .eq('transfer_group_id', groupId)
    return {
      ok: false,
      error: undoErr
        ? `Движения записаны, но лог записи не сохранён: ${runErr.message}. Откат не удался (${undoErr.message}) — сверьте ленту вручную.`
        : `Не удалось сохранить запись свитка: ${runErr.message}. Движения отменены — попробуйте ещё раз.`,
    }
  }

  // --- One 'craft' ledger event, mode 'scribe' (off critical path) ---
  const event: LedgerEvent = {
    type: 'craft',
    campaignId: input.campaignId,
    authorUserId: userId,
    participants: participants.map((p) => ({ pcId: p.nodeId, hours: p.hours })),
    target: `${spell.title} (${spellLevelLabel(level)})`,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    startMinute: startCheck.value ?? undefined,
    investedGp: costGp > 0 ? costGp : undefined,
    recipientPcId: recipientNodeId,
    mode: 'scribe',
  }
  await notifyLedgerEvent(event)

  return { ok: true, runId: (runRow as { id: string }).id }
}
