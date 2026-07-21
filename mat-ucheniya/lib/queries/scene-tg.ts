import type { SupabaseClient } from '@supabase/supabase-js'

export type SceneSpeaker = { characterId: string; title: string }

export type SceneMessage = {
  id: string
  speakerKind: 'character' | 'dm'
  speakerName: string
  messageKind: 'speech' | 'description'
  body: string
  createdAt: string
}

export type ActiveSceneRoom = {
  id: string
  title: string
  speakers: SceneSpeaker[]
  messages: SceneMessage[]
}

/** Reads the one active room for the Mini App. All rows remain RLS-scoped. */
export async function getActiveSceneRoomTg(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<ActiveSceneRoom | null> {
  const { data: room, error: roomError } = await supabase
    .from('scene_rooms')
    .select('id, title')
    .eq('campaign_id', campaignId)
    .eq('is_active', true)
    .maybeSingle()
  if (roomError) throw roomError
  if (!room) return null

  const [{ data: speakers, error: speakersError }, { data: messages, error: messagesError }] = await Promise.all([
    supabase
      .from('scene_room_speakers')
      .select('character_node_id, nodes!inner(id, title)')
      .eq('room_id', room.id)
      .order('added_at'),
    supabase
      .from('scene_messages')
      .select('id, speaker_kind, speaker_character_id, message_kind, body, created_at, nodes(title)')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  ])
  if (speakersError) throw speakersError
  if (messagesError) throw messagesError

  type SpeakerRow = { character_node_id: string; nodes: { id: string; title: string } | { id: string; title: string }[] }
  type MessageRow = {
    id: string
    speaker_kind: 'character' | 'dm'
    message_kind: 'speech' | 'description'
    body: string
    created_at: string
    nodes: { title: string } | { title: string }[] | null
  }
  const toOne = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? (value[0] ?? null) : value

  return {
    id: room.id,
    title: room.title,
    speakers: ((speakers ?? []) as SpeakerRow[]).map((speaker) => ({
      characterId: speaker.character_node_id,
      title: toOne(speaker.nodes)?.title ?? 'Персонаж',
    })),
    messages: ((messages ?? []) as MessageRow[]).map((message) => ({
      id: message.id,
      speakerKind: message.speaker_kind,
      speakerName: message.speaker_kind === 'dm' ? 'ДМ / окружение' : (toOne(message.nodes)?.title ?? 'Персонаж'),
      messageKind: message.message_kind,
      body: message.body,
      createdAt: message.created_at,
    })),
  }
}
