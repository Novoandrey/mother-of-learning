'use server'

/**
 * Craft server actions — spec-056 «Крафт».
 *
 * A player-facing /tg feature on the TRUST MODEL (auto-approve, spec-053).
 * A craft act: crafters invest hours, the общак pays the «рабочую цену»
 * (working cost) of the schema's target rarity, the изделие lands in the
 * общак or goes straight to a chosen PC. One `craft_runs` row records the
 * act; one 'craft' ledger event narrates it (never per-row).
 *
 * ── Gating decision (documented per AGENTS.md) ─────────────────────────────
 * The financial rows have actor = the общак node, NOT a PC — the exact same
 * situation as `runExpedition`: `createTransaction`/`createItemTransfer` gate
 * players via `isPcOwner(actorPcId)`, which the stash node can never satisfy.
 * Mirroring the вылазки canon, this module writes the transaction rows
 * DIRECTLY via the admin client, gated by its OWN `getMembership(campaignId)`
 * check (any campaign member — player or DM — may craft; модель доверия).
 * RLS on transactions (member-scoped writes) is the hard safety net.
 *
 * ── Numbers decision (AGENTS.md «числа механики = ДМ-настройки») ───────────
 * No mechanic number lives here. Rates/costs/min-levels come from
 * `parseCraftSettings(campaigns.settings.craft_settings)` (loaded per action
 * call, like `loadBuyConfig` in expeditions.ts); the PB derives from the
 * loop's `party_level` via `pbForLevel` (rules identity, not a tunable).
 * Cost resolve order (plan-056): (1) schema's own `fields.craft_cost_gp`
 * override → (2) `craft_settings.rarity[редкость ЦЕЛИ]` → (3)
 * `craft_settings.custom` when the target rarity is NULL/unknown.
 *
 * ── Party-level decision ───────────────────────────────────────────────────
 * `party_level` lives on the CURRENT loop node (`getCurrentLoop` +
 * `parsePartyLevel`). If the run is logged into a different `loopNumber`
 * (backdating), the CURRENT loop's level still applies — уровень партии не
 * версионируется по прошлым петлям, и это осознанный дефолт v1. The Loop
 * read model doesn't expose raw fields, so the node's `fields` are fetched
 * by id here rather than widening lib/loops.ts (parallel-agent domain
 * hygiene).
 *
 * ── Disassemble category decision ──────────────────────────────────────────
 * The seeded transaction categories are income/expense/credit/loot/transfer/
 * other (mig 034) + purchase (119). A разбор is an item WITHDRAWAL that is
 * neither добыча ('loot' — things gained/sold from stock keep it, see
 * sellStashResource) nor покупка — the item is destroyed to learn its schema.
 * 'other' («Прочее») is the honest seeded slug for it; an unlabeled custom
 * slug would break the ledger category filters.
 */

import crypto from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { getStashNode } from '@/lib/stash'
import { getWallet } from '@/lib/transactions'
import { getCurrentLoop } from '@/lib/loops'
import { parsePartyLevel, pbForLevel } from '@/lib/party-level'
import { parseCraftSettings, rateForPb, craftRowFor } from '@/lib/craft-settings'
import { resolveSpend, aggregateGp } from '@/lib/transaction-resolver'
import { validateDayInLoop } from '@/lib/transaction-validation'
import { notifyLedgerEvent, type LedgerEvent } from '@/lib/telegram/ledger-feed'
import { invalidateSidebar } from '@/lib/sidebar-cache'
import { netStashQty } from '@/lib/resources'
import {
  cleanCraftParticipants,
  totalCraftHours,
  missingCraftHours,
  craftRarityKey,
  type CraftParticipantInput,
} from '@/lib/craft'
import type { Rarity } from '@/lib/items-types'
import type { ActionResult } from './transactions'

/** The item category that marks a catalog item as a крафт-схема. */
const SCHEMA_CATEGORY_SLUG = 'schema'

// ============================================================================
// Internal helpers
// ============================================================================

/** Load `campaigns.settings.craft_settings`, parsed with defaults. */
async function loadCraftSettings(
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
  return parseCraftSettings(settings.craft_settings)
}

/**
 * The CURRENT loop's party level. `null` level = not set → craft refuses.
 * The Loop read model hides raw fields, so fetch them by node id.
 */
async function loadCurrentPartyLevel(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
): Promise<
  | { ok: true; partyLevel: number; loopNumber: number }
  | { ok: false; error: string }
> {
  const loop = await getCurrentLoop(campaignId)
  if (!loop) {
    return { ok: false, error: 'Не найдена текущая петля — крафт недоступен' }
  }
  const { data } = await admin
    .from('nodes')
    .select('fields')
    .eq('id', loop.id)
    .maybeSingle()
  const fields = ((data as { fields?: Record<string, unknown> } | null)?.fields ??
    {}) as Record<string, unknown>
  const partyLevel = parsePartyLevel(fields.party_level)
  if (partyLevel == null) {
    return {
      ok: false,
      error: 'Задайте уровень партии в редактировании петли — без него крафт недоступен',
    }
  }
  return { ok: true, partyLevel, loopNumber: loop.number }
}

/** A node of this campaign, or null. Guards FK writes against foreign ids. */
async function loadCampaignNode(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string,
  nodeId: string,
): Promise<{ id: string; title: string; fields: Record<string, unknown> } | null> {
  const { data } = await admin
    .from('nodes')
    .select('id, title, fields')
    .eq('id', nodeId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; title: string; fields: Record<string, unknown> | null }
  return { id: row.id, title: row.title, fields: row.fields ?? {} }
}

/** Validate an optional minute-of-day (whole int 0..1439), like expeditions. */
function coerceStartMinute(
  v: number | null | undefined,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v == null) return { ok: true, value: null }
  const n = Math.round(v)
  if (!Number.isFinite(n) || n < 0 || n > 1439) {
    return { ok: false, error: 'Минута старта — от 0 до 1439' }
  }
  return { ok: true, value: n }
}

/** Allowed catalog rarity values (mirrors item_attributes_rarity_check). */
const RARITY_VALUES: readonly string[] = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
]

// ============================================================================
// createSchemaItem — find-or-create a schema catalog item
// ============================================================================

export type CreateSchemaItemInput = {
  campaignId: string
  name: string
  /** Целевой предмет каталога, который схема учит крафтить (nullable). */
  targetItemNodeId?: string | null
  /** Цена ПОКУПКИ схемы (каталожная price_gp); null = не задана. */
  priceGp?: number | null
  /**
   * Редкость самой СХЕМЫ (по канону — цель + 1 ступень, но вычисление
   * приходит от вызывающего/клиента — сервер не навязывает).
   */
  rarity?: Rarity | null
  /** Override крафт-цены для кастомных схем → nodes.fields.craft_cost_gp. */
  craftCostGp?: number | null
}

/**
 * Find-or-create a permanent catalog item of category 'schema'. Dedup key is
 * (campaign, trimmed title, category='schema') — an existing schema with the
 * same name is reused (returns its id, attributes untouched) rather than
 * duplicated. Mirrors `createResourceItem` step for step, including the
 * orphan-node rollback and the sidebar invalidation.
 */
export async function createSchemaItem(
  input: CreateSchemaItemInput,
): Promise<ActionResult<{ itemNodeId: string; name: string }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  const name = input.name?.trim()
  if (!name) return { ok: false, error: 'Укажите название схемы' }

  let priceGp: number | null = null
  if (input.priceGp != null) {
    if (!Number.isFinite(input.priceGp) || input.priceGp < 0) {
      return { ok: false, error: 'Цена схемы не может быть отрицательной' }
    }
    priceGp = Math.round(input.priceGp * 100) / 100
  }
  let craftCostGp: number | null = null
  if (input.craftCostGp != null) {
    if (!Number.isFinite(input.craftCostGp) || input.craftCostGp < 0) {
      return { ok: false, error: 'Крафт-цена не может быть отрицательной' }
    }
    craftCostGp = Math.round(input.craftCostGp * 100) / 100
  }
  const rarity = input.rarity ?? null
  if (rarity !== null && !RARITY_VALUES.includes(rarity)) {
    return { ok: false, error: 'Неизвестная редкость схемы' }
  }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()

  // Target link must point inside this campaign (FK alone won't enforce that).
  const targetItemNodeId = input.targetItemNodeId ?? null
  if (targetItemNodeId) {
    const target = await loadCampaignNode(admin, input.campaignId, targetItemNodeId)
    if (!target) return { ok: false, error: 'Целевой предмет схемы не найден' }
  }

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

  // Dedup — an existing 'schema' item with this exact title is reused. Two
  // steps to sidestep the PostgREST embed-only-filter trap (see getStashNode).
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
      .eq('category_slug', SCHEMA_CATEGORY_SLUG)
      .limit(1)
      .maybeSingle()
    if (exErr) {
      return { ok: false, error: `Не удалось проверить дубликаты: ${exErr.message}` }
    }
    if (existing) {
      return { ok: true, itemNodeId: (existing as { node_id: string }).node_id, name }
    }
  }

  // Step 1 — nodes row. craft_cost_gp override lives in fields (cold storage).
  const fields: Record<string, unknown> = {}
  if (craftCostGp != null) fields.craft_cost_gp = craftCostGp
  const { data: nodeRow, error: nodeErr } = await admin
    .from('nodes')
    .insert({ campaign_id: input.campaignId, type_id: typeId, title: name, fields })
    .select('id')
    .single()
  if (nodeErr || !nodeRow) {
    return { ok: false, error: `Не удалось создать схему: ${nodeErr?.message ?? 'unknown'}` }
  }
  const itemNodeId = (nodeRow as { id: string }).id

  // Step 2 — item_attributes. On failure delete the orphan node we just made.
  const { error: attrsErr } = await admin.from('item_attributes').insert({
    node_id: itemNodeId,
    category_slug: SCHEMA_CATEGORY_SLUG,
    price_gp: priceGp,
    rarity,
    use_default_price: false,
    schema_for_node_id: targetItemNodeId,
  })
  if (attrsErr) {
    await admin.from('nodes').delete().eq('id', itemNodeId)
    return { ok: false, error: `Не удалось сохранить атрибуты схемы: ${attrsErr.message}` }
  }

  // A new item node changes the catalog surface — invalidate the sidebar cache
  // (AGENTS.md: any nodes/node_types mutation must).
  invalidateSidebar(input.campaignId)
  return { ok: true, itemNodeId, name }
}

// ============================================================================
// disassembleItem — destroy an item from the общак to learn its schema
// ============================================================================

export type DisassembleItemInput = {
  campaignId: string
  itemNodeId: string
  loopNumber: number
  dayInLoop: number
}

/**
 * Разбор: the item is destroyed (−1 item row on the общак, category 'other' —
 * see header), after which its schema крафтится как предмет (spec-056 §3).
 * V1 defaults (plan-056 §Развилки): мгновенный, предмет списывается с общака.
 * Coverage is netted the canonical stash-holdings way: signed `item_qty` over
 * approved item rows on the stash node this loop, keyed by the item's
 * authoritative title (`getStashItemHoldingsTg` groups identically).
 */
export async function disassembleItem(
  input: DisassembleItemInput,
): Promise<ActionResult> {
  // --- Shape validation ---
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.itemNodeId) return { ok: false, error: 'Не выбран предмет' }
  if (!Number.isInteger(input.loopNumber) || input.loopNumber < 1) {
    return { ok: false, error: 'Некорректный номер петли' }
  }
  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  // --- Auth: any campaign member (модель доверия) ---
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  const userId = user.id

  // --- Resolve the общак + the item's authoritative title ---
  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }

  const admin = createAdminClient()
  const itemNode = await loadCampaignNode(admin, input.campaignId, input.itemNodeId)
  if (!itemNode) return { ok: false, error: 'Предмет не найден' }
  const name = itemNode.title

  // --- Coverage: net qty of this item in the общак this loop ---
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
  if (available < 1) {
    return { ok: false, error: 'В общаке нет предмета на разбор' }
  }

  // --- Write the withdrawal: one item row, auto-approved, own group ---
  const nowIso = new Date().toISOString()
  const { error: txErr } = await admin.from('transactions').insert({
    campaign_id: input.campaignId,
    loop_number: input.loopNumber,
    day_in_loop: input.dayInLoop,
    transfer_group_id: crypto.randomUUID(),
    status: 'approved' as const,
    author_user_id: userId,
    batch_id: null,
    approved_by_user_id: userId,
    approved_at: nowIso,
    actor_pc_id: stash.nodeId,
    kind: 'item',
    amount_cp: 0,
    amount_sp: 0,
    amount_gp: 0,
    amount_pp: 0,
    item_name: name,
    item_node_id: input.itemNodeId,
    item_qty: -1,
    category_slug: 'other',
    comment: `Разбор предмета: ${name}`,
    session_id: null,
  })
  if (txErr) {
    return { ok: false, error: `Не удалось записать разбор: ${txErr.message}` }
  }

  // --- One 'craft' ledger event, mode 'disassemble' (never blocks the write) ---
  const event: LedgerEvent = {
    type: 'craft',
    campaignId: input.campaignId,
    authorUserId: userId,
    participants: [],
    target: name,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    mode: 'disassemble',
  }
  await notifyLedgerEvent(event)

  return { ok: true }
}

// ============================================================================
// runCraft — the core
// ============================================================================

export type CraftParticipant = CraftParticipantInput

export type RunCraftInput = {
  campaignId: string
  /** Схема (catalog item категории 'schema'), по которой крафтим. */
  schemaItemNodeId: string
  /** Имя изделия, если у схемы нет линка на целевой предмет (fallback). */
  targetLabel?: string
  loopNumber: number
  dayInLoop: number
  /** Minute-of-day (0..1439) начала работы. Omit = без времени. */
  startMinute?: number
  /** Крафтеры и их часы (редактируемые, дефолт поровну — на клиенте). */
  participants: CraftParticipant[]
  /** Получатель изделия (PC node id); null/omitted = общак. */
  recipientNodeId?: string | null
}

export async function runCraft(
  input: RunCraftInput,
): Promise<ActionResult<{ runId: string }>> {
  // --- Shape validation (cheap, before any DB round-trip) ---
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.schemaItemNodeId) return { ok: false, error: 'Не выбрана схема' }
  if (!Number.isInteger(input.loopNumber) || input.loopNumber < 1) {
    return { ok: false, error: 'Некорректный номер петли' }
  }
  const participants = cleanCraftParticipants(input.participants)
  if (participants.length === 0) {
    return { ok: false, error: 'Выберите хотя бы одного крафтера с часами' }
  }

  // --- Gate 1: membership (any campaign member — модель доверия) ---
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  const userId = user.id

  const admin = createAdminClient()

  // --- Load the schema + resolve the output item ---
  const schemaNode = await loadCampaignNode(
    admin,
    input.campaignId,
    input.schemaItemNodeId,
  )
  if (!schemaNode) return { ok: false, error: 'Схема не найдена' }
  const { data: schemaAttrsRow, error: schemaAttrsErr } = await admin
    .from('item_attributes')
    .select('category_slug, rarity, schema_for_node_id')
    .eq('node_id', schemaNode.id)
    .maybeSingle()
  if (schemaAttrsErr) {
    return { ok: false, error: `Не удалось загрузить схему: ${schemaAttrsErr.message}` }
  }
  const schemaAttrs = schemaAttrsRow as {
    category_slug: string
    rarity: string | null
    schema_for_node_id: string | null
  } | null
  if (!schemaAttrs || schemaAttrs.category_slug !== SCHEMA_CATEGORY_SLUG) {
    return { ok: false, error: 'Выбранный предмет не является схемой' }
  }

  // Output: the schema's linked target, else the caller's free-text label.
  let outputNodeId: string | null = null
  let outputName = ''
  let targetRarityRaw: string | null = null
  if (schemaAttrs.schema_for_node_id) {
    const target = await loadCampaignNode(
      admin,
      input.campaignId,
      schemaAttrs.schema_for_node_id,
    )
    if (target) {
      outputNodeId = target.id
      outputName = target.title
      const { data: targetAttrs } = await admin
        .from('item_attributes')
        .select('rarity')
        .eq('node_id', target.id)
        .maybeSingle()
      targetRarityRaw = (targetAttrs as { rarity: string | null } | null)?.rarity ?? null
    }
  }
  if (!outputName) {
    outputName = input.targetLabel?.trim() ?? ''
    if (!outputName) {
      return {
        ok: false,
        error: 'У схемы нет целевого предмета — укажите, что крафтим',
      }
    }
  }

  // --- Gate 2: party level of the CURRENT loop (see header decision) ---
  const levelCheck = await loadCurrentPartyLevel(admin, input.campaignId)
  if (!levelCheck.ok) return levelCheck
  const { partyLevel } = levelCheck

  // --- Working cost: settings + resolve order override → rarity → custom ---
  const settings = await loadCraftSettings(admin, input.campaignId)
  const overrideRaw = schemaNode.fields.craft_cost_gp
  const override =
    typeof overrideRaw === 'number' && Number.isFinite(overrideRaw) && overrideRaw >= 0
      ? overrideRaw
      : null
  const costRow = craftRowFor(settings, craftRarityKey(targetRarityRaw))
  const workCostGp = Math.round((override ?? costRow.workCostGp) * 100) / 100

  // --- Gate 3: min party level of the rarity row (null = гейта нет) ---
  if (costRow.minPartyLevel != null && partyLevel < costRow.minPartyLevel) {
    return {
      ok: false,
      error: `Крафт этой редкости доступен с уровня партии ${costRow.minPartyLevel} (сейчас ${partyLevel})`,
    }
  }

  // --- Gate 4: Σ(hours) × rate(PB) ≥ working cost ---
  const rate = rateForPb(settings, pbForLevel(partyLevel))
  const hours = totalCraftHours(participants)
  const missing = missingCraftHours({ workCostGp, ratePerHour: rate, totalHours: hours })
  if (missing > 0) {
    const investedGp = Math.round(hours * rate * 100) / 100
    return {
      ok: false,
      error:
        missing === Infinity
          ? 'Ставка вложения 0 зм/час — крафт невозможен, проверьте настройки крафта'
          : `Недостаточно часов: вложено ${hours} ч × ${rate} зм/ч = ${investedGp} зм из ${workCostGp} зм — надо ещё ${missing} ч`,
    }
  }

  // --- Gate 5: day + optional start minute (окно длительностью НЕ гейтим —
  //     многодневный крафт легален, plan-056 §Развилки) ---
  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }
  const startCheck = coerceStartMinute(input.startMinute)
  if (!startCheck.ok) return startCheck

  // --- Resolve общак + recipient (изделие → общак | конкретный PC) ---
  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }
  const recipientNodeId = input.recipientNodeId ?? null
  if (recipientNodeId) {
    const recipient = await loadCampaignNode(admin, input.campaignId, recipientNodeId)
    if (!recipient) return { ok: false, error: 'Получатель изделия не найден' }
  }

  const nowIso = new Date().toISOString()
  // Group the act's financial rows so they read as one batch in the ledger.
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
  const comment = `Крафт: ${outputName}`

  const rows: Record<string, unknown>[] = []

  // --- Gate 6 + expense row: the общак pays the working cost. Break the
  //     coins the stash actually holds and verify coverage — same non-silent
  //     stance as runExpedition. Skipped entirely at 0 (mig 034 forbids a
  //     zero-amount money row). ---
  if (workCostGp > 0) {
    const stashWallet = await getWallet(stash.nodeId, input.loopNumber)
    const spendCoins = resolveSpend(stashWallet.coins, workCostGp)
    const covered = Math.abs(aggregateGp(spendCoins))
    if (covered + 1e-9 < workCostGp) {
      const have = aggregateGp(stashWallet.coins)
      return {
        ok: false,
        error:
          have + 1e-9 < workCostGp
            ? `В общаке недостаточно золота на крафт — нужно ${workCostGp} зм, есть ${Math.round(have * 100) / 100} зм`
            : 'В общаке недостаточно монет на крафт без размена',
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

  // Изделие: item row credited to the recipient (общак by default).
  rows.push({
    ...approvedBase,
    actor_pc_id: recipientNodeId ?? stash.nodeId,
    kind: 'item',
    amount_cp: 0,
    amount_sp: 0,
    amount_gp: 0,
    amount_pp: 0,
    item_name: outputName,
    item_node_id: outputNodeId,
    item_qty: 1,
    category_slug: 'loot',
    comment,
    session_id: null,
  })

  // --- Write the financial rows (one multi-row insert = one statement) ---
  const { error: txErr } = await admin.from('transactions').insert(rows)
  if (txErr) {
    return { ok: false, error: `Не удалось записать движения: ${txErr.message}` }
  }

  // --- Record the run ---
  const { data: runRow, error: runErr } = await admin
    .from('craft_runs')
    .insert({
      campaign_id: input.campaignId,
      schema_item_node_id: schemaNode.id,
      loop_number: input.loopNumber,
      day_in_loop: input.dayInLoop,
      start_minute: startCheck.value,
      participants,
      invested_gp: workCostGp,
      output_item_node_id: outputNodeId,
      output_item_name: outputName,
      recipient_node_id: recipientNodeId,
      created_by: userId,
    })
    .select('id')
    .single()
  if (runErr) {
    // The financial rows already landed but the run log didn't. Unlike the
    // expedition flow (which surfaces and lets the DM reconcile), a craft
    // retry would double-charge the общак — so compensate: delete the just
    // written rows by their transfer_group_id (they are ours alone; the id
    // was minted above). If even the compensation fails, fall back to the
    // reconcile-by-hand message.
    const { error: undoErr } = await admin
      .from('transactions')
      .delete()
      .eq('transfer_group_id', groupId)
    return {
      ok: false,
      error: undoErr
        ? `Движения записаны, но лог крафта не сохранён: ${runErr.message}. Откат не удался (${undoErr.message}) — сверьте ленту вручную.`
        : `Не удалось сохранить крафт: ${runErr.message}. Движения отменены — попробуйте ещё раз.`,
    }
  }

  // --- One 'craft' ledger event for the whole act (off the critical path,
  //     never throws — see notifyLedgerEvent). ---
  const event: LedgerEvent = {
    type: 'craft',
    campaignId: input.campaignId,
    authorUserId: userId,
    participants: participants.map((p) => ({ pcId: p.nodeId, hours: p.hours })),
    target: outputName,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    startMinute: startCheck.value ?? undefined,
    investedGp: workCostGp > 0 ? workCostGp : undefined,
    recipientPcId: recipientNodeId,
    mode: 'craft',
  }
  await notifyLedgerEvent(event)

  return { ok: true, runId: (runRow as { id: string }).id }
}
