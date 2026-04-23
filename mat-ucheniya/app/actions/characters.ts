'use server'

import { getMembership } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { unwrapMany } from '@/lib/supabase/joins'

export type CampaignPC = {
  id: string
  title: string
  owner_display_name: string | null
}

/**
 * List the campaign's PCs (character nodes that have at least one
 * owner in `node_pc_owners`) along with a display name for the
 * "first" owner — suitable for a participants picker.
 *
 * - Membership-gated.
 * - Inner join semantics on `node_pc_owners` via `!inner` embed —
 *   PCs with zero owners are NOT returned.
 * - Left join to `user_profiles` for the owner label; falls back to
 *   `login` if no display_name is set; null if neither available.
 * - Multi-owner PCs: one row is returned, the owner label picks
 *   the first (by insertion into node_pc_owners).
 * - Sorted by title (Russian-locale).
 */
export async function getCampaignPCs(campaignId: string): Promise<CampaignPC[]> {
  const membership = await getMembership(campaignId)
  if (!membership) return []

  const admin = createAdminClient()

  // Resolve the campaign's character node_type id.
  const { data: charType } = await admin
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'character')
    .maybeSingle()

  if (!charType) return []

  // PCs + all their owners (inner join excludes ownerless PCs).
  const { data: pcs } = await admin
    .from('nodes')
    .select('id, title, owners:node_pc_owners!inner(user_id, created_at)')
    .eq('campaign_id', campaignId)
    .eq('type_id', charType.id)

  if (!pcs || pcs.length === 0) return []

  type OwnerRow = { user_id: string; created_at: string }
  type PcRow = {
    id: string
    title: string
    owners: OwnerRow | OwnerRow[] | null
  }

  // First owner per PC (earliest created_at).
  const firstOwnerByPc = new Map<string, string>()
  const allOwnerIds = new Set<string>()

  for (const pc of pcs as PcRow[]) {
    const owners = unwrapMany(pc.owners).slice().sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    )
    if (owners.length === 0) continue
    firstOwnerByPc.set(pc.id, owners[0].user_id)
    for (const o of owners) allOwnerIds.add(o.user_id)
  }

  // Single profile lookup for all owners we care about.
  let profileMap = new Map<string, { display_name: string | null; login: string }>()
  if (allOwnerIds.size > 0) {
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('user_id, display_name, login')
      .in('user_id', Array.from(allOwnerIds))
    profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.user_id,
        { display_name: p.display_name ?? null, login: p.login },
      ]),
    )
  }

  const rows: CampaignPC[] = (pcs as PcRow[])
    .filter((pc) => firstOwnerByPc.has(pc.id))
    .map((pc) => {
      const ownerId = firstOwnerByPc.get(pc.id)!
      const profile = profileMap.get(ownerId)
      const label = profile?.display_name?.trim() || profile?.login || null
      return { id: pc.id, title: pc.title, owner_display_name: label }
    })

  rows.sort((a, b) => a.title.localeCompare(b.title, 'ru'))
  return rows
}
