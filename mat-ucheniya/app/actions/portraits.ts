'use server'

import { revalidatePath } from 'next/cache'
import { canEditNode, getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity, logActivityError, logActivityWarning } from '@/lib/server/activity-log'

const PORTRAIT_TYPES = new Set(['character', 'npc', 'creature'])

async function resolveEditableNode(campaignId: string, nodeId: string) {
  const [membership, user] = await Promise.all([getMembership(campaignId), getCurrentUser()])
  if (!membership || !user) return null
  if (!(await canEditNode(nodeId, campaignId, user.id, membership.role))) return null
  const admin = createAdminClient()
  const { data: node } = await admin
    .from('nodes')
    .select('id, campaign_id, node_types!inner(slug)')
    .eq('id', nodeId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  const type = (node as { node_types?: { slug?: string } | { slug?: string }[] } | null)?.node_types
  const slug = Array.isArray(type) ? type[0]?.slug : type?.slug
  return node && slug && PORTRAIT_TYPES.has(slug) ? { admin, node } : null
}

function refresh(campaignSlug: string, nodeId: string) {
  revalidatePath(`/c/${campaignSlug}/catalog/${nodeId}`)
  revalidatePath(`/c/${campaignSlug}/maps`)
}

export async function addPortrait(campaignId: string, campaignSlug: string, nodeId: string, r2Key: string) {
  const resolved = await resolveEditableNode(campaignId, nodeId)
  if (!resolved || !r2Key.startsWith(`portraits/${campaignId}/${nodeId}/`)) {
    logActivityWarning('portrait.create.denied', { campaignId, nodeId })
    return { error: 'Нет прав на изменение портрета.' }
  }
  const { data: existing } = await resolved.admin
    .from('character_portraits').select('id, sort_order').eq('character_node_id', nodeId).order('sort_order', { ascending: false }).limit(1)
  const { error } = await resolved.admin.from('character_portraits').insert({
    character_node_id: nodeId,
    r2_key: r2Key,
    is_primary: !existing?.length,
    sort_order: (existing?.[0]?.sort_order ?? -1) + 1,
  })
  if (error) {
    logActivityError('portrait.create.failed', error, { campaignId, nodeId })
    return { error: 'Не удалось сохранить портрет.' }
  }
  logActivity('portrait.created', { campaignId, nodeId })
  refresh(campaignSlug, nodeId)
  return { ok: true }
}

export async function setPrimaryPortrait(campaignId: string, campaignSlug: string, nodeId: string, portraitId: string) {
  const resolved = await resolveEditableNode(campaignId, nodeId)
  if (!resolved) {
    logActivityWarning('portrait.primary.denied', { campaignId, nodeId, portraitId })
    return { error: 'Нет прав на изменение портрета.' }
  }
  const { data: portrait } = await resolved.admin.from('character_portraits').select('id').eq('id', portraitId).eq('character_node_id', nodeId).maybeSingle()
  if (!portrait) return { error: 'Портрет не найден.' }
  await resolved.admin.from('character_portraits').update({ is_primary: false }).eq('character_node_id', nodeId)
  const { error } = await resolved.admin.from('character_portraits').update({ is_primary: true }).eq('id', portraitId)
  if (error) {
    logActivityError('portrait.primary.failed', error, { campaignId, nodeId, portraitId })
    return { error: 'Не удалось выбрать основной портрет.' }
  }
  logActivity('portrait.primary_set', { campaignId, nodeId, portraitId })
  refresh(campaignSlug, nodeId)
  return { ok: true }
}

export async function deletePortrait(campaignId: string, campaignSlug: string, nodeId: string, portraitId: string) {
  const resolved = await resolveEditableNode(campaignId, nodeId)
  if (!resolved) {
    logActivityWarning('portrait.delete.denied', { campaignId, nodeId, portraitId })
    return { error: 'Нет прав на изменение портрета.' }
  }
  const { data: portrait } = await resolved.admin.from('character_portraits').select('id, is_primary').eq('id', portraitId).eq('character_node_id', nodeId).maybeSingle()
  if (!portrait) return { error: 'Портрет не найден.' }
  const { error } = await resolved.admin.from('character_portraits').delete().eq('id', portraitId)
  if (error) {
    logActivityError('portrait.delete.failed', error, { campaignId, nodeId, portraitId })
    return { error: 'Не удалось удалить портрет.' }
  }
  if (portrait.is_primary) {
    const { data: replacement } = await resolved.admin.from('character_portraits').select('id').eq('character_node_id', nodeId).order('sort_order').limit(1).maybeSingle()
    if (replacement) await resolved.admin.from('character_portraits').update({ is_primary: true }).eq('id', replacement.id)
  }
  logActivity('portrait.deleted', { campaignId, nodeId, portraitId })
  refresh(campaignSlug, nodeId)
  return { ok: true }
}

export async function savePortraitCrop(campaignId: string, campaignSlug: string, nodeId: string, portraitId: string, x: number, y: number, zoom: number) {
  const resolved = await resolveEditableNode(campaignId, nodeId)
  if (!resolved) {
    logActivityWarning('portrait.crop.denied', { campaignId, nodeId, portraitId })
    return { error: 'Нет прав на изменение портрета.' }
  }
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
  const { error } = await resolved.admin.from('character_portraits').update({ crop_x: clamp(x, 0, 1), crop_y: clamp(y, 0, 1), crop_zoom: clamp(zoom, 1, 4) }).eq('id', portraitId).eq('character_node_id', nodeId)
  if (error) {
    logActivityError('portrait.crop.failed', error, { campaignId, nodeId, portraitId })
    return { error: 'Не удалось сохранить кадрирование.' }
  }
  logActivity('portrait.crop_saved', { campaignId, nodeId, portraitId })
  refresh(campaignSlug, nodeId)
  return { ok: true }
}
