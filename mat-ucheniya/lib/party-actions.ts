'use client'

import { createClient } from '@/lib/supabase/client'

export type PartyMember = {
  id: string
  party_id: string
  node_id: string | null
  display_name: string
  max_hp: number
  sort_order: number
}

// Get or create the party for a campaign, returns members
export async function getParty(campaignId: string): Promise<{ partyId: string; members: PartyMember[] }> {
  const supabase = createClient()

  // Upsert party row
  const { data: party, error: partyError } = await supabase
    .from('party')
    .upsert({ campaign_id: campaignId }, { onConflict: 'campaign_id' })
    .select()
    .single()

  if (partyError) throw partyError

  const { data: members, error: membersError } = await supabase
    .from('party_members')
    .select('*')
    .eq('party_id', party.id)
    .order('sort_order')

  if (membersError) throw membersError

  return { partyId: party.id, members: members ?? [] }
}

export async function addPartyMember(
  partyId: string,
  displayName: string,
  maxHp: number,
  nodeId: string | null
): Promise<PartyMember> {
  const supabase = createClient()

  // Get current max sort_order
  const { data: existing } = await supabase
    .from('party_members')
    .select('sort_order')
    .eq('party_id', partyId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

  const { data, error } = await supabase
    .from('party_members')
    .insert({ party_id: partyId, display_name: displayName, max_hp: maxHp, node_id: nodeId, sort_order: nextOrder })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updatePartyMember(
  memberId: string,
  fields: { display_name?: string; max_hp?: number }
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('party_members')
    .update(fields)
    .eq('id', memberId)
  if (error) throw error
}

export async function removePartyMember(memberId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('party_members')
    .delete()
    .eq('id', memberId)
  if (error) throw error
}

// Add all party members to an encounter as participants (role='pc')
export async function addPartyToEncounter(encounterId: string, members: PartyMember[]) {
  if (members.length === 0) return
  const supabase = createClient()

  const rows = members.map((m) => ({
    encounter_id: encounterId,
    node_id: m.node_id,
    display_name: m.display_name,
    max_hp: m.max_hp,
    current_hp: m.max_hp,
    role: 'pc',
    sort_order: m.sort_order,
  }))

  const { error } = await supabase.from('encounter_participants').insert(rows)
  if (error) throw error
}
