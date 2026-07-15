'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { clampMapPosition } from '@/lib/maps'

function canManage(role: string) {
  return role === 'owner' || role === 'dm'
}

export async function createMap(campaignId: string, campaignSlug: string, title: string, imageKey: string) {
  const membership = await getMembership(campaignId)
  const user = await getCurrentUser()
  if (!membership || !user || !canManage(membership.role)) return { error: 'Недостаточно прав.' }
  const cleanTitle = title.trim()
  if (!cleanTitle || cleanTitle.length > 120 || !imageKey.startsWith(`maps/${campaignId}/`)) {
    return { error: 'Проверьте название и изображение карты.' }
  }
  const { error } = await createAdminClient().from('campaign_maps').insert({
    campaign_id: campaignId, title: cleanTitle, image_key: imageKey, created_by: user.id,
  })
  if (error) return { error: 'Не удалось сохранить карту.' }
  revalidatePath(`/c/${campaignSlug}/maps`)
  return { ok: true }
}

export async function addMapToken(campaignId: string, campaignSlug: string, mapId: string, characterNodeId: string) {
  const membership = await getMembership(campaignId)
  if (!membership || !canManage(membership.role)) return { error: 'Недостаточно прав.' }
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
  if (!map || !node) return { error: 'Карта или персонаж не найдены.' }
  const { error } = await admin.from('map_tokens').upsert({ map_id: mapId, character_node_id: characterNodeId }, { onConflict: 'map_id,character_node_id' })
  if (error) return { error: 'Не удалось добавить токен.' }
  revalidatePath(`/c/${campaignSlug}/maps`)
  return { ok: true }
}

export async function moveMapToken(campaignId: string, campaignSlug: string, tokenId: string, x: number, y: number) {
  const membership = await getMembership(campaignId)
  const user = await getCurrentUser()
  if (!membership || !user) return { error: 'Нет доступа.' }
  const admin = createAdminClient()
  const { data: token } = await admin.from('map_tokens').select('id, character_node_id, campaign_maps!inner(campaign_id)').eq('id', tokenId).maybeSingle()
  const tokenCampaignId = (token as { campaign_maps?: { campaign_id?: string } | { campaign_id?: string }[] } | null)?.campaign_maps
  const belongs = Array.isArray(tokenCampaignId) ? tokenCampaignId[0]?.campaign_id : tokenCampaignId?.campaign_id
  if (!token || belongs !== campaignId) return { error: 'Токен не найден.' }
  // Every campaign member may position every character token.
  const { error } = await admin.from('map_tokens').update({ x: clampMapPosition(x), y: clampMapPosition(y), updated_at: new Date().toISOString() }).eq('id', tokenId)
  if (error) return { error: 'Не удалось передвинуть токен.' }
  return { ok: true }
}

export async function savePortraitCrop(campaignId: string, portraitId: string, x: number, y: number, zoom: number) {
  const membership = await getMembership(campaignId)
  if (!membership || !canManage(membership.role)) return { error: 'Недостаточно прав.' }
  const admin = createAdminClient()
  const { data: portrait } = await admin.from('character_portraits').select('id, nodes!inner(campaign_id)').eq('id', portraitId).maybeSingle()
  const relation = (portrait as { nodes?: { campaign_id?: string } | { campaign_id?: string }[] } | null)?.nodes
  const portraitCampaignId = Array.isArray(relation) ? relation[0]?.campaign_id : relation?.campaign_id
  if (!portrait || portraitCampaignId !== campaignId) return { error: 'Портрет не найден.' }
  const safe = (v: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? v : min))
  const { error } = await admin.from('character_portraits').update({ crop_x: safe(x, 0, 1), crop_y: safe(y, 0, 1), crop_zoom: safe(zoom, 1, 4) }).eq('id', portraitId)
  return error ? { error: 'Не удалось сохранить кадрирование.' } : { ok: true }
}
