'use server'

/**
 * Spec-017 — Складчина server actions.
 *
 * Pattern matches `app/actions/categories.ts`:
 *   • Auth: getCurrentUser → 401 if null.
 *   • Membership gate: getMembership(campaignId) → 403 if null.
 *   • Role gate: explicit (author OR dm/owner) для mutate.
 *   • Writes go through createAdminClient (bypasses RLS — RLS is
 *     second line of defence, gate is primary).
 *   • Validation: pure helpers from `lib/contribution-split.ts` +
 *     trim / length checks here.
 *   • revalidatePath('/c/<slug>/skladchina', 'page') after mutate.
 *
 * Все actions возвращают `{ ok: true, ... } | { ok: false, error: string }`
 * с user-readable Russian text. RLS / FK errors мапятся в generic
 * «Не удалось сохранить» + console.error (доступно в Vercel logs).
 */

import { revalidatePath } from 'next/cache'

import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  canReduceTotal,
  sharesMatchTotal,
} from '@/lib/contribution-split'

// ---------- Shared types ----------

export type ContributionActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

type AuthOk = { ok: true; userId: string }
type AuthFail = { ok: false; error: string }

// ---------- Validation primitives ----------

const TITLE_MAX = 100
const HINT_MAX = 200
const NAME_MAX = 100

function validateTitle(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed.length === 0) return 'Укажите название'
  if (trimmed.length > TITLE_MAX) {
    return `Название слишком длинное (макс ${TITLE_MAX} символов)`
  }
  return null
}

function validatePaymentHint(hint: string | null): string | null {
  if (hint === null) return null
  if (hint.length > HINT_MAX) {
    return `Реквизиты слишком длинные (макс ${HINT_MAX} символов)`
  }
  return null
}

function validateTotal(total: number): string | null {
  if (!Number.isFinite(total)) return 'Сумма должна быть числом'
  if (total <= 0) return 'Сумма должна быть больше нуля'
  return null
}

function validateDisplayName(name: string): string | null {
  const trimmed = name.trim()
  if (trimmed.length === 0) return 'Укажите имя участника'
  if (trimmed.length > NAME_MAX) {
    return `Имя слишком длинное (макс ${NAME_MAX} символов)`
  }
  return null
}

function validateShare(share: number): string | null {
  if (!Number.isFinite(share)) return 'Доля должна быть числом'
  if (share < 0) return 'Доля не может быть отрицательной'
  return null
}

// ---------- Auth gates ----------

/**
 * Базовый гейт: авторизован + member кампании. Всем member'ам можно
 * читать, INSERT pool — себе автором.
 */
async function requireMember(
  campaignId: string,
): Promise<AuthOk | AuthFail> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  return { ok: true, userId: user.id }
}

/**
 * Гейт для mutate существующего pool'а: автор pool'а ИЛИ DM/owner
 * кампании. Загружает pool, чтобы проверить и `created_by`, и
 * `campaign_id` за один шаг.
 */
async function requirePoolWriter(poolId: string): Promise<
  | { ok: true; userId: string; campaignId: string; createdBy: string }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data: pool, error } = await admin
    .from('contribution_pools')
    .select('id, campaign_id, created_by')
    .eq('id', poolId)
    .maybeSingle()

  if (error) {
    console.error('requirePoolWriter: pool fetch failed', error)
    return { ok: false, error: 'Не удалось проверить доступ' }
  }
  if (!pool) return { ok: false, error: 'Складчина не найдена' }

  const p = pool as { id: string; campaign_id: string; created_by: string }
  const membership = await getMembership(p.campaign_id)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }

  const isAuthor = p.created_by === user.id
  const isDM = membership.role === 'dm' || membership.role === 'owner'
  if (!isAuthor && !isDM) {
    return {
      ok: false,
      error: 'Только автор или ДМ может менять эту Складчину',
    }
  }

  return {
    ok: true,
    userId: user.id,
    campaignId: p.campaign_id,
    createdBy: p.created_by,
  }
}

/** Helper для участника: загружает participant + parent pool, гейтит. */
async function requireParticipantWriter(
  participantId: string,
): Promise<
  | {
      ok: true
      userId: string
      participant: {
        id: string
        pool_id: string
        share: number
        paid_at: string | null
      }
      pool: { id: string; campaign_id: string; created_by: string }
    }
  | { ok: false; error: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data: participant, error } = await admin
    .from('contribution_participants')
    .select('id, pool_id, share, paid_at')
    .eq('id', participantId)
    .maybeSingle()

  if (error) {
    console.error('requireParticipantWriter: fetch failed', error)
    return { ok: false, error: 'Не удалось проверить доступ' }
  }
  if (!participant) return { ok: false, error: 'Участник не найден' }

  const part = participant as {
    id: string
    pool_id: string
    share: string | number
    paid_at: string | null
  }

  const { data: pool } = await admin
    .from('contribution_pools')
    .select('id, campaign_id, created_by')
    .eq('id', part.pool_id)
    .maybeSingle()

  if (!pool) return { ok: false, error: 'Складчина не найдена' }
  const p = pool as { id: string; campaign_id: string; created_by: string }

  const membership = await getMembership(p.campaign_id)
  if (!membership) return { ok: false, error: 'Нет доступа' }

  const isAuthor = p.created_by === user.id
  const isDM = membership.role === 'dm' || membership.role === 'owner'
  if (!isAuthor && !isDM) {
    return { ok: false, error: 'Только автор или ДМ может это менять' }
  }

  return {
    ok: true,
    userId: user.id,
    participant: {
      id: part.id,
      pool_id: part.pool_id,
      share: typeof part.share === 'string' ? parseFloat(part.share) : part.share,
      paid_at: part.paid_at,
    },
    pool: p,
  }
}

// ---------- Revalidation helper ----------

async function revalidateForCampaign(campaignId: string) {
  const admin = createAdminClient()
  const { data: campaign } = await admin
    .from('campaigns')
    .select('slug')
    .eq('id', campaignId)
    .maybeSingle()
  if (!campaign) return
  const slug = (campaign as { slug: string }).slug
  revalidatePath(`/c/${slug}/skladchina`, 'page')
}

// ---------- Actions ----------

/**
 * T009 — Создать pool с участниками атомарно.
 *
 * 1. Validate inputs.
 * 2. Insert pool header → получаем poolId.
 * 3. Insert participants с этим poolId.
 * 4. Если шаг 3 падает — manual rollback (DELETE FROM pool).
 *
 * Postgres-side нет CHECK на sum(participants.share) === pool.total —
 * это business rule на уровне приложения, валидируется здесь.
 */
export async function createContributionPool(input: {
  campaignId: string
  title: string
  paymentHint: string | null
  total: number
  participants: Array<{
    userId: string | null
    displayName: string
    share: number
  }>
}): Promise<ContributionActionResult<{ poolId: string }>> {
  const titleErr = validateTitle(input.title)
  if (titleErr) return { ok: false, error: titleErr }

  const hintErr = validatePaymentHint(input.paymentHint)
  if (hintErr) return { ok: false, error: hintErr }

  const totalErr = validateTotal(input.total)
  if (totalErr) return { ok: false, error: totalErr }

  if (!input.participants || input.participants.length === 0) {
    return { ok: false, error: 'Добавьте хотя бы одного участника' }
  }

  for (const p of input.participants) {
    const nameErr = validateDisplayName(p.displayName)
    if (nameErr) return { ok: false, error: nameErr }
    const shareErr = validateShare(p.share)
    if (shareErr) return { ok: false, error: shareErr }
  }

  const shares = input.participants.map((p) => p.share)
  if (!sharesMatchTotal(shares, input.total)) {
    const sum = shares.reduce((a, b) => a + b, 0).toFixed(2)
    return {
      ok: false,
      error: `Сумма не бьётся: ${sum} ≠ ${input.total.toFixed(2)}`,
    }
  }

  const auth = await requireMember(input.campaignId)
  if (!auth.ok) return auth

  const admin = createAdminClient()

  const { data: poolRow, error: poolErr } = await admin
    .from('contribution_pools')
    .insert({
      campaign_id: input.campaignId,
      created_by: auth.userId,
      title: input.title.trim(),
      payment_hint: input.paymentHint?.trim() || null,
      total: input.total,
    })
    .select('id')
    .single()

  if (poolErr || !poolRow) {
    console.error('createContributionPool: pool insert failed', poolErr)
    return { ok: false, error: 'Не удалось создать Складчину' }
  }
  const poolId = (poolRow as { id: string }).id

  const partsPayload = input.participants.map((p) => ({
    pool_id: poolId,
    user_id: p.userId,
    display_name: p.displayName.trim(),
    share: p.share,
  }))

  const { error: partsErr } = await admin
    .from('contribution_participants')
    .insert(partsPayload)

  if (partsErr) {
    // Manual rollback — удаляем pool, чтобы не оставлять сирот.
    await admin.from('contribution_pools').delete().eq('id', poolId)
    console.error('createContributionPool: participants insert failed', partsErr)
    return { ok: false, error: 'Не удалось сохранить участников' }
  }

  await revalidateForCampaign(input.campaignId)
  return { ok: true, poolId }
}

/**
 * T010 — Toggle paid_at у одной строки участника.
 *
 * `paid = true` → paid_at = now(); `paid = false` → paid_at = null.
 * `bump_contribution_pool_updated_at` trigger автоматом подтянет
 * pool.updated_at.
 */
export async function toggleParticipantPaid(input: {
  participantId: string
  paid: boolean
}): Promise<ContributionActionResult> {
  const gate = await requireParticipantWriter(input.participantId)
  if (!gate.ok) return gate

  const admin = createAdminClient()
  const { error } = await admin
    .from('contribution_participants')
    .update({ paid_at: input.paid ? new Date().toISOString() : null })
    .eq('id', input.participantId)

  if (error) {
    console.error('toggleParticipantPaid: update failed', error)
    return { ok: false, error: 'Не удалось обновить статус' }
  }

  await revalidateForCampaign(gate.pool.campaign_id)
  return { ok: true }
}

/**
 * T011 — Update pool header (title / payment_hint / total).
 *
 * Partial update: меняются только переданные поля. Если меняется
 * total — load participants и проверить `canReduceTotal`. Reject
 * если новый total меньше уже собранного paid-суммы.
 *
 * NOTE: при изменении total pool.total и sum(participant.share)
 * могут разойтись — приводить их к согласию должен `EditForm` через
 * `replaceContributionParticipants`. Этот action только меняет
 * header. UI показывает баннер «суммы не сходятся» если detected.
 */
export async function updateContributionPoolHeader(input: {
  poolId: string
  title?: string
  paymentHint?: string | null
  total?: number
}): Promise<ContributionActionResult> {
  if (input.title !== undefined) {
    const err = validateTitle(input.title)
    if (err) return { ok: false, error: err }
  }
  if (input.paymentHint !== undefined) {
    const err = validatePaymentHint(input.paymentHint)
    if (err) return { ok: false, error: err }
  }
  if (input.total !== undefined) {
    const err = validateTotal(input.total)
    if (err) return { ok: false, error: err }
  }

  const gate = await requirePoolWriter(input.poolId)
  if (!gate.ok) return gate

  const admin = createAdminClient()

  if (input.total !== undefined) {
    const { data: parts, error: partsErr } = await admin
      .from('contribution_participants')
      .select('share, paid_at')
      .eq('pool_id', input.poolId)

    if (partsErr) {
      console.error('updateContributionPoolHeader: parts fetch failed', partsErr)
      return { ok: false, error: 'Не удалось проверить участников' }
    }

    const current = (parts ?? []).map((p) => {
      const row = p as { share: string | number; paid_at: string | null }
      return {
        share: typeof row.share === 'string' ? parseFloat(row.share) : row.share,
        paid: row.paid_at !== null,
      }
    })

    const guard = canReduceTotal(input.total, current)
    if (!guard.ok) return { ok: false, error: guard.reason }
  }

  const updates: Record<string, unknown> = {}
  if (input.title !== undefined) updates.title = input.title.trim()
  if (input.paymentHint !== undefined) {
    updates.payment_hint = input.paymentHint?.trim() || null
  }
  if (input.total !== undefined) updates.total = input.total

  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await admin
    .from('contribution_pools')
    .update(updates)
    .eq('id', input.poolId)

  if (error) {
    console.error('updateContributionPoolHeader: update failed', error)
    return { ok: false, error: 'Не удалось обновить Складчину' }
  }

  await revalidateForCampaign(gate.campaignId)
  return { ok: true }
}

/**
 * T012 — Replace participant set wholesale.
 *
 * Diff-стратегия:
 *   • Items с `id` matching existing → UPDATE (display_name, share,
 *     user_id если изменились).
 *   • Items без `id` → INSERT.
 *   • Existing rows не упомянутые в input → DELETE.
 *
 * Hard rule: paid rows (`paid_at IS NOT NULL`) НЕ могут быть удалены
 * или их share изменена. Action отвергает запрос если detected
 * divergence — клиент должен фильтровать сам в EditForm (paid rows
 * read-only).
 *
 * Sum check: `sum(participants.share) === pool.total` после применения.
 * Pool.total в этом action не меняется — для total меняй
 * `updateContributionPoolHeader` отдельно.
 */
export async function replaceContributionParticipants(input: {
  poolId: string
  participants: Array<{
    id?: string
    userId: string | null
    displayName: string
    share: number
  }>
}): Promise<ContributionActionResult> {
  if (input.participants.length === 0) {
    return { ok: false, error: 'Добавьте хотя бы одного участника' }
  }

  for (const p of input.participants) {
    const nameErr = validateDisplayName(p.displayName)
    if (nameErr) return { ok: false, error: nameErr }
    const shareErr = validateShare(p.share)
    if (shareErr) return { ok: false, error: shareErr }
  }

  const gate = await requirePoolWriter(input.poolId)
  if (!gate.ok) return gate

  const admin = createAdminClient()

  // Load pool.total + current participants.
  const { data: pool, error: poolErr } = await admin
    .from('contribution_pools')
    .select('total')
    .eq('id', input.poolId)
    .maybeSingle()

  if (poolErr || !pool) {
    return { ok: false, error: 'Не удалось загрузить Складчину' }
  }
  const poolTotal =
    typeof (pool as { total: string | number }).total === 'string'
      ? parseFloat((pool as { total: string }).total)
      : ((pool as { total: number }).total)

  const shares = input.participants.map((p) => p.share)
  if (!sharesMatchTotal(shares, poolTotal)) {
    const sum = shares.reduce((a, b) => a + b, 0).toFixed(2)
    return {
      ok: false,
      error: `Сумма не бьётся: ${sum} ≠ ${poolTotal.toFixed(2)}`,
    }
  }

  const { data: existing, error: existingErr } = await admin
    .from('contribution_participants')
    .select('id, share, paid_at, user_id, display_name')
    .eq('pool_id', input.poolId)

  if (existingErr) {
    console.error('replaceContributionParticipants: load existing failed', existingErr)
    return { ok: false, error: 'Не удалось загрузить участников' }
  }

  type Existing = {
    id: string
    share: string | number
    paid_at: string | null
    user_id: string | null
    display_name: string
  }
  const existingRows = (existing ?? []) as Existing[]
  const existingById = new Map(existingRows.map((r) => [r.id, r]))

  // Diff:
  const toUpdate: Array<{
    id: string
    user_id: string | null
    display_name: string
    share: number
  }> = []
  const toInsert: Array<{
    pool_id: string
    user_id: string | null
    display_name: string
    share: number
  }> = []
  const keepIds = new Set<string>()

  for (const p of input.participants) {
    if (p.id) {
      const ex = existingById.get(p.id)
      if (!ex) {
        return { ok: false, error: 'Участник не найден (устаревшие данные?)' }
      }
      keepIds.add(p.id)
      const exShare =
        typeof ex.share === 'string' ? parseFloat(ex.share) : ex.share

      // Hard rule: paid row не может изменить share.
      if (ex.paid_at !== null && exShare !== p.share) {
        return {
          ok: false,
          error:
            `Нельзя менять долю у того, кто уже сдал. Сначала ` +
            `расжмите чекбокс у «${ex.display_name}».`,
        }
      }
      toUpdate.push({
        id: p.id,
        user_id: p.userId,
        display_name: p.displayName.trim(),
        share: p.share,
      })
    } else {
      toInsert.push({
        pool_id: input.poolId,
        user_id: p.userId,
        display_name: p.displayName.trim(),
        share: p.share,
      })
    }
  }

  // Delete missing (но: paid rows нельзя удалять).
  const toDelete: string[] = []
  for (const ex of existingRows) {
    if (!keepIds.has(ex.id)) {
      if (ex.paid_at !== null) {
        return {
          ok: false,
          error:
            `Нельзя удалить участника «${ex.display_name}» — он уже ` +
            `сдал. Сначала расжмите чекбокс.`,
        }
      }
      toDelete.push(ex.id)
    }
  }

  // Apply mutations sequentially. Не атомарно через RPC — но три шага
  // относительно безопасны, и только автор/DM может вызвать. На fail
  // в середине состояние может быть half-applied — это acceptable
  // tradeoff для упрощения. Ranking shipped > perfect.
  if (toDelete.length > 0) {
    const { error } = await admin
      .from('contribution_participants')
      .delete()
      .in('id', toDelete)
    if (error) {
      console.error('replace: delete failed', error)
      return { ok: false, error: 'Не удалось удалить участников' }
    }
  }

  for (const upd of toUpdate) {
    const { error } = await admin
      .from('contribution_participants')
      .update({
        user_id: upd.user_id,
        display_name: upd.display_name,
        share: upd.share,
      })
      .eq('id', upd.id)
    if (error) {
      console.error('replace: update failed', error)
      return { ok: false, error: 'Не удалось обновить участников' }
    }
  }

  if (toInsert.length > 0) {
    const { error } = await admin
      .from('contribution_participants')
      .insert(toInsert)
    if (error) {
      console.error('replace: insert failed', error)
      return { ok: false, error: 'Не удалось добавить участников' }
    }
  }

  await revalidateForCampaign(gate.campaignId)
  return { ok: true }
}

/**
 * T013 — Soft-delete pool. Сам pool остаётся, но с `deleted_at` set,
 * попадает в Архив с overlay «удалено».
 */
export async function softDeleteContributionPool(
  poolId: string,
): Promise<ContributionActionResult> {
  const gate = await requirePoolWriter(poolId)
  if (!gate.ok) return gate

  const admin = createAdminClient()
  const { error } = await admin
    .from('contribution_pools')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', poolId)

  if (error) {
    console.error('softDeleteContributionPool: failed', error)
    return { ok: false, error: 'Не удалось удалить Складчину' }
  }

  await revalidateForCampaign(gate.campaignId)
  return { ok: true }
}
