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
      "Base edge_type 'participated_in' not found — did migration 032 run?",
    )
  }
  cachedParticipatedInId = data.id
  return data.id
}

/**
 * Replace the `participated_in` edge set for a session with the given
 * list of character ids (the "pack").
 *
 * Algorithm:
 *   1. Resolve session.campaign_id and check membership.
 *   2. Delete all existing `participated_in` edges where
 *      source_id = sessionId (clears stale participants).
 *   3. Insert new edges for each unique characterId. Uses upsert with
 *      `onConflict: 'source_id,target_id,type_id'` so concurrent
 *      writes or accidental duplicates are a no-op.
 *   4. Invalidate the sidebar cache (session title doesn't change,
 *      but participant-aware UI surfaces — progress bar, PC frontier —
 *      do, and the sidebar is the cheapest reset surface).
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
  if (sessionErr || !session) throw new Error('Session not found')

  const campaignId = session.campaign_id as string

  // 2. Membership check — only campaign members may edit the pack.
  const membership = await getMembership(campaignId)
  if (!membership) throw new Error('Forbidden')

  const participatedInId = await resolveParticipatedInId()

  // 3. Clear existing participated_in edges for this session.
  const { error: delErr } = await admin
    .from('edges')
    .delete()
    .eq('source_id', sessionId)
    .eq('type_id', participatedInId)
  if (delErr) throw new Error(`Failed to clear participants: ${delErr.message}`)

  // 4. Insert new participants (deduped).
  const uniqueIds = Array.from(new Set(characterIds.filter(Boolean)))
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
    if (upErr) throw new Error(`Failed to add participants: ${upErr.message}`)
  }

  // 5. Invalidate sidebar cache.
  invalidateSidebar(campaignId)
}
