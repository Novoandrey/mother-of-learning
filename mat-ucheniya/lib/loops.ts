import { createClient } from '@/lib/supabase/server'

export type Loop = {
  id: string
  number: number
  title: string | null
  status: 'past' | 'current' | 'future'
  notes: string | null
  started_at: string | null
  ended_at: string | null
}

export type Session = {
  id: string
  loop_number: number | null
  session_number: number
  title: string | null
  recap: string
  dm_notes: string
  game_date: string | null
  played_at: string | null
}

export async function getLoops(campaignId: string): Promise<Loop[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('loops')
    .select('id, number, title, status, notes, started_at, ended_at')
    .eq('campaign_id', campaignId)
    .order('number')
  return (data as Loop[]) ?? []
}

export async function getCurrentLoop(campaignId: string): Promise<Loop | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('loops')
    .select('id, number, title, status, notes, started_at, ended_at')
    .eq('campaign_id', campaignId)
    .eq('status', 'current')
    .single()
  return data as Loop | null
}

export async function getSessionsByLoop(
  campaignId: string,
  loopNumber: number | null
): Promise<Session[]> {
  const supabase = await createClient()
  let query = supabase
    .from('sessions')
    .select('id, loop_number, session_number, title, recap, dm_notes, game_date, played_at')
    .eq('campaign_id', campaignId)
    .order('session_number')

  if (loopNumber === null) {
    query = query.is('loop_number', null)
  } else {
    query = query.eq('loop_number', loopNumber)
  }

  const { data } = await query
  return (data as Session[]) ?? []
}

export async function getAllSessions(campaignId: string): Promise<Session[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sessions')
    .select('id, loop_number, session_number, title, recap, dm_notes, game_date, played_at')
    .eq('campaign_id', campaignId)
    .order('session_number')
  return (data as Session[]) ?? []
}

export async function getSessionById(id: string): Promise<Session | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('sessions')
    .select('id, loop_number, session_number, title, recap, dm_notes, game_date, played_at')
    .eq('id', id)
    .single()
  return data as Session | null
}
