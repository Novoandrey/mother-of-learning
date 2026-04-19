'use server'

import { revalidatePath } from 'next/cache'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionState = { error: string | null; success: string | null }

/**
 * Gate: only owner/dm can modify electives and their assignments.
 * Players can view.
 */
async function requireManager(slug: string) {
  const { user } = await requireAuth()
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) throw new Error('Campaign not found')
  const membership = await getMembership(campaign.id)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    throw new Error('Forbidden')
  }
  return { user, campaign }
}

/**
 * Toggle: if the edge (pcId → electiveId via has_elective) exists, delete it.
 * Otherwise create it with optional meta.note.
 *
 * Form fields:
 *   - pc_id:    character-node id
 *   - elective_id: elective-node id
 *   - note:     optional text to store in edge.meta.note
 */
export async function togglePcElectiveAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pcId = String(formData.get('pc_id') ?? '').trim()
  const electiveId = String(formData.get('elective_id') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  if (!pcId || !electiveId) {
    return { error: 'Нужны pc_id и elective_id', success: null }
  }

  let campaignId: string
  try {
    const { campaign } = await requireManager(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }

  const admin = createAdminClient()

  // Resolve has_elective edge_type id for this campaign.
  const { data: edgeType } = await admin
    .from('edge_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'has_elective')
    .maybeSingle()
  if (!edgeType) {
    return { error: "edge_type 'has_elective' не найден", success: null }
  }

  // Check whether edge exists.
  const { data: existing } = await admin
    .from('edges')
    .select('id, meta')
    .eq('campaign_id', campaignId)
    .eq('source_id', pcId)
    .eq('target_id', electiveId)
    .eq('type_id', edgeType.id)
    .maybeSingle()

  if (existing) {
    // Toggle off: delete
    const { error: delErr } = await admin.from('edges').delete().eq('id', existing.id)
    if (delErr) return { error: 'Не удалось снять факультатив: ' + delErr.message, success: null }
    revalidatePath(`/c/${slug}/electives`)
    return { error: null, success: 'Факультатив снят' }
  }

  // Toggle on: insert
  const meta: Record<string, unknown> = note ? { note } : {}
  const { error: insErr } = await admin.from('edges').insert({
    campaign_id: campaignId,
    source_id: pcId,
    target_id: electiveId,
    type_id: edgeType.id,
    meta,
  })
  if (insErr) return { error: 'Не удалось добавить: ' + insErr.message, success: null }

  revalidatePath(`/c/${slug}/electives`)
  return { error: null, success: 'Факультатив добавлен' }
}

/**
 * Update the note (meta.note) of an existing PC→elective edge.
 *   - form: pc_id, elective_id, note
 */
export async function updateElectiveNoteAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const pcId = String(formData.get('pc_id') ?? '').trim()
  const electiveId = String(formData.get('elective_id') ?? '').trim()
  const note = String(formData.get('note') ?? '').trim()

  if (!pcId || !electiveId) return { error: 'Нужны pc_id и elective_id', success: null }

  let campaignId: string
  try {
    const { campaign } = await requireManager(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }
  const admin = createAdminClient()

  const { data: edgeType } = await admin
    .from('edge_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'has_elective')
    .maybeSingle()
  if (!edgeType) return { error: "edge_type 'has_elective' не найден", success: null }

  const meta = note ? { note } : {}
  const { error } = await admin
    .from('edges')
    .update({ meta })
    .eq('campaign_id', campaignId)
    .eq('source_id', pcId)
    .eq('target_id', electiveId)
    .eq('type_id', edgeType.id)
  if (error) return { error: 'Не удалось обновить: ' + error.message, success: null }

  revalidatePath(`/c/${slug}/electives`)
  return { error: null, success: 'Заметка обновлена' }
}

/**
 * Create a new elective node.
 *   - form: kind, title, link, comment
 */
export async function createElectiveAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const kind = String(formData.get('kind') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const link = String(formData.get('link') ?? '').trim()
  const comment = String(formData.get('comment') ?? '').trim()

  if (!title) return { error: 'Нужно наименование', success: null }

  let campaignId: string
  try {
    const { campaign } = await requireManager(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }
  const admin = createAdminClient()

  const { data: electiveType } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'elective')
    .maybeSingle()
  if (!electiveType) return { error: "node_type 'elective' не найден", success: null }

  const { error } = await admin.from('nodes').insert({
    campaign_id: campaignId,
    type_id: electiveType.id,
    title,
    fields: { kind, link, comment },
  })
  if (error) return { error: 'Не удалось создать: ' + error.message, success: null }

  revalidatePath(`/c/${slug}/electives`)
  return { error: null, success: `Создан факультатив «${title}»` }
}

/**
 * Update elective fields (kind/title/link/comment).
 *   - form: id, kind, title, link, comment
 */
export async function updateElectiveAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '').trim()
  const kind = String(formData.get('kind') ?? '').trim()
  const title = String(formData.get('title') ?? '').trim()
  const link = String(formData.get('link') ?? '').trim()
  const comment = String(formData.get('comment') ?? '').trim()

  if (!id || !title) return { error: 'Нужны id и наименование', success: null }

  let campaignId: string
  try {
    const { campaign } = await requireManager(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }
  const admin = createAdminClient()

  const { error } = await admin
    .from('nodes')
    .update({ title, fields: { kind, link, comment }, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('campaign_id', campaignId)
  if (error) return { error: 'Не удалось обновить: ' + error.message, success: null }

  revalidatePath(`/c/${slug}/electives`)
  return { error: null, success: 'Сохранено' }
}

/**
 * Delete an elective node. Edges cascade automatically.
 */
export async function deleteElectiveAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { error: 'Нужен id', success: null }

  let campaignId: string
  try {
    const { campaign } = await requireManager(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }
  const admin = createAdminClient()

  const { error } = await admin.from('nodes').delete().eq('id', id).eq('campaign_id', campaignId)
  if (error) return { error: 'Не удалось удалить: ' + error.message, success: null }

  revalidatePath(`/c/${slug}/electives`)
  return { error: null, success: 'Удалено' }
}
