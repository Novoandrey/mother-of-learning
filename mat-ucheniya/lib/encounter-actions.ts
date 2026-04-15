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

export type TagEntry = { name: string; round: number }

export async function updateConditions(participantId: string, conditions: TagEntry[]) {
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

export async function updateEffects(participantId: string, effects: TagEntry[]) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_participants')
    .update({ effects })
    .eq('id', participantId)
  if (error) throw error
}

// Clone participant: finds next available number, gives clone full HP, no conditions/effects
export async function cloneParticipant(participantId: string) {
  const supabase = createClient()

  const { data: original, error: fetchError } = await supabase
    .from('encounter_participants')
    .select('*')
    .eq('id', participantId)
    .single()

  if (fetchError) throw fetchError

  // Strip any existing " N" suffix from name to get base name
  const baseName = original.display_name.replace(/ \d+$/, '')

  // Find all participants in this encounter with the same base name
  const { data: siblings, error: siblingsError } = await supabase
    .from('encounter_participants')
    .select('display_name')
    .eq('encounter_id', original.encounter_id)

  if (siblingsError) throw siblingsError

  // Collect all existing numbers for this base name
  const existingNumbers = new Set<number>()
  for (const s of siblings || []) {
    const sBase = s.display_name.replace(/ \d+$/, '')
    if (sBase === baseName) {
      const match = s.display_name.match(/ (\d+)$/)
      if (match) existingNumbers.add(parseInt(match[1]))
    }
  }

  // If original doesn't have a number yet, rename it to " 1"
  const originalHasNumber = / \d+$/.test(original.display_name)
  let updatedOriginalName = original.display_name
  if (!originalHasNumber) {
    updatedOriginalName = `${baseName} 1`
    existingNumbers.add(1)
    const { error: renameError } = await supabase
      .from('encounter_participants')
      .update({ display_name: updatedOriginalName })
      .eq('id', participantId)
    if (renameError) throw renameError
  }

  // Find next available number
  let nextNum = 1
  while (existingNumbers.has(nextNum)) nextNum++

  // Insert clone with next number, full HP, no conditions/effects
  const { data: clone, error: insertError } = await supabase
    .from('encounter_participants')
    .insert({
      encounter_id: original.encounter_id,
      node_id: original.node_id,
      display_name: `${baseName} ${nextNum}`,
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
    updatedOriginalName,
    clone,
  }
}
