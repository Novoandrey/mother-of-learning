'use client'

import { createClient } from '@/lib/supabase/client'

export type LogEntry = {
  id: string
  encounter_id: string
  author_name: string
  content: string
  meta: Record<string, unknown>
  status: string
  created_at: string
}

export async function addLogEntry(
  encounterId: string,
  content: string,
  authorName = 'ДМ'
): Promise<LogEntry> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('encounter_log')
    .insert({ encounter_id: encounterId, content, author_name: authorName })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteLogEntry(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_log')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function updateLogEntry(id: string, content: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_log')
    .update({ content })
    .eq('id', id)
  if (error) throw error
}
