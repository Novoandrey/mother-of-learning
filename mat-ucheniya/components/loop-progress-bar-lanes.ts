/**
 * Lane assignment for overlapping intervals (spec-009 T014).
 *
 * Given a set of sessions with [day_from, day_to] (inclusive) ranges,
 * assigns each to a "lane" (0-indexed row) so that no two sessions in
 * the same lane overlap. Uses the classic greedy interval-colouring
 * algorithm:
 *
 *   1. Sort by day_from ASC, day_to ASC (tie-breaker).
 *   2. For each session, pick the first existing lane whose last
 *      session ended strictly before this session's day_from. If none
 *      fits, open a new lane.
 *
 * Result: minimum lane count = maximum simultaneous overlap. Stable
 * and deterministic — sessions at the same day_from get placed in
 * lane order by day_to.
 *
 * Pure: no React, no Supabase, no side effects. Easy to eyeball.
 */
export type LaneAssignmentInput = {
  id: string
  day_from: number
  day_to: number
}

export type LaneAssignmentResult = {
  laneById: Map<string, number>
  laneCount: number
}

export function assignLanes(sessions: LaneAssignmentInput[]): LaneAssignmentResult {
  const laneById = new Map<string, number>()
  if (sessions.length === 0) return { laneById, laneCount: 0 }

  // Sort copy — don't mutate caller's array.
  const sorted = [...sessions].sort((a, b) => {
    if (a.day_from !== b.day_from) return a.day_from - b.day_from
    return a.day_to - b.day_to
  })

  // laneEndDay[i] = the largest day_to currently occupying lane i.
  // A new session fits in lane i iff its day_from > laneEndDay[i].
  const laneEndDay: number[] = []

  for (const s of sorted) {
    let placed = -1
    for (let i = 0; i < laneEndDay.length; i++) {
      if (laneEndDay[i] < s.day_from) {
        placed = i
        laneEndDay[i] = s.day_to
        break
      }
    }
    if (placed === -1) {
      placed = laneEndDay.length
      laneEndDay.push(s.day_to)
    }
    laneById.set(s.id, placed)
  }

  return { laneById, laneCount: laneEndDay.length }
}
