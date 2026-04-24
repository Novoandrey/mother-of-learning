'use server'

/**
 * Stash server actions — spec-011 Phase 6.
 *
 * Convenience wrappers over `createTransfer` / `createItemTransfer` /
 * `createTransaction` that hide the "which node is the stash for this
 * campaign" resolution. Every action resolves the stash via
 * `getStashNode` first; a missing stash (shouldn't happen post-mig 035)
 * surfaces as a Russian error the UI can render.
 *
 * All actions inherit the ownership rules from the underlying writers:
 *   - DM/owner: everything allowed.
 *   - Player: may act only on PCs they own (enforced by the wrapped
 *     action — this module adds no extra gating).
 *
 * `createExpenseWithStashShortfall` is the headline flow: it fans out
 * into *up to* two sequential writes (transfer pair + expense row) and
 * returns enough to build the spec-011 "shortfall resolved" toast.
 */

import {
  createTransfer,
  createItemTransfer,
  createTransaction,
  type ActionResult,
} from './transactions'
import { getStashNode } from '@/lib/stash'
import { getWallet } from '@/lib/transactions'
import { computeShortfall } from '@/lib/transaction-resolver'

// ============================================================================
// Input shapes
// ============================================================================

type MoneyStashInput = {
  campaignId: string
  actorPcId: string
  /** Magnitude in gp; the wrapper attaches the sign. */
  amountGp: number
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}

type ItemStashInput = {
  campaignId: string
  actorPcId: string
  itemName: string
  qty: number
  comment: string
  /** Defaults to `'loot'` when put-into-stash, `'loot'` also when take-from. */
  categorySlug?: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}

// ============================================================================
// Money wrappers (T016)
// ============================================================================

export async function putMoneyIntoStash(
  input: MoneyStashInput,
): Promise<ActionResult<{ groupId: string }>> {
  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }
  return createTransfer({
    campaignId: input.campaignId,
    senderPcId: input.actorPcId,
    recipientPcId: stash.nodeId,
    amountGp: Math.abs(input.amountGp),
    categorySlug: 'transfer',
    comment: input.comment,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    sessionId: input.sessionId ?? null,
  })
}

export async function takeMoneyFromStash(
  input: MoneyStashInput,
): Promise<ActionResult<{ groupId: string }>> {
  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }
  return createTransfer({
    campaignId: input.campaignId,
    senderPcId: stash.nodeId,
    recipientPcId: input.actorPcId,
    amountGp: Math.abs(input.amountGp),
    categorySlug: 'transfer',
    comment: input.comment,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    sessionId: input.sessionId ?? null,
  })
}

// ============================================================================
// Item wrappers (T017)
// ============================================================================

export async function putItemIntoStash(
  input: ItemStashInput,
): Promise<ActionResult<{ groupId: string }>> {
  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }
  return createItemTransfer({
    campaignId: input.campaignId,
    senderPcId: input.actorPcId,
    recipientPcId: stash.nodeId,
    itemName: input.itemName,
    qty: input.qty,
    categorySlug: input.categorySlug ?? 'loot',
    comment: input.comment,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    sessionId: input.sessionId ?? null,
  })
}

export async function takeItemFromStash(
  input: ItemStashInput,
): Promise<ActionResult<{ groupId: string }>> {
  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }
  return createItemTransfer({
    campaignId: input.campaignId,
    senderPcId: stash.nodeId,
    recipientPcId: input.actorPcId,
    itemName: input.itemName,
    qty: input.qty,
    categorySlug: input.categorySlug ?? 'loot',
    comment: input.comment,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    sessionId: input.sessionId ?? null,
  })
}

// ============================================================================
// getStashAggregate (T018) — small read helper for the transaction form
// ============================================================================

/**
 * Current total gp held in the stash for this loop. Used by
 * `<TransactionForm>` to decide whether to render the shortfall prompt.
 * Returns `0` if the campaign has no stash (defensive — should never
 * happen post-mig 035).
 */
export async function getStashAggregate(
  campaignId: string,
  loopNumber: number,
): Promise<ActionResult<{ aggregateGp: number }>> {
  const stash = await getStashNode(campaignId)
  if (!stash) return { ok: true, aggregateGp: 0 }
  const wallet = await getWallet(stash.nodeId, loopNumber)
  return { ok: true, aggregateGp: wallet.aggregate_gp }
}

// ============================================================================
// createExpenseWithStashShortfall (T019)
// ============================================================================
//
// The spec-011 shortfall flow, server-side. Given an expense that
// overdraws the PC wallet, optionally cover the gap from the stash
// before the expense is recorded.
//
// Sequence:
//   1. Resolve stash; fetch PC wallet + stash wallet in parallel.
//   2. computeShortfall → { shortfall, toBorrow, remainderNegative }.
//   3. If toBorrow > 0: create a stash→PC transfer pair for toBorrow
//      (category 'transfer', comment 'Покрытие: …').
//   4. Create the full expense on the PC (-|amountGp|).
//
// Partial failure: step 3 succeeds, step 4 fails → leave the transfer
// pair in place and surface the error. This matches the plan's
// "all-or-nothing isn't worth a sql function" decision. The DM can
// see both rows in the ledger and resolve by hand.

export type ShortfallExpenseInput = {
  campaignId: string
  actorPcId: string
  /** Magnitude in gp; the action applies the negative sign. */
  amountGp: number
  categorySlug: string
  comment: string
  loopNumber: number
  dayInLoop: number
  sessionId?: string | null
}

export type ShortfallExpenseOk = {
  transferGroupId: string | null
  expenseId: string
  borrowed: number
  remainder: number
}

export async function createExpenseWithStashShortfall(
  input: ShortfallExpenseInput,
): Promise<ActionResult<ShortfallExpenseOk>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.actorPcId) return { ok: false, error: 'Не выбран персонаж' }
  if (!input.categorySlug) return { ok: false, error: 'Не выбрана категория' }

  const amountMag = Math.abs(input.amountGp)
  if (!Number.isFinite(amountMag) || amountMag <= 0) {
    return { ok: false, error: 'Сумма расхода должна быть больше нуля' }
  }

  const stash = await getStashNode(input.campaignId)
  if (!stash) {
    return { ok: false, error: 'Общак не найден — проверьте миграцию 035' }
  }

  // Wallets — parallel. PC first, stash second; either can be zero.
  const [pcWallet, stashWallet] = await Promise.all([
    getWallet(input.actorPcId, input.loopNumber),
    getWallet(stash.nodeId, input.loopNumber),
  ])

  const { shortfall, toBorrow, remainderNegative } = computeShortfall(
    pcWallet.aggregate_gp,
    amountMag,
    stashWallet.aggregate_gp,
  )

  // Step 3 — cover from stash if there's shortfall AND the stash can contribute.
  let transferGroupId: string | null = null
  if (toBorrow > 0) {
    const transferRes = await createTransfer({
      campaignId: input.campaignId,
      senderPcId: stash.nodeId,
      recipientPcId: input.actorPcId,
      amountGp: toBorrow,
      categorySlug: 'transfer',
      comment: `Покрытие: ${input.comment}`.trim(),
      loopNumber: input.loopNumber,
      dayInLoop: input.dayInLoop,
      sessionId: input.sessionId ?? null,
    })
    if (!transferRes.ok) return transferRes
    transferGroupId = transferRes.groupId
  }

  // Step 4 — the actual expense on the PC, full magnitude.
  const expenseRes = await createTransaction({
    campaignId: input.campaignId,
    actorPcId: input.actorPcId,
    kind: 'money',
    amountGp: -amountMag,
    categorySlug: input.categorySlug,
    comment: input.comment,
    loopNumber: input.loopNumber,
    dayInLoop: input.dayInLoop,
    sessionId: input.sessionId ?? null,
  })
  if (!expenseRes.ok) {
    // Transfer already landed. Surface the error — DM reconciles manually.
    return {
      ok: false,
      error: transferGroupId
        ? `Перевод из общака создан, но расход не записан: ${expenseRes.error}. Транзакции можно увидеть в ленте.`
        : expenseRes.error,
    }
  }

  // `shortfall` is redundant for the caller (they already know amountGp
  // and wallet) — we return borrowed + remainder (the useful toast bits).
  void shortfall
  return {
    ok: true,
    transferGroupId,
    expenseId: expenseRes.id,
    borrowed: toBorrow,
    remainder: remainderNegative,
  }
}
