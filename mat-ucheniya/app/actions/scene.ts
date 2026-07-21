'use server'

import { getCurrentUser, getMembership } from '@/lib/auth'
import {
  isSceneMessageKind,
  isSceneSpeakerKind,
  normalizeSceneBody,
} from '@/lib/scene-validation'
import { createAdminClient } from '@/lib/supabase/admin'

type Result = { ok: true; roomId?: string } | { ok: false; error: string }

/** First room for a campaign. During the testing release any member may open it. */
export async function createInitialSceneRoom(campaignId: string, input?: { title?: string; backgroundAssetId?: string | null; crop?: { x: number; y: number; zoom: number } }): Promise<Result> {
  const [user, membership] = await Promise.all([getCurrentUser(), getMembership(campaignId)])
  if (!user || !membership) return { ok: false, error: 'Нет доступа к кампании.' }

  const admin = createAdminClient()
  const title = input?.title?.trim() || 'Общая сцена'
  if (title.length > 160) return { ok: false, error: 'Название комнаты длиннее 160 знаков.' }
  const crop = input?.crop ?? { x: 50, y: 50, zoom: 1 }
  if (![crop.x, crop.y, crop.zoom].every(Number.isFinite) || crop.x < 0 || crop.x > 100 || crop.y < 0 || crop.y > 100 || crop.zoom < 1 || crop.zoom > 3) return { ok: false, error: 'Некорректная обрезка фона.' }
  if (input?.backgroundAssetId) {
    const { data: asset } = await admin.from('media_assets').select('id').eq('id', input.backgroundAssetId).eq('campaign_id', campaignId).maybeSingle()
    if (!asset) return { ok: false, error: 'Выбранный фон не принадлежит кампании.' }
  }
  const { data: existing } = await admin
    .from('scene_rooms')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .maybeSingle()
  if (existing) return { ok: true, roomId: existing.id }

  const { data: room, error: roomError } = await admin
    .from('scene_rooms')
    .insert({ campaign_id: campaignId, title, created_by: user.id, background_asset_id: input?.backgroundAssetId ?? null, background_mobile_crop: crop })
    .select('id')
    .single()
  if (roomError || !room) return { ok: false, error: 'Не удалось открыть комнату.' }

  const { data: characters } = await admin
    .from('nodes')
    .select('id, node_types!inner(slug)')
    .eq('campaign_id', campaignId)
    .eq('node_types.slug', 'character')
  const rows = (characters ?? []).map((character) => ({ room_id: room.id, character_node_id: character.id }))
  if (rows.length > 0) {
    const { error: speakersError } = await admin.from('scene_room_speakers').insert(rows)
    if (speakersError) {
      await admin.from('scene_rooms').delete().eq('id', room.id)
      return { ok: false, error: 'Не удалось открыть комнату с персонажами.' }
    }
  }
  return { ok: true, roomId: room.id }
}

export async function sendSceneMessage(input: {
  roomId: string
  speakerKind: 'character' | 'dm'
  characterId?: string
  messageKind: 'speech' | 'description'
  body: string
}): Promise<Result> {
  const body = normalizeSceneBody(input.body)
  if (!body) return { ok: false, error: 'Напишите сообщение от 1 до 8 000 знаков.' }
  if (!isSceneSpeakerKind(input.speakerKind) || !isSceneMessageKind(input.messageKind)) {
    return { ok: false, error: 'Некорректный тип сообщения.' }
  }

  const admin = createAdminClient()
  const { data: room } = await admin
    .from('scene_rooms')
    .select('campaign_id, is_active')
    .eq('id', input.roomId)
    .maybeSingle()
  if (!room || !room.is_active) return { ok: false, error: 'Комната не найдена или закрыта.' }

  const [user, membership] = await Promise.all([getCurrentUser(), getMembership(room.campaign_id)])
  if (!user || !membership) return { ok: false, error: 'Нет доступа к комнате.' }

  let speakerCharacterId: string | null = null
  if (input.speakerKind === 'character') {
    if (!input.characterId) return { ok: false, error: 'Выберите персонажа.' }
    const { data: permitted } = await admin
      .from('scene_room_speakers')
      .select('character_node_id')
      .eq('room_id', input.roomId)
      .eq('character_node_id', input.characterId)
      .maybeSingle()
    if (!permitted) return { ok: false, error: 'Этот персонаж не добавлен в комнату.' }
    speakerCharacterId = input.characterId
  }

  const { error } = await admin.from('scene_messages').insert({
    room_id: input.roomId,
    author_user_id: user.id,
    speaker_kind: input.speakerKind,
    speaker_character_id: speakerCharacterId,
    message_kind: input.messageKind,
    body,
  })
  if (error) return { ok: false, error: 'Не удалось отправить сообщение.' }
  return { ok: true }
}
