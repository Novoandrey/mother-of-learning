/**
 * Spec-017 — Складчина read layer.
 *
 * Server-only. Returns plain DTOs (no Supabase types in signatures).
 *
 * Архивность pool'а — derived: `(deleted_at IS NOT NULL) OR (every
 * participant has paid_at IS NOT NULL)`. Считаем SQL-стороной через
 * subquery `NOT EXISTS unpaid` + JS-фильтр по табу.
 *
 * Hydration: pools → participants → user_profiles. Все три батчатся
 * IN-clause'ами (one query per layer), без N+1.
 */

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

// ---------- Types ----------

export type ContributionPool = {
  id: string
  campaignId: string
  createdBy: string
  /** Display name автора, гидрированный из user_profiles. Fallback на
   *  пустую строку если профиля нет (не должно случаться, но guard). */
  authorDisplayName: string
  title: string
  paymentHint: string | null
  total: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  /** Computed: deletedAt !== null OR all participants paid. */
  archived: boolean
}

export type ContributionParticipant = {
  id: string
  poolId: string
  /** NULL = ad-hoc (free-text name, не member кампании). */
  userId: string | null
  /** Snapshot для linked rows, raw для ad-hoc. Always populated. */
  displayName: string
  share: number
  /** ISO timestamp; null = не сдал. */
  paidAt: string | null
}

export type ContributionPoolWithRows = ContributionPool & {
  participants: ContributionParticipant[]
  /** Sum of `share` where `paidAt !== null`. */
  paidSum: number
  /** `total - paidSum`. */
  unpaidSum: number
}

// ---------- Raw DB shapes (internal) ----------

type RawPool = {
  id: string
  campaign_id: string
  created_by: string
  title: string
  payment_hint: string | null
  total: string | number // numeric — Supabase возвращает как string иногда
  created_at: string
  updated_at: string
  deleted_at: string | null
}

type RawParticipant = {
  id: string
  pool_id: string
  user_id: string | null
  display_name: string
  share: string | number
  paid_at: string | null
}

type RawProfile = {
  user_id: string
  display_name: string | null
  login: string
}

// ---------- Helpers ----------

function toNumber(value: string | number): number {
  return typeof value === 'string' ? parseFloat(value) : value
}

function poolFromRaw(
  raw: RawPool,
  authorDisplayName: string,
): ContributionPool {
  // Provisional archived flag — only catches deleted_at === null branch
  // here. Caller overrides with the all-paid check after participants
  // are loaded.
  const archived = raw.deleted_at !== null
  return {
    id: raw.id,
    campaignId: raw.campaign_id,
    createdBy: raw.created_by,
    authorDisplayName,
    title: raw.title,
    paymentHint: raw.payment_hint,
    total: toNumber(raw.total),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    deletedAt: raw.deleted_at,
    archived,
  }
}

function participantFromRaw(raw: RawParticipant): ContributionParticipant {
  return {
    id: raw.id,
    poolId: raw.pool_id,
    userId: raw.user_id,
    displayName: raw.display_name,
    share: toNumber(raw.share),
    paidAt: raw.paid_at,
  }
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100
}

function buildPoolWithRows(
  pool: ContributionPool,
  participants: ContributionParticipant[],
): ContributionPoolWithRows {
  let paidCents = 0
  for (const p of participants) {
    if (p.paidAt !== null) paidCents += Math.round(p.share * 100)
  }
  const paidSum = paidCents / 100
  const unpaidSum = roundCents(pool.total - paidSum)
  return { ...pool, participants, paidSum, unpaidSum }
}

// ---------- Read API ----------

// ---------- Read API ----------

/**
 * List pools для одной из вкладок текущей страницы Складчины.
 *
 * @param campaignId  кампания, фильтрует SELECT через RLS + явно через
 *                    `.eq('campaign_id', campaignId)` (RLS — second line).
 * @param tab         'active' (текущие) | 'archived' (архив).
 *
 * Архивность считается JS-стороной после fetch'а:
 *   archived = deleted_at !== null
 *           || (participants.length > 0 && every paid_at !== null)
 *
 * Сортировка: по `updated_at` DESC. (Trigger
 * `bump_contribution_pool_updated_at` поднимает `updated_at` при
 * любой mutate участника, так что recently-touched всплывают вверх.)
 */
export async function getContributionPoolsForList(
  campaignId: string,
  tab: 'active' | 'archived',
): Promise<ContributionPoolWithRows[]> {
  const supabase = await createClient()

  // 1. Pools кампании, sorted desc.
  const { data: poolsRaw, error: poolsErr } = await supabase
    .from('contribution_pools')
    .select(
      'id, campaign_id, created_by, title, payment_hint, total, created_at, updated_at, deleted_at',
    )
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: false })
    .limit(200) // safety cap; UI ещё не paginate'ает.

  if (poolsErr) throw poolsErr
  if (!poolsRaw || poolsRaw.length === 0) return []

  const poolIds = poolsRaw.map((p) => (p as { id: string }).id)

  // 2. Participants — все строки сразу, IN-clause.
  const { data: participantsRaw, error: partErr } = await supabase
    .from('contribution_participants')
    .select('id, pool_id, user_id, display_name, share, paid_at')
    .in('pool_id', poolIds)
    .order('created_at', { ascending: true })

  if (partErr) throw partErr

  // 3. User profiles — для отображения author + linked participant
  //    refresh (используем snapshot если профиля нет).
  const userIds = new Set<string>()
  for (const p of poolsRaw) userIds.add((p as RawPool).created_by)
  for (const r of participantsRaw ?? []) {
    const userId = (r as RawParticipant).user_id
    if (userId) userIds.add(userId)
  }

  let profiles: Map<string, RawProfile> = new Map()
  if (userIds.size > 0) {
    const { data: profilesRaw, error: profErr } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, login')
      .in('user_id', Array.from(userIds))

    if (profErr) throw profErr
    profiles = new Map(
      (profilesRaw ?? []).map((p) => [
        (p as RawProfile).user_id,
        p as RawProfile,
      ]),
    )
  }

  // 4. Group participants by pool_id.
  const participantsByPool = new Map<string, ContributionParticipant[]>()
  for (const raw of participantsRaw ?? []) {
    const part = participantFromRaw(raw as RawParticipant)
    const list = participantsByPool.get(part.poolId) ?? []
    list.push(part)
    participantsByPool.set(part.poolId, list)
  }

  // 5. Build hydrated pools with archived flag (JS-side).
  const result: ContributionPoolWithRows[] = []
  for (const raw of poolsRaw) {
    const rawPool = raw as RawPool
    const profile = profiles.get(rawPool.created_by)
    const authorDisplayName =
      profile?.display_name ?? profile?.login ?? '(unknown)'

    const pool = poolFromRaw(rawPool, authorDisplayName)

    const parts = participantsByPool.get(pool.id) ?? []
    // Compute archived JS-side. all-paid: true только если есть
    // participants и все paid.
    const isAllPaid =
      parts.length > 0 && parts.every((p) => p.paidAt !== null)
    const archived = pool.deletedAt !== null || isAllPaid

    const withFlag: ContributionPool = { ...pool, archived }
    result.push(buildPoolWithRows(withFlag, parts))
  }

  // 6. Filter by tab.
  return result.filter((p) =>
    tab === 'archived' ? p.archived : !p.archived,
  )
}

/**
 * Single pool fetch by id. Used for detail screens / edit form
 * pre-fill. Returns null если pool не существует или RLS режет.
 */
export async function getContributionPool(
  poolId: string,
): Promise<ContributionPoolWithRows | null> {
  const supabase = await createClient()

  const { data: poolRaw, error: poolErr } = await supabase
    .from('contribution_pools')
    .select(
      'id, campaign_id, created_by, title, payment_hint, total, created_at, updated_at, deleted_at',
    )
    .eq('id', poolId)
    .maybeSingle()

  if (poolErr) throw poolErr
  if (!poolRaw) return null

  const { data: participantsRaw, error: partErr } = await supabase
    .from('contribution_participants')
    .select('id, pool_id, user_id, display_name, share, paid_at')
    .eq('pool_id', poolId)
    .order('created_at', { ascending: true })

  if (partErr) throw partErr

  const userIds = new Set<string>()
  userIds.add((poolRaw as RawPool).created_by)
  for (const r of participantsRaw ?? []) {
    const userId = (r as RawParticipant).user_id
    if (userId) userIds.add(userId)
  }

  let profiles: Map<string, RawProfile> = new Map()
  if (userIds.size > 0) {
    const { data: profilesRaw } = await supabase
      .from('user_profiles')
      .select('user_id, display_name, login')
      .in('user_id', Array.from(userIds))

    profiles = new Map(
      (profilesRaw ?? []).map((p) => [
        (p as RawProfile).user_id,
        p as RawProfile,
      ]),
    )
  }

  const rawPool = poolRaw as RawPool
  const profile = profiles.get(rawPool.created_by)
  const authorDisplayName =
    profile?.display_name ?? profile?.login ?? '(unknown)'

  const parts = (participantsRaw ?? []).map((r) =>
    participantFromRaw(r as RawParticipant),
  )

  const isAllPaid =
    parts.length > 0 && parts.every((p) => p.paidAt !== null)
  const archived = rawPool.deleted_at !== null || isAllPaid

  const pool = poolFromRaw(rawPool, authorDisplayName)
  return buildPoolWithRows({ ...pool, archived }, parts)
}

/**
 * Lightweight count of active (non-archived) pools — для бейджа на nav-tab
 * если когда-нибудь решим показывать счётчик. На MVP не используется,
 * но дешёвый — оставляем cached для будущего. По всем pool'ам кампании,
 * клиентский фильтр считает archived. Для cost — это всё ещё одна-две
 * round-trip query'и; если станет hot — заменим на RPC.
 */
export const countActiveContributionPools = cache(
  async (campaignId: string): Promise<number> => {
    const list = await getContributionPoolsForList(campaignId, 'active')
    return list.length
  },
)
