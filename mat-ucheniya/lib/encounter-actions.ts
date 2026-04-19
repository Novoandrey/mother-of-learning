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
  hps: number[]
) {
  const supabase = createClient()
  const rows = hps.map((hp, i) => ({
    encounter_id: encounterId,
    node_id: nodeId,
    display_name: hps.length === 1 ? displayName : `${displayName} ${i + 1}`,
    max_hp: hp,
    current_hp: hp,
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

// Clone participant: finds next available number, gives clone full HP, no conditions/effects.
// Clone inherits: initiative, role, max_hp, node_id. Resets: current_hp (full), temp_hp (0),
// conditions, effects, is_active (true). Sort: inserted immediately after original by
// shifting all successors' sort_order up by 1.
export async function cloneParticipant(participantId: string) {
  const supabase = createClient()

  const { data: original, error: fetchError } = await supabase
    .from('encounter_participants')
    .select('*')
    .eq('id', participantId)
    .single()

  if (fetchError) throw fetchError

  // Strip " N" suffix to get base name.
  const baseName = original.display_name.replace(/ \d+$/, '')

  const { data: siblings, error: siblingsError } = await supabase
    .from('encounter_participants')
    .select('id, display_name, sort_order')
    .eq('encounter_id', original.encounter_id)

  if (siblingsError) throw siblingsError

  // Collect existing numbers for this base name.
  const existingNumbers = new Set<number>()
  for (const s of siblings || []) {
    const sBase = s.display_name.replace(/ \d+$/, '')
    if (sBase === baseName) {
      const match = s.display_name.match(/ (\d+)$/)
      if (match) existingNumbers.add(parseInt(match[1]))
    }
  }

  // If original has no number, rename to "N 1".
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

  let nextNum = 1
  while (existingNumbers.has(nextNum)) nextNum++

  // Clone sort_order = max(sort_order) + 1 — goes to the end of the list.
  // Combined with same initiative (sort is initiative DESC, sort_order ASC tiebreaker),
  // successive clones naturally stack below the original and each other.
  const maxSortOrder = (siblings || []).reduce(
    (max, s) => (s.sort_order > max ? s.sort_order : max),
    original.sort_order,
  )
  const newSortOrder = maxSortOrder + 1

  // Clone inherits initiative and role; resets HP and status.
  const { data: clone, error: insertError } = await supabase
    .from('encounter_participants')
    .insert({
      encounter_id: original.encounter_id,
      node_id: original.node_id,
      display_name: `${baseName} ${nextNum}`,
      initiative: original.initiative, // inherit — clone joins combat at same init
      max_hp: original.max_hp,
      current_hp: original.max_hp,     // full HP on spawn
      temp_hp: 0,
      role: original.role,
      sort_order: newSortOrder,
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
