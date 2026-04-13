'use client'

import { createClient } from '@/lib/supabase/client'

// ── Encounters ──────────────────────────────────────────────

export async function createEncounter(campaignId: string, title: string) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('encounters')
    .insert({ campaign_id: campaignId, title })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateEncounterStatus(
  encounterId: string,
  status: 'active' | 'completed'
) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounters')
    .update({ status })
    .eq('id', encounterId)
  if (error) throw error
}

export async function updateRound(encounterId: string, round: number) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounters')
    .update({ current_round: Math.max(1, round) })
    .eq('id', encounterId)
  if (error) throw error
}

// ── Participants ────────────────────────────────────────────

export async function addParticipantFromCatalog(
  encounterId: string,
  nodeId: string,
  displayName: string,
  maxHp: number,
  quantity: number
) {
  const supabase = createClient()
  const rows = Array.from({ length: quantity }, (_, i) => ({
    encounter_id: encounterId,
    node_id: nodeId,
    display_name: quantity === 1 ? displayName : `${displayName} ${i + 1}`,
    max_hp: maxHp,
    current_hp: maxHp,
  }))
  const { data, error } = await supabase
    .from('encounter_participants')
    .insert(rows)
    .select()
  if (error) throw error
  return data
}

export async function addParticipantManual(
  encounterId: string,
  displayName: string,
  maxHp: number
) {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('encounter_participants')
    .insert({
      encounter_id: encounterId,
      display_name: displayName,
      max_hp: maxHp,
      current_hp: maxHp,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateInitiative(participantId: string, initiative: number | null) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ initiative })
    .eq('id', participantId)
  if (error) throw error
}

export async function updateHp(participantId: string, currentHp: number) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ current_hp: currentHp })
    .eq('id', participantId)
  if (error) throw error
}

export async function updateMaxHp(participantId: string, maxHp: number, currentHp: number) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ max_hp: maxHp, current_hp: currentHp })
    .eq('id', participantId)
  if (error) throw error
}

export async function updateParticipantName(participantId: string, displayName: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ display_name: displayName })
    .eq('id', participantId)
  if (error) throw error
}

export async function toggleParticipantActive(participantId: string, isActive: boolean) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ is_active: isActive })
    .eq('id', participantId)
  if (error) throw error
}

export async function deleteParticipant(participantId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .delete()
    .eq('id', participantId)
  if (error) throw error
}

export async function updateConditions(participantId: string, conditions: string[]) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ conditions })
    .eq('id', participantId)
  if (error) throw error
}

export async function updateRole(participantId: string, role: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ role })
    .eq('id', participantId)
  if (error) throw error
}

export async function updateTempHp(participantId: string, tempHp: number) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ temp_hp: tempHp })
    .eq('id', participantId)
  if (error) throw error
}

export async function updateEffects(participantId: string, effects: string[]) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ effects })
    .eq('id', participantId)
  if (error) throw error
}

// Clone participant: original gets " 1" suffix, clone gets " 2" with full HP, no conditions/effects
export async function cloneParticipant(participantId: string) {
  const supabase = createClient()

  const { data: original, error: fetchError } = await supabase
    .from('encounter_participants')
    .select('*')
    .eq('id', participantId)
    .single()

  if (fetchError) throw fetchError

  // Strip any existing " 1" / " 2" suffix from name before re-applying
  const baseName = original.display_name.replace(/ \d+$/, '')

  // Rename original to " 1"
  const { error: renameError } = await supabase
    .from('encounter_participants')
    .update({ display_name: `${baseName} 1` })
    .eq('id', participantId)

  if (renameError) throw renameError

  // Insert clone with " 2", full HP, no conditions/effects
  const { data: clone, error: insertError } = await supabase
    .from('encounter_participants')
    .insert({
      encounter_id: original.encounter_id,
      node_id: original.node_id,
      display_name: `${baseName} 2`,
      initiative: null,
      max_hp: original.max_hp,
      current_hp: original.max_hp,
      temp_hp: 0,
      role: original.role,
      sort_order: original.sort_order + 1,
      is_active: true,
      conditions: [],
      effects: [],
    })
    .select()
    .single()

  if (insertError) throw insertError

  return {
    updatedOriginalName: `${baseName} 1`,
    clone,
  }
}
