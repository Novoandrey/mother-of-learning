import { createClient } from '@/lib/supabase/server'
import { unwrapOne } from '@/lib/supabase/joins'
import { DEFAULT_LOOP_LENGTH_DAYS, parseLengthDays } from './loop-length'

// Re-export for back-compat with existing call sites. The pure helpers
// live in `loop-length.ts` so client code can import them without
// pulling in `next/headers` via the server Supabase client.
export { DEFAULT_LOOP_LENGTH_DAYS, parseLengthDays }

export type Loop = {
  id: string
  number: number
  title: string
  status: 'past' | 'current' | 'future'
  notes: string
  length_days: number
}

export type SessionParticipant = {
  id: string
  title: string
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
  day_from: number | null
  day_to: number | null
  participants: SessionParticipant[]
  content: string
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

// ─── Base edge_type id caching ──────────────────────────────────────────
// `contains` and `participated_in` are global (is_base=true, campaign_id=null).
// Their ids never change, so cache them module-scoped to avoid repeat lookups.
// On first use per server process we resolve them; subsequent calls hit memory.

let cachedContainsId: string | null = null
let cachedParticipatedInId: string | null = null

async function getContainsEdgeTypeId(): Promise<string> {
  if (cachedContainsId) return cachedContainsId
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('edge_types')
    .select('id')
    .eq('slug', 'contains')
    .eq('is_base', true)
    .single()
  if (error || !data) {
    throw new Error("Base edge_type 'contains' not found (migration 001 missing?)")
  }
  cachedContainsId = data.id
  return data.id
}

async function getParticipatedInEdgeTypeId(): Promise<string> {
  if (cachedParticipatedInId) return cachedParticipatedInId
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('edge_types')
    .select('id')
    .eq('slug', 'participated_in')
    .eq('is_base', true)
    .single()
  if (error || !data) {
    throw new Error(
      "Base edge_type 'participated_in' not found (migration 032 missing?)",
    )
  }
  cachedParticipatedInId = data.id
  return data.id
}

// Raw shape returned by Supabase for loop/session node rows.
type NodeRow = {
  id: string
  title: string
  fields: Record<string, unknown> | null
  content?: string | null
}

// Parse a day field value (day_from / day_to) from fields jsonb.
// Accepts integer, numeric string, or empty/missing ⇒ null.
function parseDay(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) ? Math.trunc(n) : null
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
    length_days: parseLengthDays(fields['length_days']),
  }
}

// Map a node row to a Session. Participants default to [] and are injected
// by the caller after hydration.
function nodeToSession(
  node: NodeRow,
  participants: SessionParticipant[] = [],
): Session {
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
    day_from: parseDay(f['day_from']),
    day_to: parseDay(f['day_to']),
    participants,
    content: node.content ?? '',
  }
}

// ─── Participants hydration ─────────────────────────────────────────────
// Single query: all participated_in edges whose source is in the requested
// session set, joined with target node (id, title). Returns a Map for O(1)
// lookup by session id. Sessions with zero participants are NOT in the map;
// callers must default to [].

async function hydrateParticipants(
  sessionIds: string[],
): Promise<Map<string, SessionParticipant[]>> {
  const result = new Map<string, SessionParticipant[]>()
  if (sessionIds.length === 0) return result

  const supabase = await createClient()
  const typeId = await getParticipatedInEdgeTypeId()

  const { data } = await supabase
    .from('edges')
    .select('source_id, target:nodes!target_id(id, title)')
    .eq('type_id', typeId)
    .in('source_id', sessionIds)

  if (!data) return result

  type EdgeRow = {
    source_id: string
    target: SessionParticipant | SessionParticipant[] | null
  }

  for (const row of data as EdgeRow[]) {
    const target = unwrapOne(row.target)
    if (!target) continue
    const arr = result.get(row.source_id) ?? []
    arr.push({ id: target.id, title: target.title })
    result.set(row.source_id, arr)
  }

  // Stable order inside each pack: by title, tie-broken by id so two
  // PCs with the same title render in a deterministic order across
  // reloads (Postgres doesn't guarantee the row order without
  // ORDER BY, so without the tie-break the tooltip list can shuffle).
  for (const arr of result.values()) {
    arr.sort(
      (a, b) => a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id),
    )
  }

  return result
}

function injectParticipants(
  sessions: Session[],
  map: Map<string, SessionParticipant[]>,
): Session[] {
  return sessions.map((s) => ({
    ...s,
    participants: map.get(s.id) ?? [],
  }))
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
  loopNumber: number | null,
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

  const sessions = data
    .map((n) => nodeToSession(n))
    .filter((s) => {
      if (loopNumber === null) return s.loop_number === null
      return s.loop_number === loopNumber
    })
    .sort((a, b) => a.session_number - b.session_number)

  const participants = await hydrateParticipants(sessions.map((s) => s.id))
  return injectParticipants(sessions, participants)
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

  const sessions = data
    .map((n) => nodeToSession(n))
    .sort((a, b) => a.session_number - b.session_number)

  const participants = await hydrateParticipants(sessions.map((s) => s.id))
  return injectParticipants(sessions, participants)
}

export async function getSessionById(id: string): Promise<Session | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('nodes')
    .select('id, title, fields, content')
    .eq('id', id)
    .single()

  if (!data) return null

  const participantsMap = await hydrateParticipants([id])
  return nodeToSession(data, participantsMap.get(id) ?? [])
}

// ─── Frontier helpers (T005) ────────────────────────────────────────────

/**
 * Loop frontier: the largest `day_to` across all sessions contained in
 * the loop. null ⇒ no dated sessions yet. Single round-trip via
 * `contains` edge embed.
 *
 * ⚠️ Invariant assumed: a session's `loop_number` field and its
 * `contains` edge from the parent loop are kept in sync by the write
 * path — see `use-node-form.handleSubmit` which rewrites the contains
 * edge on every session save. Pages that filter sessions by
 * `loop_number` (the catalog/loops page) and this helper (which
 * traverses `contains` edges) will therefore agree. If a future write
 * path bypasses `use-node-form`, it MUST also maintain the edge or
 * the frontier will drift.
 */
export async function getLoopFrontier(loopId: string): Promise<number | null> {
  const supabase = await createClient()
  const containsId = await getContainsEdgeTypeId()

  const { data } = await supabase
    .from('edges')
    .select('target:nodes!target_id(fields)')
    .eq('source_id', loopId)
    .eq('type_id', containsId)

  if (!data) return null

  type EdgeRow = {
    target:
      | { fields: Record<string, unknown> | null }
      | Array<{ fields: Record<string, unknown> | null }>
      | null
  }

  let max: number | null = null
  for (const row of data as EdgeRow[]) {
    const target = unwrapOne(row.target)
    if (!target) continue
    const d = parseDay(target.fields?.['day_to'])
    if (d == null) continue
    if (max == null || d > max) max = d
  }
  return max
}

/**
 * Per-PC frontier within a single loop: the largest `day_to` among the
 * sessions where this PC is a participant AND which belong to this loop.
 *
 * Returns the frontier number plus the list of qualifying sessions
 * (id + session_number + day_to). The UI uses session_number for
 * chip labels; day_to is returned so the caller can sort most-recent-
 * first without a second round-trip.
 *
 * Two chained queries:
 *   1. sessions contained in the loop (via `contains` edges);
 *   2. of those, sessions where the PC is a participated_in target,
 *      plus their fields via embedded node select.
 */
export type CharacterFrontierSession = {
  id: string
  session_number: number
  day_to: number | null
}

export async function getCharacterFrontier(
  characterId: string,
  loopId: string,
): Promise<{
  frontier: number | null
  sessions: CharacterFrontierSession[]
}> {
  const supabase = await createClient()
  const containsId = await getContainsEdgeTypeId()
  const participatedInId = await getParticipatedInEdgeTypeId()

  // Q1: session ids in loop.
  const { data: loopEdges } = await supabase
    .from('edges')
    .select('target_id')
    .eq('source_id', loopId)
    .eq('type_id', containsId)

  const loopSessionIds = (loopEdges ?? []).map((r) => r.target_id as string)
  if (loopSessionIds.length === 0) {
    return { frontier: null, sessions: [] }
  }

  // Q2: participated_in edges for this PC, scoped to those sessions,
  //      with the session node's fields embedded to aggregate day_to
  //      and surface session_number for UI chips.
  const { data: pcEdges } = await supabase
    .from('edges')
    .select('source_id, session:nodes!source_id(fields)')
    .eq('type_id', participatedInId)
    .eq('target_id', characterId)
    .in('source_id', loopSessionIds)

  if (!pcEdges || pcEdges.length === 0) {
    return { frontier: null, sessions: [] }
  }

  type Row = {
    source_id: string
    session:
      | { fields: Record<string, unknown> | null }
      | Array<{ fields: Record<string, unknown> | null }>
      | null
  }

  let frontier: number | null = null
  const sessions: CharacterFrontierSession[] = []
  for (const row of pcEdges as Row[]) {
    const session = unwrapOne(row.session)
    const fields = session?.fields ?? null
    const sn = Number(fields?.['session_number'] ?? 0)
    const d = parseDay(fields?.['day_to'])
    sessions.push({ id: row.source_id, session_number: sn, day_to: d })
    if (d == null) continue
    if (frontier == null || d > frontier) frontier = d
  }

  return { frontier, sessions }
}
