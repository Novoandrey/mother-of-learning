'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { clampMapPosition } from '@/lib/maps'
import { logActivity, logActivityError, logActivityWarning } from '@/lib/server/activity-log'

function canManage(role: string) {
  return role === 'owner' || role === 'dm'
}

export async function createMap(campaignId: string, campaignSlug: string, title: string, imageKey: string) {
  const membership = await getMembership(campaignId)
  const user = await getCurrentUser()
  if (!membership || !user || !canManage(membership.role)) {
    logActivityWarning('map.create.denied', { campaignId })
    return { error: 'Недостаточно прав.' }
  }
  const cleanTitle = title.trim()
  if (!cleanTitle || cleanTitle.length > 120 || !imageKey.startsWith(`maps/${campaignId}/`)) {
    logActivityWarning('map.create.invalid_input', { campaignId })
    return { error: 'Проверьте название и изображение карты.' }
  }
  const { error } = await createAdminClient().from('campaign_maps').insert({
    campaign_id: campaignId, title: cleanTitle, image_key: imageKey, created_by: user.id,
  })
  if (error) {
    logActivityError('map.create.failed', error, { campaignId, userId: user.id })
    return { error: 'Не удалось сохранить карту.' }
  }
  logActivity('map.created', { campaignId, userId: user.id })
  revalidatePath(`/c/${campaignSlug}/maps`)
  return { ok: true }
}

export async function addMapToken(campaignId: string, campaignSlug: string, mapId: string, characterNodeId: string) {
  const membership = await getMembership(campaignId)
  if (!membership || !canManage(membership.role)) {
    logActivityWarning('map.token_add.denied', { campaignId, mapId, characterNodeId })
    return { error: 'Недостаточно прав.' }
  }
  const admin = createAdminClient()
  const { data: map } = await admin.from('campaign_maps').select('id').eq('id', mapId).eq('campaign_id', campaignId).maybeSingle()
  // A map token in this first version represents a player character. NPC
  // markers can be introduced separately, once the encounter model owns them.
  const { data: node } = await admin
    .from('nodes')
    .select('id, node_pc_owners!inner(user_id)')
    .eq('id', characterNodeId)
    .eq('campaign_id', campaignId)
    .maybeSingle()
  if (!map || !node) {
    logActivityWarning('map.token_add.not_found', { campaignId, mapId, characterNodeId })
    return { error: 'Карта или персонаж не найдены.' }
  }
  const { error } = await admin.from('map_tokens').upsert({ map_id: mapId, character_node_id: characterNodeId }, { onConflict: 'map_id,character_node_id' })
  if (error) {
    logActivityError('map.token_add.failed', error, { campaignId, mapId, characterNodeId })
    return { error: 'Не удалось добавить токен.' }
  }
  logActivity('map.token_added', { campaignId, mapId, characterNodeId })
  revalidatePath(`/c/${campaignSlug}/maps`)
  return { ok: true }
}

export async function moveMapToken(campaignId: string, tokenId: string, x: number, y: number) {
  const membership = await getMembership(campaignId)
  const user = await getCurrentUser()
  if (!membership || !user) {
    logActivityWarning('map.token_move.denied', { campaignId, tokenId })
    return { error: 'Нет доступа.' }
  }
  const admin = createAdminClient()
  const { data: token } = await admin.from('map_tokens').select('id, character_node_id, campaign_maps!inner(campaign_id)').eq('id', tokenId).maybeSingle()
  const tokenCampaignId = (token as { campaign_maps?: { campaign_id?: string } | { campaign_id?: string }[] } | null)?.campaign_maps
  const belongs = Array.isArray(tokenCampaignId) ? tokenCampaignId[0]?.campaign_id : tokenCampaignId?.campaign_id
  if (!token || belongs !== campaignId) {
    logActivityWarning('map.token_move.not_found', { campaignId, tokenId, userId: user.id })
    return { error: 'Токен не найден.' }
  }
  // Every campaign member may position every character token.
  const { error } = await admin.from('map_tokens').update({ x: clampMapPosition(x), y: clampMapPosition(y), updated_at: new Date().toISOString() }).eq('id', tokenId)
  if (error) {
    logActivityError('map.token_move.failed', error, { campaignId, tokenId, userId: user.id })
    return { error: 'Не удалось передвинуть токен.' }
  }
  logActivity('map.token_moved', { campaignId, tokenId, userId: user.id })
  return { ok: true }
}
