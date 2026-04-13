'use client'

import { createClient } from '@/lib/supabase/client'

export type TemplateParticipant = {
  id: string
  display_name: string
  max_hp: number
  role: string
  sort_order: number
  node_id: string | null
}

export type EncounterTemplate = {
  id: string
  title: string
  created_at: string
  encounter_template_participants: TemplateParticipant[]
}

// Save current encounter participants as a new template
export async function saveAsTemplate(
  campaignId: string,
  templateTitle: string,
  participants: Array<{
    display_name: string
    max_hp: number
    role: string
    sort_order: number
    node_id: string | null
  }>
) {
  const supabase = createClient()

  const { data: template, error: templateError } = await supabase
    .from('encounter_templates')
    .insert({ campaign_id: campaignId, title: templateTitle })
    .select()
    .single()

  if (templateError) throw templateError

  if (participants.length > 0) {
    const rows = participants.map((p) => ({
      template_id: template.id,
      node_id: p.node_id,
      display_name: p.display_name,
      max_hp: p.max_hp,
      role: p.role,
      sort_order: p.sort_order,
    }))

    const { error: participantsError } = await supabase
      .from('encounter_template_participants')
      .insert(rows)

    if (participantsError) throw participantsError
  }

  return template
}

// List all templates for a campaign
export async function listTemplates(campaignId: string): Promise<EncounterTemplate[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('encounter_templates')
    .select(`
      id,
      title,
      created_at,
      encounter_template_participants (
        id,
        display_name,
        max_hp,
        role,
        sort_order,
        node_id
      )
    `)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as EncounterTemplate[]
}

// Delete a template
export async function deleteTemplate(templateId: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_templates')
    .delete()
    .eq('id', templateId)
  if (error) throw error
}

// Create a new encounter from a template
export async function createEncounterFromTemplate(
  campaignId: string,
  encounterTitle: string,
  templateId: string
): Promise<{ id: string }> {
  const supabase = createClient()

  // Create encounter
  const { data: encounter, error: encError } = await supabase
    .from('encounters')
    .insert({ campaign_id: campaignId, title: encounterTitle })
    .select()
    .single()

  if (encError) throw encError

  // Fetch template participants
  const { data: templateParticipants, error: tpError } = await supabase
    .from('encounter_template_participants')
    .select('*')
    .eq('template_id', templateId)
    .order('sort_order')

  if (tpError) throw tpError

  if (templateParticipants && templateParticipants.length > 0) {
    const rows = templateParticipants.map((tp) => ({
      encounter_id: encounter.id,
      node_id: tp.node_id,
      display_name: tp.display_name,
      max_hp: tp.max_hp,
      current_hp: tp.max_hp,
      role: tp.role,
      sort_order: tp.sort_order,
    }))

    const { error: insertError } = await supabase
      .from('encounter_participants')
      .insert(rows)

    if (insertError) throw insertError
  }

  return encounter
}
