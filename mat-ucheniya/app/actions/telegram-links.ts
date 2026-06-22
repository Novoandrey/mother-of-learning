'use server'

/**
 * Telegram account linking (spec-046, C-01 б).
 *
 * DM/owner binds a Telegram user id to an existing campaign member account.
 * A player opens the Mini App unlinked, reads their telegram_id off the screen,
 * relays it to the DM, who binds it here. Writes go through the service role
 * after a membership/role check (mirrors the gating canon in transactions.ts).
 *
 * Touches only user_profiles — not nodes/node_types — so no sidebar
 * invalidation is needed (AGENTS.md).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getMembership } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

export type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

async function requireDm(campaignId: string): Promise<ActionResult> {
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к кампании.' }
  if (membership.role !== 'owner' && membership.role !== 'dm') {
    return { ok: false, error: 'Привязывать телеграм может только ДМ или владелец.' }
  }
  return { ok: true }
}

export async function linkTelegramAction(input: {
  campaignId: string
  slug: string
  userId: string // the member account to link
  telegramId: string // raw input from the form
}): Promise<ActionResult> {
  const gate = await requireDm(input.campaignId)
  if (!gate.ok) return gate

  const trimmed = input.telegramId.trim()
  if (!/^\d{1,19}$/.test(trimmed)) {
    return { ok: false, error: 'telegram_id должен быть числом.' }
  }
  const tgId = Number(trimmed)
  if (!Number.isSafeInteger(tgId)) {
    return { ok: false, error: 'telegram_id вне допустимого диапазона.' }
  }

  const admin = createAdminClient()

  const { data: member } = await admin
    .from('campaign_members')
    .select('user_id')
    .eq('campaign_id', input.campaignId)
    .eq('user_id', input.userId)
    .maybeSingle()
  if (!member) return { ok: false, error: 'Этот аккаунт не состоит в кампании.' }

  const { data: clash } = await admin
    .from('user_profiles')
    .select('user_id')
    .eq('telegram_id', tgId)
    .maybeSingle()
  if (clash && (clash as { user_id: string }).user_id !== input.userId) {
    return { ok: false, error: 'Этот telegram_id уже привязан к другому аккаунту.' }
  }

  const { error } = await admin
    .from('user_profiles')
    .update({ telegram_id: tgId })
    .eq('user_id', input.userId)
  if (error) return { ok: false, error: 'Не удалось сохранить привязку.' }

  revalidatePath(`/c/${input.slug}/settings/telegram`)
  return { ok: true }
}

export async function unlinkTelegramAction(input: {
  campaignId: string
  slug: string
  userId: string
}): Promise<ActionResult> {
  const gate = await requireDm(input.campaignId)
  if (!gate.ok) return gate

  const admin = createAdminClient()
  const { error } = await admin
    .from('user_profiles')
    .update({ telegram_id: null })
    .eq('user_id', input.userId)
  if (error) return { ok: false, error: 'Не удалось отвязать.' }

  revalidatePath(`/c/${input.slug}/settings/telegram`)
  return { ok: true }
}
