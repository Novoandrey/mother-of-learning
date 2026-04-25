'use server'

/**
 * IDEA-055 — Encounter meta actions: rename + delete (DM-only).
 *
 * Surfaces:
 *   - renameEncounter(encounterId, newTitle): updates title; the
 *     spec-013 sync trigger (`sync_encounter_title_to_mirror`)
 *     propagates the change to the mirror node automatically — no
 *     extra writes here.
 *   - deleteEncounter(encounterId): removes the encounter; CASCADEs
 *     handle participants / log / events / loot draft, and the
 *     spec-013 AFTER DELETE trigger (`delete_encounter_mirror_node`)
 *     drops the mirror node, which cascades autogen rows for that
 *     encounter via the existing FK on `transactions.autogen_source_node_id`.
 *
 * Both gated DM/owner via membership check; admin client used for the
 * actual write so RLS isn't a confusing source of "0 rows updated"
 * errors.
 */

import { revalidatePath } from 'next/cache'

import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export type EncounterMetaResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

async function authDm(
  encounterId: string,
): Promise<
  | { ok: true; campaignId: string; campaignSlug: string }
  | { ok: false; error: string }
> {
  if (!encounterId) return { ok: false, error: 'Не указан энкаунтер' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Не авторизован' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('encounters')
    .select('campaign_id, campaign:campaigns!campaign_id(slug)')
    .eq('id', encounterId)
    .maybeSingle()

  if (error) return { ok: false, error: `Ошибка: ${error.message}` }
  if (!data) return { ok: false, error: 'Энкаунтер не найден' }

  type Row = {
    campaign_id: string
    campaign: { slug: string } | { slug: string }[] | null
  }
  const row = data as Row
  const slug = Array.isArray(row.campaign) ? row.campaign[0]?.slug : row.campaign?.slug
  if (!slug) return { ok: false, error: 'Кампания не найдена' }

  const m = await getMembership(row.campaign_id)
  if (!m) return { ok: false, error: 'Нет доступа к этой кампании' }
  if (m.role !== 'owner' && m.role !== 'dm') {
    return { ok: false, error: 'Только ДМ или владелец' }
  }
  return { ok: true, campaignId: row.campaign_id, campaignSlug: slug }
}

export async function renameEncounter(
  encounterId: string,
  newTitle: string,
): Promise<EncounterMetaResult> {
  const auth = await authDm(encounterId)
  if (!auth.ok) return auth

  const trimmed = newTitle.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'Название не может быть пустым' }
  }
  if (trimmed.length > 200) {
    return { ok: false, error: 'Название слишком длинное (макс 200)' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('encounters')
    .update({ title: trimmed })
    .eq('id', encounterId)

  if (error) return { ok: false, error: `Ошибка: ${error.message}` }

  revalidatePath(`/c/${auth.campaignSlug}/encounters/${encounterId}`)
  revalidatePath(`/c/${auth.campaignSlug}/encounters`)
  // Mirror title is synced by the spec-013 trigger, but autogen badge
  // tooltips on accounting pages cache the title via the page-level
  // hydration; bump those too.
  revalidatePath(`/c/${auth.campaignSlug}/accounting`)

  return { ok: true }
}

export async function deleteEncounter(
  encounterId: string,
): Promise<EncounterMetaResult<{ campaignSlug: string }>> {
  const auth = await authDm(encounterId)
  if (!auth.ok) return auth

  const admin = createAdminClient()
  const { error } = await admin
    .from('encounters')
    .delete()
    .eq('id', encounterId)

  if (error) return { ok: false, error: `Ошибка удаления: ${error.message}` }

  revalidatePath(`/c/${auth.campaignSlug}/encounters`)
  revalidatePath(`/c/${auth.campaignSlug}/accounting`)
  return { ok: true, campaignSlug: auth.campaignSlug }
}
