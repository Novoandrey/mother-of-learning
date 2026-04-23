import Link from 'next/link'
import { getCharacterFrontier } from '@/lib/loops'
import { createClient } from '@/lib/supabase/server'

type Props = {
  characterId: string
  loopId: string
  loopNumber: number
  campaignSlug: string
}

/**
 * Per-PC frontier card for the current loop (spec-009 US3, T020).
 *
 * Rendered on a character node's detail page only when the campaign has
 * a loop with status='current'. Shows "до дня N" + up to 3 most recent
 * session chips, or "ещё не играл" if the PC has no participated_in
 * edges to any session in this loop.
 *
 * Server component: fetches its own data so the caller just slots it in.
 */
export async function CharacterFrontierCard({
  characterId,
  loopId,
  loopNumber,
  campaignSlug,
}: Props) {
  const { frontier, sessionIds } = await getCharacterFrontier(characterId, loopId)

  // No play history in this loop — terse "ещё не играл" state.
  if (sessionIds.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
          Текущая петля
        </h2>
        <p className="text-sm text-gray-500">
          Петля {loopNumber}: ещё не играл в этой петле
        </p>
      </div>
    )
  }

  // Fetch minimal session details to (a) sort by day_to desc and
  // (b) render session_number chips. One query, bounded by sessionIds.
  const supabase = await createClient()
  const { data: sessionRows } = await supabase
    .from('nodes')
    .select('id, fields')
    .in('id', sessionIds)

  type SessionLite = { id: string; session_number: number; day_to: number | null }
  const sessions: SessionLite[] = (sessionRows ?? []).map((r) => {
    const f = (r.fields ?? {}) as Record<string, unknown>
    const sn = Number(f['session_number'] ?? 0)
    const dt = f['day_to']
    const dayTo =
      dt == null || dt === ''
        ? null
        : Number.isFinite(Number(dt))
        ? Math.trunc(Number(dt))
        : null
    return { id: r.id, session_number: sn, day_to: dayTo }
  })

  // Most-recent first: higher day_to wins; session_number as tie-break.
  sessions.sort((a, b) => {
    const ad = a.day_to ?? -Infinity
    const bd = b.day_to ?? -Infinity
    if (ad !== bd) return bd - ad
    return b.session_number - a.session_number
  })

  const top = sessions.slice(0, 3)
  const overflow = sessions.length - top.length

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
        Текущая петля
      </h2>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="text-gray-700">
          <span className="font-medium">Петля {loopNumber}:</span>{' '}
          {frontier != null ? (
            <>до дня <span className="font-medium">{frontier}</span></>
          ) : (
            <span className="text-gray-500">сыграны сессии без дат</span>
          )}
        </span>
        {top.map((s) => (
          <Link
            key={s.id}
            href={`/c/${campaignSlug}/sessions/${s.id}`}
            className="inline-flex items-center rounded bg-blue-50 px-1.5 py-0.5 text-xs font-mono text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-100 transition-colors"
          >
            #{s.session_number}
          </Link>
        ))}
        {overflow > 0 && (
          <span className="text-xs text-gray-400">+{overflow}</span>
        )}
      </div>
    </div>
  )
}
