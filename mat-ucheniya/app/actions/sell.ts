'use server'

/**
 * Sell an item from a PC's bag — spec-058 (UX rework, verb «Продал»).
 *
 * Until now selling existed only for общак resources (`sellStashResource`,
 * spec-055). The action hub's «Продал» verb needs the personal counterpart:
 * withdraw an item from the PC's own inventory and credit the PC's wallet.
 *
 * ── Gating decision (documented per AGENTS.md) ─────────────────────────────
 * Unlike the stash flows (actor = общак node, membership-gated), here the
 * actor IS a PC — so the gate mirrors `createTransaction`'s canonical pattern:
 * campaign membership + (players only) `node_pc_owners` ownership of the
 * acting PC. DM/owner may sell on any PC's behalf. `resolveAuth`/`isPcOwner`
 * are local helpers of transactions.ts (not exported), so the same two checks
 * are re-implemented here 1:1.
 *
 * ── Price decision (модель доверия) ────────────────────────────────────────
 * The sale price comes FROM THE FORM (default suggested by the UI from the
 * catalog price), not resolved authoritatively server-side like purchases:
 * players narrate what they sold for, the DM sees it in the feed and can
 * correct — same trust stance as expedition rewards. Validated ≥ 0; whole gp
 * (int money columns, mig 034).
 *
 * ── Row shape ──────────────────────────────────────────────────────────────
 * Same as `sellStashResource`: one shared transfer_group_id, approved:
 *   (a) item WITHDRAWAL −qty (kind 'item', amounts 0, category 'loot');
 *   (b) money INCOME +soldGp (kind 'money', category 'income') — only when
 *       soldGp > 0 (mig 034 forbids zero-amount money rows).
 * Holdings check nets signed item_qty over the PC's approved rows keyed by
 * item name (`netStashQty` — the math is holder-agnostic despite the name).
 */

import crypto from 'node:crypto'

import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveEarn, signedCoinsToStored } from '@/lib/transaction-resolver'
import { validateDayInLoop, validateItemQty } from '@/lib/transaction-validation'
import { notifyLedgerEvent, type LedgerEvent } from '@/lib/telegram/ledger-feed'
import { netStashQty } from '@/lib/resources'
import type { ActionResult } from './transactions'

export type SellPcItemInput = {
  campaignId: string
  /** The acting PC (node id) — owner of the item and receiver of the money. */
  pcId: string
  /** Catalog link when known; the name is authoritative for holdings math. */
  itemNodeId?: string | null
  itemName: string
  qty: number
  /** Total sale amount in whole gp (form-provided; ≥ 0; 0 = «отдал даром»). */
  soldGp: number
  loopNumber: number
  dayInLoop: number
}

export async function sellPcItem(
  input: SellPcItemInput,
): Promise<ActionResult<{ soldGp: number }>> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.pcId) return { ok: false, error: 'Не выбран персонаж' }
  const itemName = input.itemName?.trim()
  if (!itemName) return { ok: false, error: 'Укажите предмет' }

  const qtyErr = validateItemQty(input.qty)
  if (qtyErr) return { ok: false, error: qtyErr }
  const dayErr = validateDayInLoop(input.dayInLoop, 365)
  if (dayErr) return { ok: false, error: dayErr }
  if (!Number.isFinite(input.soldGp) || input.soldGp < 0) {
    return { ok: false, error: 'Сумма продажи не может быть отрицательной' }
  }
  const soldGp = Math.round(input.soldGp)

  // --- Auth: any campaign member can act for any PC. ---
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const admin = createAdminClient()

  // --- Holdings: the PC must actually hold ≥ qty of the item this loop ---
  const { data: holdRows, error: holdErr } = await admin
    .from('transactions')
    .select('item_qty')
    .eq('campaign_id', input.campaignId)
    .eq('actor_pc_id', input.pcId)
    .eq('kind', 'item')
    .eq('item_name', itemName)
    .eq('status', 'approved')
    .eq('loop_number', input.loopNumber)
  if (holdErr) {
    return { ok: false, error: `Не удалось проверить инвентарь: ${holdErr.message}` }
  }
  const net = netStashQty((holdRows ?? []) as { item_qty: number }[])
  if (net < input.qty) {
    return {
      ok: false,
      error: `В сумке нет столько «${itemName}» — есть ${net}, продаётся ${input.qty}`,
    }
  }

  const nowIso = new Date().toISOString()
  const groupId = crypto.randomUUID()
  const approvedBase = {
    campaign_id: input.campaignId,
    actor_pc_id: input.pcId,
    loop_number: input.loopNumber,
    day_in_loop: input.dayInLoop,
    transfer_group_id: groupId,
    status: 'approved' as const,
    author_user_id: user.id,
    batch_id: null,
    approved_by_user_id: user.id,
    approved_at: nowIso,
    session_id: null,
  }
  const comment = `Продажа: ${itemName} ×${input.qty}`

  const rows: Record<string, unknown>[] = [
    {
      ...approvedBase,
      kind: 'item',
      amount_cp: 0,
      amount_sp: 0,
      amount_gp: 0,
      amount_pp: 0,
      item_name: itemName,
      item_node_id: input.itemNodeId ?? null,
      item_qty: -input.qty,
      category_slug: 'loot',
      comment,
    },
  ]
  if (soldGp > 0) {
    const earn = signedCoinsToStored(false, resolveEarn(soldGp))
    rows.push({
      ...approvedBase,
      kind: 'money',
      amount_cp: earn.cp,
      amount_sp: earn.sp,
      amount_gp: earn.gp,
      amount_pp: earn.pp,
      item_name: null,
      item_node_id: null,
      item_qty: 1,
      category_slug: 'income',
      comment,
    })
  }

  const { error: txErr } = await admin.from('transactions').insert(rows)
  if (txErr) {
    return { ok: false, error: `Не удалось записать продажу: ${txErr.message}` }
  }

  // Feed: same 'income' narration as sellStashResource; only when money moved.
  if (soldGp > 0) {
    const event: LedgerEvent = {
      type: 'income',
      campaignId: input.campaignId,
      actorPcId: input.pcId,
      authorUserId: user.id,
      amountGp: soldGp,
      comment,
    }
    await notifyLedgerEvent(event)
  }

  return { ok: true, soldGp }
}
