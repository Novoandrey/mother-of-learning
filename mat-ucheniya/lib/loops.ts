import { createClient } from '@/lib/supabase/server'

export type Loop = {
  id: string
  number: number
  title: string
  status: 'past' | 'current' | 'future'
  notes: string
}

export type Session = {
  id: string
  loop_number: number | null
  session_number: number
  title: string
  recap: string
  dm_notes: string
  game_date: string | null
  played_at: string | null
}

// Helper: get node_type id by slug for a campaign
async function getNodeTypeId(campaignId: string, slug: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', slug)
    .single()
  return data?.id ?? null
}

export async function getLoopNodeTypeId(campaignId: string) {
  return getNodeTypeId(campaignId, 'loop')
}

export async function getSessionNodeTypeId(campaignId: string) {
  return getNodeTypeId(campaignId, 'session')
}

// Map a node row to a Loop
function nodeToLoop(node: any): Loop {
  return {
    id: node.id,
    number: Number(node.fields?.number ?? 0),
    title: node.title,
    status: (node.fields?.status as Loop['status']) ?? 'past',
    notes: node.content ?? '',
  }
}

// Map a node row to a Session
function nodeToSession(node: any): Session {
  const f = node.fields ?? {}
  return {
    id: node.id,
    session_number: Number(f.session_number ?? 0),
    loop_number: f.loop_number != null && f.loop_number !== '' ? Number(f.loop_number) : null,
    title: node.title,
    recap: f.recap ?? '',
    dm_notes: f.dm_notes ?? '',
    game_date: f.game_date || null,
    played_at: f.played_at || null,
  }
}

export async function getLoops(campaignId: string): Promise<Loop[]> {
  const supabase = await createClient()
  const typeId = await getLoopNodeTypeId(campaignId)
  if (!typeId) return []

  const { data } = await supabase
    .from('nodes')
    .select('id, title, fields, content')
    .eq('campaign_id', campaignId)
    .eq('type_id', typeId)
    .order('created_at', { ascending: true })

  if (!data) return []

  return data
    .map(nodeToLoop)
    .sort((a, b) => a.number - b.number)
}

export async function getCurrentLoop(campaignId: string): Promise<Loop | null> {
  const loops = await getLoops(campaignId)
  return loops.find((l) => l.status === 'current') ?? null
}

export async function getSessionsByLoop(
  campaignId: string,
  loopNumber: number | null
): Promise<Session[]> {
  const supabase = await createClient()
  const typeId = await getSessionNodeTypeId(campaignId)
  if (!typeId) return []

  const { data } = await supabase
    .from('nodes')
    .select('id, title, fields, content')
    .eq('campaign_id', campaignId)
    .eq('type_id', typeId)

  if (!data) return []

  return data
    .map(nodeToSession)
    .filter((s) => {
      if (loopNumber === null) return s.loop_number === null
      return s.loop_number === loopNumber
    })
    .sort((a, b) => a.session_number - b.session_number)
}

export async function getAllSessions(campaignId: string): Promise<Session[]> {
  const supabase = await createClient()
  const typeId = await getSessionNodeTypeId(campaignId)
  if (!typeId) return []

  const { data } = await supabase
    .from('nodes')
    .select('id, title, fields, content')
    .eq('campaign_id', campaignId)
    .eq('type_id', typeId)

  if (!data) return []

  return data
    .map(nodeToSession)
    .sort((a, b) => a.session_number - b.session_number)
}

export async function getSessionById(id: string): Promise<Session | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nodes')
    .select('id, title, fields, content')
    .eq('id', id)
    .single()

  if (!data) return null
  return nodeToSession(data)
}
