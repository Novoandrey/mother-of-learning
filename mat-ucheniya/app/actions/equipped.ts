'use server'

/**
 * Spec-052 (US3, C-03/C-04). Equipped state for a PC's items, per loop.
 * Pure inventory metadata stored in pc_equipped — it does NOT touch
 * transactions or balances (FR-022). Name-keyed to match the holdings readers
 * (getPcInventoryTg). Any campaign member may update equipment for any
 * character in that campaign.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getMembership, canEditNode } from '@/lib/auth'

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export async function setEquipped(input: {
  campaignId: string
  pcId: string
  itemName: string
  loopNumber: number
  equipped: boolean
}): Promise<ActionResult> {
  if (!input.campaignId) return { ok: false, error: 'Не указана кампания' }
  if (!input.pcId) return { ok: false, error: 'Не выбран персонаж' }
  const name = input.itemName?.trim()
  if (!name) return { ok: false, error: 'Не указан предмет' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(input.campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const allowed = await canEditNode(
    input.pcId,
    input.campaignId,
    user.id,
    membership.role,
  )
  if (!allowed) {
    return { ok: false, error: 'Персонаж не принадлежит этой кампании' }
  }

  const admin = createAdminClient()
  // Upsert the (pc, name, loop) row's equipped flag. The unique constraint
  // (pc_id, item_name, loop_number) makes this idempotent.
  const { error } = await admin.from('pc_equipped').upsert(
    {
      campaign_id: input.campaignId,
      pc_id: input.pcId,
      item_name: name,
      loop_number: input.loopNumber,
      equipped: input.equipped,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'pc_id,item_name,loop_number' },
  )
  if (error) return { ok: false, error: `Не удалось сохранить: ${error.message}` }

  return { ok: true }
}
