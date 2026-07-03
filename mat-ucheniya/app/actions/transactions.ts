'use server'

/**
 * Transaction server actions — spec-010 (P1 subset: money + item).
 *
 * Transfer variants (createTransfer/updateTransfer/deleteTransfer) land
 * in phase 10 (T030). The actions here explicitly refuse to touch rows
 * where `kind = 'transfer'` so callers can't corrupt a pair by editing
 * a single leg through this module.
 *
 * Ownership model (mirrors plan → Server actions → "Ownership enforcement"):
 *   - owner/dm of the campaign can write any row.
 *   - player can create rows where they own the actor PC
 *     (`node_pc_owners`).
 *   - player can edit/delete only rows they authored.
 *
 * All writes go through `createAdminClient()` after an explicit membership
 * check — RLS is the hard boundary but we prefer clean Russian errors to
 * generic 403s.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getMembership } from '@/lib/auth'
import {
  isAutoApproved,
  approvalsEnabledFromSettings,
} from '@/lib/approval-policy'
import { notifyLedgerEvent } from '@/lib/telegram/ledger-feed'
import { LOOP_CREDIT_GP } from '@/lib/ledger-constants'
import crypto from 'node:crypto'
import type { CoinSet } from '@/lib/transactions'
import {
  resolveSpend,
  resolveEarn,
  signedCoinsToStored,
  aggregateGp,
  computeShortfall,
  DENOMINATIONS,
} from '@/lib/transaction-resolver'
import {
  validateAmountSign,
  validateDayInLoop,
  validateCoinSet,
  validateItemQty,
} from '@/lib/transaction-validation'
import { getItemById } from '@/lib/items'
import { getWallet } from '@/lib/transactions'
import { getStashNode } from '@/lib/stash'
import { parseItemDefaultPrices } from '@/lib/item-default-prices'
import {
  parseItemPurchasePolicy,
  normalizeRarity,
  resolveBuyUnitPriceGp,
  approvalRequiredFor,
} from '@/lib/item-purchase-policy'

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

// ============================================================================
// Input shapes
// ============================================================================

export type CreateTransactionInput = {
  campaignId: string
  actorPcId: string
  kind: 'money' | 'item'
  /** Signed gp-equivalent amount. Required for `kind='money'`. */
  amountGp?: number
  /** Explicit per-denom override — bypasses the resolver if present. */
  perDenomOverride?: CoinSet
  /** Required non-empty for `kind='item'`; forbidden otherwise. */
  itemName?: string
  /**
   * Spec-015. Optional Образец link for `kind='item'` calls. When set,
   * the server resolves the canonical title via `getItemById` and
   * stores it as the `item_name` snapshot (FR-014, overrides any
   * client-typed name). Forbidden for `kind='money'`. Free-text
   * submissions leave this undefined.
   */
  itemNodeId?: string
  /** Integer ≥ 1 for `kind='item'`; default 1. Ignored for `kind='money'`. */
  itemQty?: number
  categorySlug: string
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
  /**
   * Spec-014 batch grouping. When set, the row is tagged with this
   * batch_id (player-authored multi-row submissions). DM-direct calls
   * leave it undefined → null on the row.
   */
  batchId?: string
  /**
   * Spec-053. Post this write to the Telegram ledger feed. Opt-in per call:
   * direct user actions from the /tg surface set it; internal/compound callers
   * (submitBatch, stash wrappers, topups, bulk DM apply) leave it off and emit
   * their own aggregate event instead, so the feed never floods.
   */
  notify?: boolean
  /** Spec-044: Telegram Mini App minted JWT (auth adapter, PL-1). */
}

export type UpdateTransactionInput = Partial<
  Omit<CreateTransactionInput, 'campaignId' | 'actorPcId'>
>

// ============================================================================
// Internal: role + ownership resolution
// ============================================================================

type AuthContext =
  | { ok: true; userId: string; role: 'owner' | 'dm' | 'player' }
  | { ok: false; error: string }

async function resolveAuth(campaignId: string): Promise<AuthContext> {
  // One auth path for everyone. Desktop and the Telegram Mini App both carry a
  // real GoTrue cookie session — the Mini App establishes one at login via
  // /api/tg/auth — so server actions authorise identically here.
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  return { ok: true, userId: user.id, role: membership.role }
}

/**
 * Campaign approval kill-switch (spec-053). Reads `campaigns.settings`
 * once per write; defaults to OFF when unset (see
 * `approvalsEnabledFromSettings`). Off → every write auto-approves.
 */
async function loadApprovalsEnabled(campaignId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('campaigns')
    .select('settings')
    .eq('id', campaignId)
    .maybeSingle()
  return approvalsEnabledFromSettings(
    (data as { settings?: unknown } | null)?.settings,
  )
}

/**
 * True when `userId` is listed in `node_pc_owners` for the given PC.
 * Used to gate player-initiated creates against PCs they don't own.
 */
async function isPcOwner(pcId: string, userId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('node_pc_owners')
    .select('user_id')
    .eq('node_id', pcId)
    .eq('user_id', userId)
    .maybeSingle()
  return data !== null
}

// ============================================================================
// Internal: coin resolution
// ============================================================================

/**
 * Turn `(amountGp, perDenomOverride?)` into the CoinSet we store on the row.
 * Sign convention: negative `amountGp` → outflow (spend), positive → inflow
 * (earn). `perDenomOverride` wins if present — caller has already decided
 * per-denom distribution.
 */
async function resolveCoinsForMoney(
  actorPcId: string,
  loopNumber: number,
  amountGp: number,
  perDenomOverride: CoinSet | undefined,
): Promise<CoinSet> {
  if (perDenomOverride) return perDenomOverride

  if (amountGp < 0) {
    // Spend: load wallet, let resolver pick the coins.
    const wallet = await getWallet(actorPcId, loopNumber)
    return resolveSpend(wallet.coins, -amountGp)
  }

  // Earn: credit to gp pile. signedCoinsToStored is identity when negate=false.
  return signedCoinsToStored(false, resolveEarn(amountGp))
}

/**
 * Resolve a spend AND verify it fully covers `absGp` — one wallet fetch.
 *
 * `resolveSpend` deliberately returns a *partial* set when holdings fall short
 * (it's a pure helper; the caller owns "insufficient funds"). Before spec-030
 * only a fully-zero result was rejected, so a spend of 10 gp against a 3 gp
 * wallet silently moved 3 gp — real money leaving without the user asking.
 * This guards it, mirroring the item path's `owned < qty`. Two failure modes,
 * distinct messages: not enough total vs. enough total but can't make change
 * (e.g. one platinum, spend 3 gp — resolveSpend won't break the coin).
 */
async function resolveAndCheckSpend(
  actorPcId: string,
  loopNumber: number,
  absGp: number,
): Promise<{ ok: true; coins: CoinSet } | { ok: false; error: string }> {
  const wallet = await getWallet(actorPcId, loopNumber)
  const coins = resolveSpend(wallet.coins, absGp)
  const covered = Math.abs(aggregateGp(coins))
  if (covered + 1e-9 >= absGp) return { ok: true, coins }
  const have = aggregateGp(wallet.coins)
  return {
    ok: false,
    error:
      have + 1e-9 < absGp
        ? `Недостаточно монет — доступно ${Math.round(have * 100) / 100} зм`
        : 'Недостаточно монет для операции без размена',
  }
}

// ============================================================================
// createTransaction
// ============================================================================

export async function createTransaction(
  input: CreateTransactionInput,
): Promise<ActionResult<{ id: string }>> {
  // --- Basic shape validation ---
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.actorPcId) return { ok: false, error: 'Не выбран персонаж' }
  if (!input.categorySlug) return { ok: false, error: 'Не выбрана категория' }
  if (input.kind !== 'money' && input.kind !== 'item') {
    return { ok: false, error: 'Недопустимый тип транзакции' }
  }

  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  // --- Kind-specific validation ---
  let coins: CoinSet = { cp: 0, sp: 0, gp: 0, pp: 0 }
  let itemName: string | null = null

  if (input.kind === 'money') {
    if (input.perDenomOverride) {
      const coinErr = validateCoinSet(input.perDenomOverride)
      if (coinErr) return { ok: false, error: coinErr }
      coins = input.perDenomOverride
    } else {
      const amountErr = validateAmountSign(input.amountGp)
      if (amountErr) return { ok: false, error: amountErr }
      if (input.amountGp! < 0) {
        // Spend: resolve + verify it fully covers the amount (guards a silent
        // partial spend — see resolveAndCheckSpend).
        const res = await resolveAndCheckSpend(
          input.actorPcId,
          input.loopNumber,
          Math.abs(input.amountGp!),
        )
        if (!res.ok) return { ok: false, error: res.error }
        coins = res.coins
      } else {
        // Earn: credit to the gp pile, no coverage check.
        coins = await resolveCoinsForMoney(
          input.actorPcId,
          input.loopNumber,
          input.amountGp!,
          undefined,
        )
      }
    }
  } else {
    // kind === 'item'
    if (!input.itemName || input.itemName.trim() === '') {
      return { ok: false, error: 'Укажите название предмета' }
    }
    itemName = input.itemName.trim()
    // Spec-015: when an Образец is linked, the server resolves the
    // canonical title and stores it as the snapshot (FR-014). The
    // client-typed name is ignored — the typeahead pick is the truth.
    if (input.itemNodeId) {
      const item = await getItemById(input.campaignId, input.itemNodeId)
      if (!item) {
        return { ok: false, error: 'Связанный образец не найден в этой кампании' }
      }
      itemName = item.title
    }
    // coins stays all-zero; DB CHECK enforces this.
  }

  // --- Item qty (applies to item kind; money rows store default 1) ---
  const itemQty = input.kind === 'item' ? input.itemQty ?? 1 : 1
  if (input.kind === 'item') {
    const qtyErr = validateItemQty(itemQty)
    if (qtyErr) return { ok: false, error: qtyErr }
  }

  // --- Authorisation ---
  const auth = await resolveAuth(input.campaignId)
  if (!auth.ok) return auth

  if (auth.role === 'player') {
    const owned = await isPcOwner(input.actorPcId, auth.userId)
    if (!owned) {
      return { ok: false, error: 'Вы не можете создавать транзакции за чужого персонажа' }
    }
  }

  // --- Write ---
  const admin = createAdminClient()
  // Spec-014: player → pending; DM/owner → approved. createTransaction has no
  // free-общак path — only the stash transfer wrappers set autoApprove.
  // Spec-053: the campaign kill-switch forces approved when off.
  const approved = isAutoApproved(
    auth.role,
    false,
    await loadApprovalsEnabled(input.campaignId),
  )
  const status = approved ? 'approved' : 'pending'
  const nowIso = new Date().toISOString()
  // Pending player submissions get a batch_id (batch of 1) so they appear in
  // the queue; approved ones leave it null.
  const batchId = input.batchId ?? (approved ? null : crypto.randomUUID())
  const { data, error } = await admin
    .from('transactions')
    .insert({
      campaign_id: input.campaignId,
      actor_pc_id: input.actorPcId,
      kind: input.kind,
      amount_cp: coins.cp,
      amount_sp: coins.sp,
      amount_gp: coins.gp,
      amount_pp: coins.pp,
      item_name: itemName,
      item_node_id: input.kind === 'item' ? input.itemNodeId ?? null : null,
      item_qty: itemQty,
      category_slug: input.categorySlug,
      comment: input.comment,
      loop_number: input.loopNumber,
      day_in_loop: input.dayInLoop,
      session_id: input.sessionId ?? null,
      transfer_group_id: null,
      status,
      author_user_id: auth.userId,
      batch_id: batchId,
      approved_by_user_id: status === 'approved' ? auth.userId : null,
      approved_at: status === 'approved' ? nowIso : null,
    })
    .select('id')
    .single()

  if (error) {
    return { ok: false, error: `Не удалось сохранить: ${error.message}` }
  }

  if (input.notify) {
    // money → доход / расход by sign; item → добыча. See ledger-feed templates.
    if (input.kind === 'item') {
      await notifyLedgerEvent({
        type: 'loot',
        campaignId: input.campaignId,
        actorPcId: input.actorPcId,
        authorUserId: auth.userId,
        item: { name: itemName ?? '—', qty: itemQty },
      })
    } else {
      // Prefer the caller's gp; fall back to the stored coins so a
      // perDenomOverride write is still classified/valued correctly.
      const gp = input.amountGp ?? aggregateGp(coins)
      await notifyLedgerEvent({
        type: gp < 0 ? 'expense' : 'income',
        campaignId: input.campaignId,
        actorPcId: input.actorPcId,
        authorUserId: auth.userId,
        amountGp: gp,
        comment: input.comment || undefined,
      })
    }
  }

  return { ok: true, id: (data as { id: string }).id }
}

// ============================================================================
// takeLoopCredit (feedback #4) — player self-grants a fixed loop credit
// ============================================================================

/**
 * Grant the PC the fixed loop credit (LOOP_CREDIT_GP) as an approved money row —
 * no DM approval, but only once per loop. Server-controlled end to end: the
 * client picks nothing but which PC, so the amount and the once-per-loop rule
 * can't be tampered with. The guard SELECT covers normal use (and disables the
 * button); a concurrent double-tap that races past it is caught hard by the
 * partial unique index `uniq_loop_credit` (mig 123) — the second insert fails
 * with 23505 and we surface it as the same friendly "already taken".
 */
export async function takeLoopCredit(
  campaignId: string,
  pcId: string,
  loopNumber: number,
): Promise<ActionResult<{ id: string }>> {
  if (!campaignId || !pcId) return { ok: false, error: 'Не выбран персонаж' }

  const auth = await resolveAuth(campaignId)
  if (!auth.ok) return auth
  if (auth.role === 'player') {
    const owned = await isPcOwner(pcId, auth.userId)
    if (!owned) return { ok: false, error: 'Нельзя взять кредит за чужого персонажа' }
  }

  const admin = createAdminClient()

  // Once per loop.
  const { data: existing } = await admin
    .from('transactions')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('actor_pc_id', pcId)
    .eq('loop_number', loopNumber)
    .eq('category_slug', 'credit')
    .limit(1)
    .maybeSingle()
  if (existing) return { ok: false, error: 'Кредит за эту петлю уже взят' }

  const coins = signedCoinsToStored(false, resolveEarn(LOOP_CREDIT_GP))
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from('transactions')
    .insert({
      campaign_id: campaignId,
      actor_pc_id: pcId,
      kind: 'money',
      amount_cp: coins.cp,
      amount_sp: coins.sp,
      amount_gp: coins.gp,
      amount_pp: coins.pp,
      item_name: null,
      item_node_id: null,
      item_qty: 1,
      category_slug: 'credit',
      comment: `Кредит петли ${loopNumber}`,
      loop_number: loopNumber,
      day_in_loop: 1,
      session_id: null,
      transfer_group_id: null,
      status: 'approved',
      author_user_id: auth.userId,
      batch_id: null,
      approved_by_user_id: auth.userId,
      approved_at: nowIso,
    })
    .select('id')
    .single()

  if (error) {
    // Concurrent double-tap raced past the guard SELECT → the partial unique
    // index (mig 123) rejects the second insert. Same friendly message.
    if ((error as { code?: string }).code === '23505') {
      return { ok: false, error: 'Кредит за эту петлю уже взят' }
    }
    return { ok: false, error: `Не удалось взять кредит: ${error.message}` }
  }
  await notifyLedgerEvent({
    type: 'income',
    campaignId,
    actorPcId: pcId,
    authorUserId: auth.userId,
    amountGp: LOOP_CREDIT_GP,
    comment: `кредит петли ${loopNumber}`,
  })
  return { ok: true, id: (data as { id: string }).id }
}

// ============================================================================
// updateTransaction
// ============================================================================

export async function updateTransaction(
  id: string,
  input: UpdateTransactionInput,
): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'Не указан id транзакции' }

  const admin = createAdminClient()

  // Load the existing row to know its campaign + author + kind.
  const { data: existing, error: loadErr } = await admin
    .from('transactions')
    .select(
      'id, campaign_id, actor_pc_id, kind, author_user_id, loop_number, transfer_group_id, status',
    )
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  if (!existing) return { ok: false, error: 'Транзакция не найдена' }

  const row = existing as {
    id: string
    campaign_id: string
    actor_pc_id: string | null
    kind: 'money' | 'item' | 'transfer'
    author_user_id: string | null
    loop_number: number
    transfer_group_id: string | null
    status: 'pending' | 'approved' | 'rejected'
  }

  if (row.kind === 'transfer') {
    return { ok: false, error: 'Редактирование переводов — через updateTransfer' }
  }

  const auth = await resolveAuth(row.campaign_id)
  if (!auth.ok) return auth

  if (auth.role === 'player' && row.author_user_id !== auth.userId) {
    return { ok: false, error: 'Можно редактировать только собственные транзакции' }
  }

  // Spec-014: player can edit only their pending rows. DM/owner unrestricted.
  if (auth.role === 'player' && row.status !== 'pending') {
    return { ok: false, error: 'Можно править только pending-заявки' }
  }

  // Build the patch. Ignore attempts to switch kind to 'transfer' or change
  // structural fields that would need special-case handling.
  const patch: Record<string, unknown> = {}

  if (input.kind && input.kind !== row.kind) {
    // kind switch money ↔ item is supported; transfer is not.
    if (input.kind !== 'money' && input.kind !== 'item') {
      return { ok: false, error: 'Недопустимый тип транзакции' }
    }
    patch.kind = input.kind
  }
  const newKind = (patch.kind as 'money' | 'item' | undefined) ?? row.kind

  if (input.dayInLoop !== undefined) {
    const dayErr = validateDayInLoop(input.dayInLoop, 365)
    if (dayErr) return { ok: false, error: dayErr }
    patch.day_in_loop = input.dayInLoop
  }
  if (input.loopNumber !== undefined) patch.loop_number = input.loopNumber
  if (input.sessionId !== undefined) patch.session_id = input.sessionId
  if (input.categorySlug !== undefined) patch.category_slug = input.categorySlug
  if (input.comment !== undefined) patch.comment = input.comment

  // Kind-specific amount / item handling.
  if (newKind === 'item') {
    if (input.itemName !== undefined) {
      if (!input.itemName || input.itemName.trim() === '') {
        return { ok: false, error: 'Укажите название предмета' }
      }
      patch.item_name = input.itemName.trim()
    }
    // Spec-015: itemNodeId can be added, changed, or removed (set null
    // explicitly via the input). Resolving the title overwrites whatever
    // patch.item_name held.
    if (input.itemNodeId !== undefined) {
      if (input.itemNodeId === '' || input.itemNodeId === null) {
        // Explicit unlink — keep current item_name as the free-text
        // fallback, drop the FK.
        patch.item_node_id = null
      } else {
        const item = await getItemById(row.campaign_id, input.itemNodeId)
        if (!item) {
          return { ok: false, error: 'Связанный образец не найден в этой кампании' }
        }
        patch.item_node_id = input.itemNodeId
        patch.item_name = item.title
      }
    }
    if (input.itemQty !== undefined) {
      const qtyErr = validateItemQty(input.itemQty)
      if (qtyErr) return { ok: false, error: qtyErr }
      patch.item_qty = input.itemQty
    }
    // When switching money → item, zero amounts and enforce item_name presence.
    if (patch.kind === 'item') {
      patch.amount_cp = 0
      patch.amount_sp = 0
      patch.amount_gp = 0
      patch.amount_pp = 0
      if (input.itemName === undefined) {
        return {
          ok: false,
          error: 'При смене типа на «предмет» укажите его название',
        }
      }
      // Ensure item_qty is set when switching in, default 1 if absent.
      if (patch.item_qty === undefined) {
        patch.item_qty = input.itemQty ?? 1
      }
    }
  } else {
    // newKind === 'money'
    if (
      input.amountGp !== undefined ||
      input.perDenomOverride !== undefined ||
      patch.kind === 'money' // switching item → money
    ) {
      let coins: CoinSet
      if (input.perDenomOverride) {
        const coinErr = validateCoinSet(input.perDenomOverride)
        if (coinErr) return { ok: false, error: coinErr }
        coins = input.perDenomOverride
      } else {
        const amountErr = validateAmountSign(input.amountGp)
        if (amountErr) return { ok: false, error: amountErr }
        const actorId = row.actor_pc_id
        if (!actorId) {
          return { ok: false, error: 'Не удалось определить кошелёк персонажа' }
        }
        coins = await resolveCoinsForMoney(
          actorId,
          (patch.loop_number as number | undefined) ?? row.loop_number,
          input.amountGp!,
          undefined,
        )
        const anyNonZero = DENOMINATIONS.some((d) => coins[d] !== 0)
        if (!anyNonZero) {
          return {
            ok: false,
            error: 'Недостаточно монет для операции без размена',
          }
        }
      }
      patch.amount_cp = coins.cp
      patch.amount_sp = coins.sp
      patch.amount_gp = coins.gp
      patch.amount_pp = coins.pp
      patch.item_name = null
      patch.item_node_id = null  // spec-015: switching to money clears the item link
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: true } // no-op update
  }

  const { error: updateErr } = await admin
    .from('transactions')
    .update(patch)
    .eq('id', id)

  if (updateErr) {
    return { ok: false, error: `Не удалось обновить: ${updateErr.message}` }
  }

  // Transfer-pair atomicity for item legs: when editing one leg of a
  // paired item transfer (both legs share `transfer_group_id`), mirror
  // item_name + item_qty to the sibling. Qty mirrors by sign — if this
  // leg's new qty is +N the sibling becomes -N (Phase 5 convention,
  // mig 036). Untouched if the row has no transfer_group_id.
  if (
    row.kind === 'item' &&
    row.transfer_group_id &&
    (patch.item_name !== undefined || patch.item_qty !== undefined)
  ) {
    const siblingPatch: Record<string, unknown> = {}
    if (patch.item_name !== undefined) siblingPatch.item_name = patch.item_name
    if (patch.item_qty !== undefined) {
      siblingPatch.item_qty = -Number(patch.item_qty)
    }

    const { error: siblingErr } = await admin
      .from('transactions')
      .update(siblingPatch)
      .eq('transfer_group_id', row.transfer_group_id)
      .neq('id', id)

    if (siblingErr) {
      // The primary update already landed; surface the sibling failure
      // so the caller can retry — but don't roll back. Same last-write-
      // wins stance as `updateTransfer`.
      return {
        ok: false,
        error: `Основная нога обновлена, но парная упала: ${siblingErr.message}`,
      }
    }
  }

  return { ok: true }
}

// ============================================================================
// deleteTransaction
// ============================================================================

export async function deleteTransaction(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: 'Не указан id транзакции' }

  const admin = createAdminClient()

  const { data: existing, error: loadErr } = await admin
    .from('transactions')
    .select('id, campaign_id, kind, author_user_id, status')
    .eq('id', id)
    .maybeSingle()

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  if (!existing) return { ok: false, error: 'Транзакция не найдена' }

  const row = existing as {
    id: string
    campaign_id: string
    kind: 'money' | 'item' | 'transfer'
    author_user_id: string | null
    status: 'pending' | 'approved' | 'rejected'
  }

  if (row.kind === 'transfer') {
    return { ok: false, error: 'Удаление переводов — через deleteTransfer' }
  }

  const auth = await resolveAuth(row.campaign_id)
  if (!auth.ok) return auth

  if (auth.role === 'player' && row.author_user_id !== auth.userId) {
    return { ok: false, error: 'Можно удалять только собственные транзакции' }
  }

  // Spec-014: player can delete only their pending rows. DM/owner unrestricted.
  if (auth.role === 'player' && row.status !== 'pending') {
    return { ok: false, error: 'Можно удалять только pending-заявки' }
  }

  const { error: delErr } = await admin.from('transactions').delete().eq('id', id)
  if (delErr) {
    return { ok: false, error: `Не удалось удалить: ${delErr.message}` }
  }

  return { ok: true }
}

// ============================================================================
// loadLedgerPage — thin server action wrapper around getLedgerPage for the
// client "load more" button. Membership-gated.
// ============================================================================

import { getLedgerPage, type LedgerFilters, type LedgerPage } from '@/lib/transactions'

export async function loadLedgerPage(
  campaignId: string,
  filters: LedgerFilters,
  cursor: string | null,
  pageSize: number,
): Promise<ActionResult<{ page: LedgerPage }>> {
  if (!campaignId) return { ok: false, error: 'Не указана кампания' }

  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  try {
    const page = await getLedgerPage(campaignId, filters, cursor, pageSize)
    return { ok: true, page }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
    return { ok: false, error: message }
  }
}

// ============================================================================
// Transfers (spec-010 phase 10 / US5)
// ============================================================================
//
// A transfer is stored as two linked rows sharing `transfer_group_id`:
//   leg A — sender outflow (negative coins, actor = senderPcId)
//   leg B — recipient inflow (positive coins, actor = recipientPcId)
//
// Write model:
//   - Both legs inserted in one multi-row `.insert([a, b])` call. Postgres
//     treats that as a single statement; partial failure rolls both back.
//   - `updateTransfer` fetches both legs by group id and issues one UPDATE
//     per leg. Two statements, last-write-wins on concurrent edits —
//     matches the project convention for non-encounter rows.
//   - `deleteTransfer` uses a single DELETE `where transfer_group_id = $1`.
//
// Authorization:
//   - owner/dm can operate on any transfer.
//   - player can initiate a transfer if they own the sender PC; they are
//     recorded as the author on both legs. The recipient-side owner has
//     no special rights to edit their "copy" via this action — ownership
//     stays on the authoring identity (symmetric with any other row).

import type { TransferInput } from '@/lib/transactions'
import { validateTransfer, validateItemTransfer } from '@/lib/transaction-validation'
import { getTransferPair } from '@/lib/transactions'

export async function createTransfer(
  input: TransferInput,
): Promise<ActionResult<{ groupId: string }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.senderPcId) return { ok: false, error: 'Не выбран отправитель' }
  if (!input.recipientPcId) return { ok: false, error: 'Не выбран получатель' }
  if (!input.categorySlug) return { ok: false, error: 'Не выбрана категория' }

  // Transfers are same-loop by invariant. `validateTransfer` enforces
  // self ≠ recipient + same-loop; we pass loopNumber for both sides
  // because the UI does not currently support per-leg loop selection.
  const txErr = validateTransfer(
    input.senderPcId,
    input.recipientPcId,
    input.loopNumber,
    input.loopNumber,
  )
  if (txErr) return { ok: false, error: txErr }

  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  // Amount: UI provides a positive gp value; we apply sign ourselves so
  // it is unambiguous on the stored rows.
  let senderCoins: CoinSet
  if (input.perDenomOverride) {
    const coinErr = validateCoinSet(input.perDenomOverride)
    if (coinErr) return { ok: false, error: coinErr }
    // Ensure the override is outflow — flip sign if a caller passes positive.
    const needsFlip = DENOMINATIONS.every((d) => (input.perDenomOverride![d] ?? 0) >= 0)
    senderCoins = needsFlip
      ? signedCoinsToStored(true, input.perDenomOverride)
      : input.perDenomOverride
  } else {
    const amountErr = validateAmountSign(input.amountGp)
    if (amountErr) return { ok: false, error: amountErr }
    const absAmount = Math.abs(input.amountGp)
    // Verify the sender can cover the full transfer. A partial would silently
    // move less than asked — общак-take of 10 gp from a 3 gp pool moved 3 with
    // no warning (items were already guarded by `owned < qty`; money wasn't).
    const res = await resolveAndCheckSpend(
      input.senderPcId,
      input.loopNumber,
      absAmount,
    )
    if (!res.ok) return { ok: false, error: res.error }
    senderCoins = res.coins
  }

  // Mirror recipient inflow — same magnitude, opposite sign.
  const recipientCoins: CoinSet = signedCoinsToStored(true, senderCoins)

  const auth = await resolveAuth(input.campaignId)
  if (!auth.ok) return auth

  if (auth.role === 'player') {
    const ownsSender = await isPcOwner(input.senderPcId, auth.userId)
    if (!ownsSender) {
      return {
        ok: false,
        error: 'Перевод может начать только владелец персонажа-отправителя',
      }
    }
  }

  const admin = createAdminClient()
  const groupId = crypto.randomUUID()
  // Spec-014: player → pending; DM/owner → approved. Spec-044/C-05: free общак
  // (autoApprove set by the stash wrappers) approves a player op too.
  // Spec-053: the campaign kill-switch forces approved when off.
  const approved = isAutoApproved(
    auth.role,
    input.autoApprove,
    await loadApprovalsEnabled(input.campaignId),
  )
  const status = approved ? 'approved' : 'pending'
  const nowIso = new Date().toISOString()
  // A queued (pending) player submission needs a batch_id for the queue;
  // an approved one (DM, or free общак) leaves it null.
  const batchId = input.batchId ?? (approved ? null : crypto.randomUUID())

  const baseRow = {
    campaign_id: input.campaignId,
    kind: 'transfer' as const,
    item_name: null,
    category_slug: input.categorySlug,
    comment: input.comment,
    loop_number: input.loopNumber,
    day_in_loop: input.dayInLoop,
    session_id: input.sessionId ?? null,
    transfer_group_id: groupId,
    status,
    author_user_id: auth.userId,
    batch_id: batchId,
    approved_by_user_id: status === 'approved' ? auth.userId : null,
    approved_at: status === 'approved' ? nowIso : null,
  }

  const { error } = await admin.from('transactions').insert([
    {
      ...baseRow,
      actor_pc_id: input.senderPcId,
      amount_cp: senderCoins.cp,
      amount_sp: senderCoins.sp,
      amount_gp: senderCoins.gp,
      amount_pp: senderCoins.pp,
    },
    {
      ...baseRow,
      actor_pc_id: input.recipientPcId,
      amount_cp: recipientCoins.cp,
      amount_sp: recipientCoins.sp,
      amount_gp: recipientCoins.gp,
      amount_pp: recipientCoins.pp,
    },
  ])

  if (error) {
    return { ok: false, error: `Не удалось сохранить: ${error.message}` }
  }

  if (input.notify) {
    await notifyLedgerEvent({
      type: 'transfer',
      campaignId: input.campaignId,
      senderPcId: input.senderPcId,
      recipientPcId: input.recipientPcId,
      authorUserId: auth.userId,
      moneyGp: Math.abs(input.amountGp ?? aggregateGp(senderCoins)),
    })
  }

  return { ok: true, groupId }
}

export async function updateTransfer(
  groupId: string,
  input: Partial<TransferInput>,
): Promise<ActionResult> {
  if (!groupId) return { ok: false, error: 'Не указан перевод' }

  const pair = await getTransferPair(groupId)
  if (!pair) return { ok: false, error: 'Перевод не найден или повреждён' }
  const [legA, legB] = pair

  const auth = await resolveAuth(legA.campaign_id)
  if (!auth.ok) return auth
  if (auth.role === 'player' && legA.author_user_id !== auth.userId) {
    return { ok: false, error: 'Можно редактировать только собственные переводы' }
  }

  const admin = createAdminClient()

  // Shared fields applied to both legs. Amount changes require
  // recomputing sender outflow + recipient mirror.
  const sharedPatch: Record<string, unknown> = {}
  if (input.categorySlug !== undefined) sharedPatch.category_slug = input.categorySlug
  if (input.comment !== undefined) sharedPatch.comment = input.comment
  if (input.loopNumber !== undefined) sharedPatch.loop_number = input.loopNumber
  if (input.dayInLoop !== undefined) {
    const dayErr = validateDayInLoop(input.dayInLoop, 365)
    if (dayErr) return { ok: false, error: dayErr }
    sharedPatch.day_in_loop = input.dayInLoop
  }
  if (input.sessionId !== undefined) sharedPatch.session_id = input.sessionId

  let senderCoins: CoinSet | null = null
  if (input.perDenomOverride) {
    const coinErr = validateCoinSet(input.perDenomOverride)
    if (coinErr) return { ok: false, error: coinErr }
    const needsFlip = DENOMINATIONS.every((d) => (input.perDenomOverride![d] ?? 0) >= 0)
    senderCoins = needsFlip
      ? signedCoinsToStored(true, input.perDenomOverride)
      : input.perDenomOverride
  } else if (input.amountGp !== undefined) {
    const amountErr = validateAmountSign(input.amountGp)
    if (amountErr) return { ok: false, error: amountErr }
    const absAmount = Math.abs(input.amountGp)
    const sender = legA.actor_pc_id
    if (!sender) return { ok: false, error: 'Отправитель неизвестен' }
    senderCoins = await resolveCoinsForMoney(
      sender,
      (sharedPatch.loop_number as number | undefined) ?? legA.loop_number,
      -absAmount,
      undefined,
    )
    const anyNonZero = DENOMINATIONS.some((d) => senderCoins![d] !== 0)
    if (!anyNonZero) {
      return {
        ok: false,
        error: 'Недостаточно монет для перевода без размена',
      }
    }
  }

  // Build per-leg patches.
  const legAPatch: Record<string, unknown> = { ...sharedPatch }
  const legBPatch: Record<string, unknown> = { ...sharedPatch }
  if (senderCoins) {
    legAPatch.amount_cp = senderCoins.cp
    legAPatch.amount_sp = senderCoins.sp
    legAPatch.amount_gp = senderCoins.gp
    legAPatch.amount_pp = senderCoins.pp
    const recipientCoins = signedCoinsToStored(true, senderCoins)
    legBPatch.amount_cp = recipientCoins.cp
    legBPatch.amount_sp = recipientCoins.sp
    legBPatch.amount_gp = recipientCoins.gp
    legBPatch.amount_pp = recipientCoins.pp
  }

  if (Object.keys(legAPatch).length === 0 && Object.keys(legBPatch).length === 0) {
    return { ok: true }
  }

  // Two UPDATEs — Postgres does not guarantee atomicity across them,
  // but on conflict we accept last-write-wins (project convention).
  const { error: errA } = await admin
    .from('transactions')
    .update(legAPatch)
    .eq('id', legA.id)
  if (errA) return { ok: false, error: `Не удалось обновить отправителя: ${errA.message}` }

  const { error: errB } = await admin
    .from('transactions')
    .update(legBPatch)
    .eq('id', legB.id)
  if (errB) return { ok: false, error: `Не удалось обновить получателя: ${errB.message}` }

  return { ok: true }
}

export async function deleteTransfer(groupId: string): Promise<ActionResult> {
  if (!groupId) return { ok: false, error: 'Не указан перевод' }

  const pair = await getTransferPair(groupId)
  if (!pair) return { ok: false, error: 'Перевод не найден' }
  const [legA] = pair

  const auth = await resolveAuth(legA.campaign_id)
  if (!auth.ok) return auth
  if (auth.role === 'player' && legA.author_user_id !== auth.userId) {
    return { ok: false, error: 'Можно удалять только собственные переводы' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('transactions')
    .delete()
    .eq('transfer_group_id', groupId)

  if (error) {
    return { ok: false, error: `Не удалось удалить: ${error.message}` }
  }
  return { ok: true }
}

// ============================================================================
// createItemTransfer (spec-011, Phase 5)
// ============================================================================
//
// Item sibling of `createTransfer`. Two rows with `kind='item'`, shared
// `transfer_group_id`, same `item_name`. Sign encodes direction
// (mig 036):
//   - sender leg:    item_qty = -qty  (lost `qty` units)
//   - recipient leg: item_qty = +qty  (gained `qty` units)
//
// Coin amounts are all zero (same CHECK as spec-010 items). `transfer`
// category by default ("loot" is the usual fit for stash deposits;
// caller overrides via `categorySlug`).

export type ItemTransferInput = {
  campaignId: string
  senderPcId: string
  recipientPcId: string
  itemName: string
  /**
   * Spec-015. Optional Образец link applied to BOTH legs (sender + recipient).
   * When set, server resolves canonical title → snapshot. Both legs share the
   * link so inventory aggregates at sender and recipient agree.
   */
  itemNodeId?: string
  /** Positive integer. Direction is encoded by the writer, not the caller. */
  qty: number
  categorySlug: string
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
  /** Spec-014: batch_id shared across both legs (FR-004). */
  batchId?: string
  /** Spec-044: Telegram Mini App minted JWT (auth adapter, PL-1). */
  /** Spec-044 / C-05: bypass the player approval gate (free общак, items). */
  autoApprove?: boolean
  /** Spec-053: post to the ledger feed (opt-in; stash wrappers leave off). */
  notify?: boolean
}

export async function createItemTransfer(
  input: ItemTransferInput,
): Promise<ActionResult<{ groupId: string }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.senderPcId) return { ok: false, error: 'Не выбран отправитель' }
  if (!input.recipientPcId) return { ok: false, error: 'Не выбран получатель' }
  if (!input.categorySlug) return { ok: false, error: 'Не выбрана категория' }

  // Self-transfer / cross-loop rejection (same-loop enforced by
  // passing `loopNumber` for both sides).
  const txErr = validateTransfer(
    input.senderPcId,
    input.recipientPcId,
    input.loopNumber,
    input.loopNumber,
  )
  if (txErr) return { ok: false, error: txErr }

  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  const itemErr = validateItemTransfer({
    itemName: input.itemName,
    qty: input.qty,
  })
  if (itemErr) return { ok: false, error: itemErr }

  const auth = await resolveAuth(input.campaignId)
  if (!auth.ok) return auth

  if (auth.role === 'player') {
    const ownsSender = await isPcOwner(input.senderPcId, auth.userId)
    if (!ownsSender) {
      return {
        ok: false,
        error: 'Перевод предмета может начать только владелец персонажа-отправителя',
      }
    }
  }

  const admin = createAdminClient()
  const groupId = crypto.randomUUID()
  let itemName = input.itemName.trim()
  let itemNodeId: string | null = null

  // Spec-015: when an Образец is linked, server resolves the canonical
  // title and stores it as the snapshot on both legs (FR-014). Ownership
  // check below uses item_node_id (more reliable than item_name) when
  // a link is present.
  if (input.itemNodeId) {
    const item = await getItemById(input.campaignId, input.itemNodeId)
    if (!item) {
      return { ok: false, error: 'Связанный образец не найден в этой кампании' }
    }
    itemName = item.title
    itemNodeId = input.itemNodeId
  }

  // Ownership check — sender must actually own ≥ qty of this item in
  // the current loop. Without this gate, "Положить в общак" (or any
  // item transfer) can conjure items the sender never had — leaving a
  // negative balance no UI surfaces. We aggregate `item_qty` across
  // all approved `kind='item'` rows for this (actor, item, loop) and
  // require the net to be ≥ requested qty.
  //
  // Balances wipe per loop (FR-015), so the scope is the current loop
  // only. Match precedence (spec-015): item_node_id when present (any
  // historical name aliases dedupe correctly). Without a node_id — the /tg
  // transfer picks items by name only — match `item_name` across ALL legs
  // (spec-053 fix). A catalog buy stores the item leg WITH a node_id, so the
  // old `item_node_id IS NULL` filter counted 0 and blocked transferring a
  // bought item, even though the picker (getPcItemHoldingsTg, by name) showed
  // it. Matching by name here mirrors that by-name holdings view.
  const ownerQuery = admin
    .from('transactions')
    .select('item_qty')
    .eq('campaign_id', input.campaignId)
    .eq('actor_pc_id', input.senderPcId)
    .eq('kind', 'item')
    .eq('loop_number', input.loopNumber)
    .eq('status', 'approved')

  const { data: senderLegs, error: ownErr } = await (itemNodeId
    ? ownerQuery.eq('item_node_id', itemNodeId)
    : ownerQuery.eq('item_name', itemName))

  if (ownErr) {
    return { ok: false, error: `Ошибка проверки инвентаря: ${ownErr.message}` }
  }

  const owned = ((senderLegs ?? []) as { item_qty: number }[]).reduce(
    (s, r) => s + (r.item_qty ?? 0),
    0,
  )
  if (owned < input.qty) {
    return {
      ok: false,
      error: `У персонажа недостаточно «${itemName}» — есть ${owned}, нужно ${input.qty}. Сначала запишите получение предмета отдельной транзакцией.`,
    }
  }

  // Spec-053: the campaign kill-switch forces approved when off.
  const approved = isAutoApproved(
    auth.role,
    input.autoApprove,
    await loadApprovalsEnabled(input.campaignId),
  )
  const nowIso = new Date().toISOString()
  const baseRow = {
    campaign_id: input.campaignId,
    kind: 'item' as const,
    amount_cp: 0,
    amount_sp: 0,
    amount_gp: 0,
    amount_pp: 0,
    item_name: itemName,
    item_node_id: itemNodeId,
    category_slug: input.categorySlug,
    comment: input.comment,
    loop_number: input.loopNumber,
    day_in_loop: input.dayInLoop,
    session_id: input.sessionId ?? null,
    transfer_group_id: groupId,
    status: (approved ? 'approved' : 'pending') as 'pending' | 'approved',
    author_user_id: auth.userId,
    // Spec-044/C-05: autoApprove (free общак) approves a player item op too;
    // a queued (pending) one gets a batch_id for the approval queue.
    batch_id: input.batchId ?? (approved ? null : crypto.randomUUID()),
    approved_by_user_id: approved ? auth.userId : null,
    approved_at: approved ? nowIso : null,
  }

  const { error } = await admin.from('transactions').insert([
    {
      ...baseRow,
      actor_pc_id: input.senderPcId,
      item_qty: -input.qty,
    },
    {
      ...baseRow,
      actor_pc_id: input.recipientPcId,
      item_qty: input.qty,
    },
  ])

  if (error) {
    return { ok: false, error: `Не удалось сохранить: ${error.message}` }
  }

  if (input.notify) {
    await notifyLedgerEvent({
      type: 'transfer',
      campaignId: input.campaignId,
      senderPcId: input.senderPcId,
      recipientPcId: input.recipientPcId,
      authorUserId: auth.userId,
      item: { name: itemName, qty: input.qty },
    })
  }

  return { ok: true, groupId }
}

// ============================================================================
// submitBatch (spec-014, Phase 3 / T012)
// ============================================================================
//
// Wrapper for player-authored multi-row submissions. Generates one
// `batchId`, dispatches each row to the per-kind action with the shared
// `batchId`. Returns the batchId + per-row ids for client refresh.
//
// Atomicity (FR-008): we don't have BEGIN/COMMIT exposed via the JS
// client, so we go sequentially and on the first failure attempt to
// roll back already-inserted rows by deleting them. This is best-effort
// — a network failure between insert and rollback can leave orphans.
// In practice the player-batch path is short (≤ 10 rows typically) and
// the failure cases are coarse (validation, RLS) which fail on the
// first row.

export type BatchRowSubmitInput =
  | {
      clientId: string
      kind: 'money'
      actorPcId: string
      amountGp?: number
      perDenomOverride?: CoinSet
      categorySlug: string
      comment: string
      loopNumber: number
      dayInLoop: number
      sessionId?: string | null
    }
  | {
      clientId: string
      kind: 'item'
      actorPcId: string
      itemName: string
      /** Spec-015 — optional Образец link. */
      itemNodeId?: string
      itemQty: number
      categorySlug: string
      comment: string
      loopNumber: number
      dayInLoop: number
      sessionId?: string | null
    }
  | {
      clientId: string
      kind: 'transfer-money'
      senderPcId: string
      recipientPcId: string
      amountGp: number
      perDenomOverride?: CoinSet
      categorySlug: string
      comment: string
      loopNumber: number
      dayInLoop: number
      sessionId?: string | null
    }
  | {
      clientId: string
      kind: 'transfer-item'
      senderPcId: string
      recipientPcId: string
      itemName: string
      /** Spec-015 — optional Образец link, applied to both legs. */
      itemNodeId?: string
      qty: number
      categorySlug: string
      comment: string
      loopNumber: number
      dayInLoop: number
      sessionId?: string | null
    }

export type SubmitBatchInput = {
  campaignId: string
  rows: BatchRowSubmitInput[]
  /** Spec-044: Telegram Mini App minted JWT (auth adapter, PL-1). */
}

export type SubmitBatchResult =
  | {
      ok: true
      batchId: string
      rowResults: Array<{ clientId: string; id?: string; groupId?: string }>
    }
  | {
      ok: false
      error: string
      /** clientId of the row that broke, if known. */
      failedClientId?: string
    }

// ============================================================================
// createPurchase (spec-052 — C-02 / C-13 / C-14)
// ============================================================================

export type PurchaseFundingSource = 'pc' | 'pc_with_stash' | 'stash'

export type CreatePurchaseInput = {
  campaignId: string
  /** PC that receives the item and (for 'pc'/'pc_with_stash') pays. */
  buyerPcId: string
  /** Catalog item being bought (its title is snapshotted on the item leg). */
  itemNodeId: string
  /** Integer ≥ 1; default 1. */
  qty?: number
  fundingSource: PurchaseFundingSource
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
  comment?: string
  /** Set-buy (T027): share one batch across the set's items. */
  batchId?: string
  /**
   * Set-buy (C-16): aggregated approval decision overriding the item's own
   * rarity gate. Single buys leave it undefined → rarity decides.
   */
  forceStatus?: 'approved' | 'pending'
  /**
   * Spec-053: post to the ledger feed. Set by single buys from /tg; buyItems
   * (set-buy) leaves it off and emits one aggregate «взят набор» itself.
   */
  notify?: boolean
  /**
   * Spec-053 «оставить на руках»: floor of the buyer's own wallet to preserve
   * when fundingSource='pc_with_stash'. Spend own down to keepGp, borrow the
   * rest from the общак. Ignored for 'pc' / 'stash'. Default 0.
   */
  keepGp?: number
}

/**
 * Buy a catalog item for gold (US2). Writes a money leg (−gp) + an item leg
 * (+qty) sharing a `transfer_group_id` under the 'purchase' category (C-02);
 * the accounting backend is otherwise untouched (FR-041). Unit price =
 * round((item.price_gp ?? rarity-default[bucket]) × coefficient[rarity])
 * (C-13). Approval is decided by the item's rarity, funding-agnostic (C-14).
 * Funding source is player-selected (C-01):
 *   - 'pc'            money leg on the buyer (own wallet)
 *   - 'stash'         money leg on the общак node (общак pays directly)
 *   - 'pc_with_stash' общак tops up the shortfall first, then the buyer pays.
 *                     Auto-approved buys only — a *pending* top-up can't be
 *                     coin-distributed before it is applied, so a rarity-gated
 *                     buy must use 'pc' or 'stash'.
 */
export async function createPurchase(
  input: CreatePurchaseInput,
): Promise<ActionResult<{ groupId: string; status: 'approved' | 'pending' }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.buyerPcId) return { ok: false, error: 'Не выбран персонаж' }
  if (!input.itemNodeId) return { ok: false, error: 'Не выбран предмет' }

  const qty = input.qty ?? 1
  const qtyErr = validateItemQty(qty)
  if (qtyErr) return { ok: false, error: qtyErr }

  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }

  // --- Resolve item + «нельзя купить» guard (C-15) ---
  const item = await getItemById(input.campaignId, input.itemNodeId)
  if (!item) return { ok: false, error: 'Предмет не найден в каталоге' }
  if (item.noPurchase) {
    return { ok: false, error: `«${item.title}» помечен как «нельзя купить»` }
  }

  // --- Price: (price_gp ?? rarity-default[bucket]) × coefficient[rarity] ---
  const admin = createAdminClient()
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
  const rarity = normalizeRarity(item.rarity)
  const unitGp = resolveBuyUnitPriceGp({
    priceGp: item.priceGp,
    categorySlug: item.categorySlug,
    rarity,
    defaults,
    policy,
  })
  if (unitGp == null) {
    return { ok: false, error: `У «${item.title}» нет цены — покупка недоступна` }
  }
  const totalGp = unitGp * qty

  // --- Auth + ownership ---
  const auth = await resolveAuth(input.campaignId)
  if (!auth.ok) return auth
  if (auth.role === 'player') {
    const owned = await isPcOwner(input.buyerPcId, auth.userId)
    if (!owned) return { ok: false, error: 'Нельзя покупать за чужого персонажа' }
  }

  // --- Approval gate: rarity-driven, funding-agnostic (C-14); set-buy may
  //     override with the aggregated decision (C-16). Spec-053: the campaign
  //     kill-switch (off by default) short-circuits the whole gate to approved,
  //     rarity and forceStatus included. ---
  const needsApproval =
    approvalsEnabledFromSettings(settings) &&
    (input.forceStatus != null
      ? input.forceStatus === 'pending'
      : approvalRequiredFor(policy, rarity))
  const status: 'approved' | 'pending' = needsApproval ? 'pending' : 'approved'
  const nowIso = new Date().toISOString()
  const batchId =
    input.batchId ?? (status === 'pending' ? crypto.randomUUID() : null)

  const stash = await getStashNode(input.campaignId)

  // --- Affordability per funding source — no implicit credit (C-01) ---
  if (input.fundingSource === 'pc') {
    const w = await getWallet(input.buyerPcId, input.loopNumber)
    if (w.aggregate_gp < totalGp) return { ok: false, error: 'Недостаточно золота' }
  } else if (input.fundingSource === 'stash') {
    if (!stash) return { ok: false, error: 'Общак не найден' }
    const w = await getWallet(stash.nodeId, input.loopNumber)
    if (w.aggregate_gp < totalGp) {
      return { ok: false, error: 'В общаке недостаточно золота' }
    }
  } else {
    // pc_with_stash
    if (!stash) return { ok: false, error: 'Общак не найден' }
    if (status === 'pending') {
      return {
        ok: false,
        error:
          'Покрытие из общака недоступно для предметов на одобрении — купи за свои или из общака напрямую',
      }
    }
    const [pcW, stashW] = await Promise.all([
      getWallet(input.buyerPcId, input.loopNumber),
      getWallet(stash.nodeId, input.loopNumber),
    ])
    const { toBorrow, remainderNegative } = computeShortfall(
      pcW.aggregate_gp,
      totalGp,
      stashW.aggregate_gp,
      input.keepGp ?? 0,
    )
    if (remainderNegative > 0) {
      return { ok: false, error: 'Недостаточно золота даже с общаком' }
    }
    // Top up the shortfall first (общак → PC), auto-approved, same batch.
    if (toBorrow > 0) {
      const topup = await createTransfer({
        campaignId: input.campaignId,
        senderPcId: stash.nodeId,
        recipientPcId: input.buyerPcId,
        amountGp: toBorrow,
        categorySlug: 'transfer',
        comment: `Покрытие: ${item.title}`,
        loopNumber: input.loopNumber,
        dayInLoop: input.dayInLoop,
        sessionId: input.sessionId ?? null,
        autoApprove: true,
        batchId: batchId ?? undefined,
      })
      if (!topup.ok) return topup
    }
  }

  // --- Money leg + item leg, shared group, 'purchase' category ---
  const payerNode =
    input.fundingSource === 'stash' ? stash!.nodeId : input.buyerPcId
  const spendCoins = await resolveCoinsForMoney(
    payerNode,
    input.loopNumber,
    -totalGp,
    undefined,
  )
  if (!DENOMINATIONS.some((d) => spendCoins[d] !== 0)) {
    return { ok: false, error: 'Недостаточно монет для покупки без размена' }
  }

  const groupId = crypto.randomUUID()
  const comment =
    input.comment ?? `Покупка: ${item.title}${qty > 1 ? ` ×${qty}` : ''}`
  const baseRow = {
    campaign_id: input.campaignId,
    category_slug: 'purchase',
    comment,
    loop_number: input.loopNumber,
    day_in_loop: input.dayInLoop,
    session_id: input.sessionId ?? null,
    transfer_group_id: groupId,
    status,
    author_user_id: auth.userId,
    batch_id: batchId,
    approved_by_user_id: status === 'approved' ? auth.userId : null,
    approved_at: status === 'approved' ? nowIso : null,
  }

  const { error } = await admin.from('transactions').insert([
    {
      ...baseRow,
      actor_pc_id: payerNode,
      kind: 'money',
      amount_cp: spendCoins.cp,
      amount_sp: spendCoins.sp,
      amount_gp: spendCoins.gp,
      amount_pp: spendCoins.pp,
      item_name: null,
      item_node_id: null,
      item_qty: 1,
    },
    {
      ...baseRow,
      actor_pc_id: input.buyerPcId,
      kind: 'item',
      amount_cp: 0,
      amount_sp: 0,
      amount_gp: 0,
      amount_pp: 0,
      item_name: item.title,
      item_node_id: input.itemNodeId,
      item_qty: qty,
    },
  ])
  if (error) {
    return { ok: false, error: `Не удалось сохранить покупку: ${error.message}` }
  }

  if (input.notify) {
    await notifyLedgerEvent({
      type: 'purchase',
      campaignId: input.campaignId,
      actorPcId: input.buyerPcId,
      authorUserId: auth.userId,
      item: { name: item.title, qty },
      totalGp,
    })
  }

  return { ok: true, groupId, status }
}

export async function submitBatch(
  input: SubmitBatchInput,
): Promise<SubmitBatchResult> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.rows || input.rows.length === 0) {
    return { ok: false, error: 'Пусто — добавьте хотя бы один ряд' }
  }

  const batchId = crypto.randomUUID()
  const admin = createAdminClient()
  const successes: Array<{ clientId: string; id?: string; groupId?: string }> = []

  for (const row of input.rows) {
    let res:
      | { ok: true; id?: string; groupId?: string }
      | { ok: false; error: string }

    if (row.kind === 'money') {
      const r = await createTransaction({
        campaignId: input.campaignId,
        actorPcId: row.actorPcId,
        kind: 'money',
        amountGp: row.amountGp,
        perDenomOverride: row.perDenomOverride,
        categorySlug: row.categorySlug,
        comment: row.comment,
        loopNumber: row.loopNumber,
        dayInLoop: row.dayInLoop,
        sessionId: row.sessionId ?? null,
        batchId,
      })
      res = r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error }
    } else if (row.kind === 'item') {
      const r = await createTransaction({
        campaignId: input.campaignId,
        actorPcId: row.actorPcId,
        kind: 'item',
        itemName: row.itemName,
        itemNodeId: row.itemNodeId,
        itemQty: row.itemQty,
        categorySlug: row.categorySlug,
        comment: row.comment,
        loopNumber: row.loopNumber,
        dayInLoop: row.dayInLoop,
        sessionId: row.sessionId ?? null,
        batchId,
      })
      res = r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error }
    } else if (row.kind === 'transfer-money') {
      const r = await createTransfer({
        campaignId: input.campaignId,
        senderPcId: row.senderPcId,
        recipientPcId: row.recipientPcId,
        amountGp: row.amountGp,
        perDenomOverride: row.perDenomOverride,
        categorySlug: row.categorySlug,
        comment: row.comment,
        loopNumber: row.loopNumber,
        dayInLoop: row.dayInLoop,
        sessionId: row.sessionId ?? null,
        batchId,
      })
      res = r.ok ? { ok: true, groupId: r.groupId } : { ok: false, error: r.error }
    } else {
      // 'transfer-item'
      const r = await createItemTransfer({
        campaignId: input.campaignId,
        senderPcId: row.senderPcId,
        recipientPcId: row.recipientPcId,
        itemName: row.itemName,
        itemNodeId: row.itemNodeId,
        qty: row.qty,
        categorySlug: row.categorySlug,
        comment: row.comment,
        loopNumber: row.loopNumber,
        dayInLoop: row.dayInLoop,
        sessionId: row.sessionId ?? null,
        batchId,
      })
      res = r.ok ? { ok: true, groupId: r.groupId } : { ok: false, error: r.error }
    }

    if (!res.ok) {
      // Roll back already-inserted rows in this batch (best effort).
      if (successes.length > 0) {
        await admin.from('transactions').delete().eq('batch_id', batchId)
      }
      return { ok: false, error: res.error, failedClientId: row.clientId }
    }

    successes.push({ clientId: row.clientId, id: res.id, groupId: res.groupId })
  }

  // Spec-053: one aggregate «стартовое снаряжение» post for the whole batch
  // (the starter list is money + item rows for a single PC). The inner
  // createTransaction calls stay silent (no notify) so this is the only post.
  const items = input.rows.flatMap((r) =>
    r.kind === 'item' ? [{ name: r.itemName, qty: r.itemQty }] : [],
  )
  const moneyGp = input.rows.reduce(
    (s, r) => (r.kind === 'money' ? s + (r.amountGp ?? 0) : s),
    0,
  )
  let starterPcId: string | null = null
  for (const r of input.rows) {
    if (r.kind === 'money' || r.kind === 'item') {
      starterPcId = r.actorPcId
      break
    }
  }
  if (starterPcId && (items.length > 0 || moneyGp !== 0)) {
    const user = await getCurrentUser()
    await notifyLedgerEvent({
      type: 'starter',
      campaignId: input.campaignId,
      actorPcId: starterPcId,
      authorUserId: user?.id ?? null,
      items,
      moneyGp: moneyGp !== 0 ? moneyGp : undefined,
    })
  }

  return { ok: true, batchId, rowResults: successes }
}
