'use server'

import { getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateSidebar } from '@/lib/sidebar-cache'

// Module-scoped cache. `participated_in` is a base edge_type
// (campaign_id=null), so its id is stable across all requests.
let cachedParticipatedInId: string | null = null

async function resolveParticipatedInId(): Promise<string> {
  if (cachedParticipatedInId) return cachedParticipatedInId
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('edge_types')
    .select('id')
    .eq('slug', 'participated_in')
    .eq('is_base', true)
    .single()
  if (error || !data) {
    throw new Error(
      'Базовый тип связи participated_in не найден — миграция 032 применена?',
    )
  }
  cachedParticipatedInId = data.id
  return data.id
}

/**
 * Replace the `participated_in` edge set for a session with the given
 * list of character ids (the "pack").
 *
 * Algorithm (upsert-then-delete-stale, not delete-then-insert):
 *   1. Resolve session.campaign_id and check membership.
 *   2. Upsert new participants first — `onConflict` makes this
 *      idempotent, and any concurrent reader sees at worst
 *      the old-set UNION new-set, never an empty pack.
 *   3. Delete stale edges whose target_id is NOT in the new set.
 *   4. Invalidate the sidebar cache.
 *
 * Comparison to the previous delete-then-insert approach: that one had
 * a short window where a parallel reader would observe zero
 * participants. With upsert-first, the only visible anomaly under
 * concurrent writes is "the other DM's picks are still there
 * momentarily" — strictly better UX.
 *
 * True atomicity (last-write-wins resolved at the DB level) would
 * require a Postgres function with explicit locking; tracked as a
 * follow-up if it becomes a real problem.
 *
 * RLS is the hard boundary: the admin client writes, but the
 * membership check gates it.
 */
export async function updateSessionParticipants(
  sessionId: string,
  characterIds: string[],
): Promise<void> {
  if (!sessionId) throw new Error('sessionId is required')

  const admin = createAdminClient()

  // 1. Resolve the session's campaign.
  const { data: session, error: sessionErr } = await admin
    .from('nodes')
    .select('campaign_id')
    .eq('id', sessionId)
    .single()
  if (sessionErr || !session) throw new Error('Сессия не найдена')

  const campaignId = session.campaign_id as string

  // 2. Membership check — only campaign members may edit the pack.
  const membership = await getMembership(campaignId)
  if (!membership) throw new Error('Нет доступа к кампании')

  const participatedInId = await resolveParticipatedInId()
  const uniqueIds = Array.from(new Set(characterIds.filter(Boolean)))

  // 3. Upsert new participants first (idempotent via the unique
  //    constraint on source_id+target_id+type_id). Do this BEFORE the
  //    delete so a concurrent reader never sees a pack temporarily
  //    empty during the swap.
  if (uniqueIds.length > 0) {
    const rows = uniqueIds.map((cid) => ({
      campaign_id: campaignId,
      source_id: sessionId,
      target_id: cid,
      type_id: participatedInId,
    }))
    const { error: upErr } = await admin
      .from('edges')
      .upsert(rows, { onConflict: 'source_id,target_id,type_id' })
    if (upErr) throw new Error(`Не удалось добавить участников: ${upErr.message}`)
  }

  // 4. Delete stale participants — everything in this session's
  //    participated_in set that is NOT in the new list.
  //    `.not('col', 'in', '(v1,v2)')` is the PostgREST syntax for
  //    NOT IN; uuids are safe to interpolate as-is (hex-and-dash).
  let delQ = admin
    .from('edges')
    .delete()
    .eq('source_id', sessionId)
    .eq('type_id', participatedInId)
  if (uniqueIds.length > 0) {
    delQ = delQ.not('target_id', 'in', `(${uniqueIds.join(',')})`)
  }
  const { error: delErr } = await delQ
  if (delErr) throw new Error(`Не удалось удалить участников: ${delErr.message}`)

  // 5. Invalidate sidebar cache.
  invalidateSidebar(campaignId)
}
