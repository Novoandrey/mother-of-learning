'use server'

/**
 * Spec-014 — Approval server actions.
 *
 * Five entry points: `approveRow`, `rejectRow`, `approveBatch`,
 * `rejectBatch`, `withdrawRow`, `withdrawBatch`. Every UPDATE/DELETE
 * is gated by `WHERE id = ? AND status = 'pending' AND updated_at = ?`
 * for optimistic concurrency (FR-028). Zero-row writes surface as
 * `{ ok: false, error, stale: true }` so the client can show a refresh
 * toast instead of a generic error.
 *
 * Authorisation:
 *   - approve* / reject* — DM/owner only (RLS already enforces; we
 *     return clean Russian errors).
 *   - withdraw* — author of the rows (player-only path; DM uses
 *     deleteTransaction directly).
 *
 * Withdraw is hard-delete per OQ-6 — no `withdrawn` status. For
 * transfer rows, both legs share `transfer_group_id` and disappear
 * together.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getMembership } from '@/lib/auth'
import type { ApprovalResult } from '@/lib/approval'

// ---------- Auth helper (mirrors transactions.ts shape) ----------

type AuthContext =
  | { ok: true; userId: string; role: 'owner' | 'dm' | 'player' }
  | { ok: false; error: string }

async function resolveAuth(campaignId: string): Promise<AuthContext> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }
  const membership = await getMembership(campaignId)
  if (!membership) return { ok: false, error: 'Нет доступа к этой кампании' }
  return { ok: true, userId: user.id, role: membership.role }
}

// ---------- Path revalidation helper ----------

async function revalidateAccountingPaths(campaignSlug: string): Promise<void> {
  revalidatePath(`/c/${campaignSlug}/accounting`)
  revalidatePath(`/c/${campaignSlug}/accounting/queue`)
}

/**
 * Look up campaign slug for `revalidatePath`. Could be cached; cheap
 * single-row fetch per action call is fine at our scale.
 */
async function getCampaignSlug(campaignId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('campaigns')
    .select('slug')
    .eq('id', campaignId)
    .maybeSingle()
  return (data as { slug: string } | null)?.slug ?? null
}

// ============================================================================
// approveRow / rejectRow
// ============================================================================

export type ApproveRowInput = {
  rowId: string
  expectedUpdatedAt: string
}

export type RejectRowInput = ApproveRowInput & {
  comment?: string | null
}

export async function approveRow(
  input: ApproveRowInput,
): Promise<ApprovalResult> {
  if (!input.rowId) return { ok: false, error: 'Не указан ряд' }
  if (!input.expectedUpdatedAt) {
    return { ok: false, error: 'Нет метки обновления — обновите очередь' }
  }

  const admin = createAdminClient()
  const { data: existing, error: loadErr } = await admin
    .from('transactions')
    .select('id, campaign_id, status, transfer_group_id')
    .eq('id', input.rowId)
    .maybeSingle()

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  if (!existing) return { ok: false, error: 'Ряд не найден' }

  const row = existing as {
    id: string
    campaign_id: string
    status: 'pending' | 'approved' | 'rejected'
    transfer_group_id: string | null
  }

  const auth = await resolveAuth(row.campaign_id)
  if (!auth.ok) return auth
  if (auth.role === 'player') {
    return { ok: false, error: 'Только мастер может одобрять заявки' }
  }

  if (row.status !== 'pending') {
    return { ok: false, error: 'Ряд уже не в очереди', stale: true }
  }

  const nowIso = new Date().toISOString()

  // FR-004: both legs of a transfer share status. Approve atomically.
  if (row.transfer_group_id) {
    const { data: legs } = await admin
      .from('transactions')
      .select('id, updated_at, status')
      .eq('transfer_group_id', row.transfer_group_id)
    const legArr = (legs ?? []) as Array<{
      id: string
      updated_at: string
      status: 'pending' | 'approved' | 'rejected'
    }>
    if (legArr.length !== 2) {
      return { ok: false, error: 'Перевод повреждён — нет парной ноги' }
    }
    if (legArr.some((l) => l.status !== 'pending')) {
      return { ok: false, error: 'Ряд уже не в очереди', stale: true }
    }
    // Gate by the requesting leg's updated_at; sibling concurrent edit
    // will reveal itself via the status check above.
    const requested = legArr.find((l) => l.id === row.id)!
    if (requested.updated_at !== input.expectedUpdatedAt) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
    const { error: updErr, count } = await admin
      .from('transactions')
      .update({
        status: 'approved',
        approved_by_user_id: auth.userId,
        approved_at: nowIso,
      }, { count: 'exact' })
      .eq('transfer_group_id', row.transfer_group_id)
      .eq('status', 'pending')
    if (updErr) return { ok: false, error: `Не удалось одобрить: ${updErr.message}` }
    if (!count || count !== 2) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
  } else {
    const { error: updErr, count } = await admin
      .from('transactions')
      .update({
        status: 'approved',
        approved_by_user_id: auth.userId,
        approved_at: nowIso,
      }, { count: 'exact' })
      .eq('id', input.rowId)
      .eq('status', 'pending')
      .eq('updated_at', input.expectedUpdatedAt)
    if (updErr) return { ok: false, error: `Не удалось одобрить: ${updErr.message}` }
    if (!count || count === 0) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
  }

  const slug = await getCampaignSlug(row.campaign_id)
  if (slug) await revalidateAccountingPaths(slug)
  return { ok: true }
}

export async function rejectRow(
  input: RejectRowInput,
): Promise<ApprovalResult> {
  if (!input.rowId) return { ok: false, error: 'Не указан ряд' }
  if (!input.expectedUpdatedAt) {
    return { ok: false, error: 'Нет метки обновления — обновите очередь' }
  }

  const admin = createAdminClient()
  const { data: existing, error: loadErr } = await admin
    .from('transactions')
    .select('id, campaign_id, status, transfer_group_id')
    .eq('id', input.rowId)
    .maybeSingle()

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  if (!existing) return { ok: false, error: 'Ряд не найден' }

  const row = existing as {
    id: string
    campaign_id: string
    status: 'pending' | 'approved' | 'rejected'
    transfer_group_id: string | null
  }

  const auth = await resolveAuth(row.campaign_id)
  if (!auth.ok) return auth
  if (auth.role === 'player') {
    return { ok: false, error: 'Только мастер может отклонять заявки' }
  }

  if (row.status !== 'pending') {
    return { ok: false, error: 'Ряд уже не в очереди', stale: true }
  }

  const nowIso = new Date().toISOString()
  const comment = input.comment?.trim() || null

  if (row.transfer_group_id) {
    const { data: legs } = await admin
      .from('transactions')
      .select('id, updated_at, status')
      .eq('transfer_group_id', row.transfer_group_id)
    const legArr = (legs ?? []) as Array<{
      id: string
      updated_at: string
      status: 'pending' | 'approved' | 'rejected'
    }>
    if (legArr.length !== 2) {
      return { ok: false, error: 'Перевод повреждён — нет парной ноги' }
    }
    if (legArr.some((l) => l.status !== 'pending')) {
      return { ok: false, error: 'Ряд уже не в очереди', stale: true }
    }
    const requested = legArr.find((l) => l.id === row.id)!
    if (requested.updated_at !== input.expectedUpdatedAt) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
    const { error: updErr, count } = await admin
      .from('transactions')
      .update({
        status: 'rejected',
        rejected_by_user_id: auth.userId,
        rejected_at: nowIso,
        rejection_comment: comment,
      }, { count: 'exact' })
      .eq('transfer_group_id', row.transfer_group_id)
      .eq('status', 'pending')
    if (updErr) return { ok: false, error: `Не удалось отклонить: ${updErr.message}` }
    if (!count || count !== 2) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
  } else {
    const { error: updErr, count } = await admin
      .from('transactions')
      .update({
        status: 'rejected',
        rejected_by_user_id: auth.userId,
        rejected_at: nowIso,
        rejection_comment: comment,
      }, { count: 'exact' })
      .eq('id', input.rowId)
      .eq('status', 'pending')
      .eq('updated_at', input.expectedUpdatedAt)
    if (updErr) return { ok: false, error: `Не удалось отклонить: ${updErr.message}` }
    if (!count || count === 0) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
  }

  const slug = await getCampaignSlug(row.campaign_id)
  if (slug) await revalidateAccountingPaths(slug)
  return { ok: true }
}

// ============================================================================
// approveBatch / rejectBatch
// ============================================================================

export type ApproveBatchInput = {
  batchId: string
  /** Per-row stale gate: rowId → expected updated_at. */
  expectedUpdatedAtByRowId: Record<string, string>
}

export type RejectBatchInput = ApproveBatchInput & {
  comment?: string | null
}

export type BatchActionResult =
  | { ok: true; processed: number; stale: number }
  | { ok: false; error: string; stale?: true }

export async function approveBatch(
  input: ApproveBatchInput,
): Promise<BatchActionResult> {
  if (!input.batchId) return { ok: false, error: 'Не указана пачка' }

  const admin = createAdminClient()
  const { data: existingRows, error: loadErr } = await admin
    .from('transactions')
    .select('id, campaign_id, status, updated_at, transfer_group_id')
    .eq('batch_id', input.batchId)

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  const rows = (existingRows ?? []) as Array<{
    id: string
    campaign_id: string
    status: 'pending' | 'approved' | 'rejected'
    updated_at: string
    transfer_group_id: string | null
  }>
  if (rows.length === 0) return { ok: false, error: 'Пачка не найдена' }

  const campaignId = rows[0].campaign_id
  const auth = await resolveAuth(campaignId)
  if (!auth.ok) return auth
  if (auth.role === 'player') {
    return { ok: false, error: 'Только мастер может одобрять заявки' }
  }

  let processed = 0
  let stale = 0
  // Per-row UPDATE — Postgres lacks per-action transactions via the
  // JS client, so we accept partial-success semantics (plan.md). Each
  // row gates on its own expected_updated_at + status='pending'.
  for (const row of rows) {
    if (row.status !== 'pending') {
      stale++
      continue
    }
    const expected = input.expectedUpdatedAtByRowId[row.id]
    if (!expected || expected !== row.updated_at) {
      stale++
      continue
    }
    const r = await approveRow({ rowId: row.id, expectedUpdatedAt: expected })
    if (r.ok) {
      processed++
    } else if (r.stale) {
      stale++
    } else {
      // Hard error — short-circuit and surface it.
      return { ok: false, error: r.error }
    }
  }

  const slug = await getCampaignSlug(campaignId)
  if (slug) await revalidateAccountingPaths(slug)
  return { ok: true, processed, stale }
}

export async function rejectBatch(
  input: RejectBatchInput,
): Promise<BatchActionResult> {
  if (!input.batchId) return { ok: false, error: 'Не указана пачка' }

  const admin = createAdminClient()
  const { data: existingRows, error: loadErr } = await admin
    .from('transactions')
    .select('id, campaign_id, status, updated_at')
    .eq('batch_id', input.batchId)

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  const rows = (existingRows ?? []) as Array<{
    id: string
    campaign_id: string
    status: 'pending' | 'approved' | 'rejected'
    updated_at: string
  }>
  if (rows.length === 0) return { ok: false, error: 'Пачка не найдена' }

  const campaignId = rows[0].campaign_id
  const auth = await resolveAuth(campaignId)
  if (!auth.ok) return auth
  if (auth.role === 'player') {
    return { ok: false, error: 'Только мастер может отклонять заявки' }
  }

  let processed = 0
  let stale = 0
  for (const row of rows) {
    if (row.status !== 'pending') {
      stale++
      continue
    }
    const expected = input.expectedUpdatedAtByRowId[row.id]
    if (!expected || expected !== row.updated_at) {
      stale++
      continue
    }
    const r = await rejectRow({
      rowId: row.id,
      expectedUpdatedAt: expected,
      comment: input.comment ?? null,
    })
    if (r.ok) {
      processed++
    } else if (r.stale) {
      stale++
    } else {
      return { ok: false, error: r.error }
    }
  }

  const slug = await getCampaignSlug(campaignId)
  if (slug) await revalidateAccountingPaths(slug)
  return { ok: true, processed, stale }
}

// ============================================================================
// withdrawRow / withdrawBatch
// ============================================================================

export type WithdrawRowInput = {
  rowId: string
  expectedUpdatedAt: string
}

export type WithdrawBatchInput = {
  batchId: string
  expectedUpdatedAtByRowId: Record<string, string>
}

export async function withdrawRow(
  input: WithdrawRowInput,
): Promise<ApprovalResult> {
  if (!input.rowId) return { ok: false, error: 'Не указан ряд' }
  if (!input.expectedUpdatedAt) {
    return { ok: false, error: 'Нет метки обновления — обновите очередь' }
  }

  const admin = createAdminClient()
  const { data: existing, error: loadErr } = await admin
    .from('transactions')
    .select('id, campaign_id, status, author_user_id, transfer_group_id, updated_at')
    .eq('id', input.rowId)
    .maybeSingle()

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  if (!existing) return { ok: false, error: 'Ряд не найден' }

  const row = existing as {
    id: string
    campaign_id: string
    status: 'pending' | 'approved' | 'rejected'
    author_user_id: string | null
    transfer_group_id: string | null
    updated_at: string
  }

  const auth = await resolveAuth(row.campaign_id)
  if (!auth.ok) return auth

  // Author-only — players can withdraw their own pending rows. DMs use
  // deleteTransaction directly (their flow is "approved already, edit
  // the wallet directly").
  if (row.author_user_id !== auth.userId) {
    return { ok: false, error: 'Можно отзывать только свои заявки' }
  }
  if (row.status !== 'pending') {
    return { ok: false, error: 'Можно отозвать только pending-заявку', stale: true }
  }
  if (row.updated_at !== input.expectedUpdatedAt) {
    return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
  }

  // Transfer pair → delete both legs by transfer_group_id. DELETE gate
  // checks status='pending' so a sibling that was already approved
  // between fetch and delete won't disappear silently.
  if (row.transfer_group_id) {
    const { error: delErr, count } = await admin
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('transfer_group_id', row.transfer_group_id)
      .eq('status', 'pending')
    if (delErr) return { ok: false, error: `Не удалось отозвать: ${delErr.message}` }
    if (!count || count < 2) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
  } else {
    const { error: delErr, count } = await admin
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('id', input.rowId)
      .eq('status', 'pending')
      .eq('author_user_id', auth.userId)
      .eq('updated_at', input.expectedUpdatedAt)
    if (delErr) return { ok: false, error: `Не удалось отозвать: ${delErr.message}` }
    if (!count || count === 0) {
      return { ok: false, error: 'Ряд изменился, обновите очередь', stale: true }
    }
  }

  const slug = await getCampaignSlug(row.campaign_id)
  if (slug) await revalidateAccountingPaths(slug)
  return { ok: true }
}

export async function withdrawBatch(
  input: WithdrawBatchInput,
): Promise<BatchActionResult> {
  if (!input.batchId) return { ok: false, error: 'Не указана пачка' }

  const admin = createAdminClient()
  const { data: existingRows, error: loadErr } = await admin
    .from('transactions')
    .select(
      'id, campaign_id, status, author_user_id, transfer_group_id, updated_at',
    )
    .eq('batch_id', input.batchId)

  if (loadErr) return { ok: false, error: `Не удалось загрузить: ${loadErr.message}` }
  const rows = (existingRows ?? []) as Array<{
    id: string
    campaign_id: string
    status: 'pending' | 'approved' | 'rejected'
    author_user_id: string | null
    transfer_group_id: string | null
    updated_at: string
  }>
  if (rows.length === 0) return { ok: false, error: 'Пачка не найдена' }

  const campaignId = rows[0].campaign_id
  const auth = await resolveAuth(campaignId)
  if (!auth.ok) return auth

  let processed = 0
  let stale = 0
  // Track transfer_group_ids we've already deleted to avoid double-
  // deleting a pair when both legs come up in iteration.
  const deletedGroups = new Set<string>()

  for (const row of rows) {
    if (row.author_user_id !== auth.userId) {
      stale++
      continue
    }
    if (row.status !== 'pending') {
      stale++
      continue
    }
    const expected = input.expectedUpdatedAtByRowId[row.id]
    if (!expected || expected !== row.updated_at) {
      stale++
      continue
    }
    if (row.transfer_group_id && deletedGroups.has(row.transfer_group_id)) {
      // Already covered by sibling leg's withdraw.
      processed++
      continue
    }

    const r = await withdrawRow({ rowId: row.id, expectedUpdatedAt: expected })
    if (r.ok) {
      processed++
      if (row.transfer_group_id) deletedGroups.add(row.transfer_group_id)
    } else if (r.stale) {
      stale++
    } else {
      return { ok: false, error: r.error }
    }
  }

  const slug = await getCampaignSlug(campaignId)
  if (slug) await revalidateAccountingPaths(slug)
  return { ok: true, processed, stale }
}
