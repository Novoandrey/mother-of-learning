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

// Raw shape returned by Supabase for loop/session node rows.
type NodeRow = {
  id: string
  title: string
  fields: Record<string, unknown> | null
  content?: string | null
}

// Map a node row to a Loop
function nodeToLoop(node: NodeRow): Loop {
  const fields = node.fields ?? {}
  const number = fields['number']
  const status = fields['status']
  return {
    id: node.id,
    number: Number(number ?? 0),
    title: node.title,
    status: (typeof status === 'string' ? status : 'past') as Loop['status'],
    notes: node.content ?? '',
  }
}

// Map a node row to a Session
function nodeToSession(node: NodeRow): Session {
  const f = node.fields ?? {}
  const session_number = f['session_number']
  const loop_number = f['loop_number']
  const recap = f['recap']
  const dm_notes = f['dm_notes']
  const game_date = f['game_date']
  const played_at = f['played_at']
  return {
    id: node.id,
    session_number: Number(session_number ?? 0),
    loop_number:
      loop_number != null && loop_number !== '' ? Number(loop_number) : null,
    title: node.title,
    recap: typeof recap === 'string' ? recap : '',
    dm_notes: typeof dm_notes === 'string' ? dm_notes : '',
    game_date: typeof game_date === 'string' && game_date ? game_date : null,
    played_at: typeof played_at === 'string' && played_at ? played_at : null,
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
