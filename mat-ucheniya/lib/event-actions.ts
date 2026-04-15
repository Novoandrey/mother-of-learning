'use client'

import { createClient } from '@/lib/supabase/client'

// --- Action types ---

export type EventAction =
  | 'hp_damage'
  | 'hp_heal'
  | 'condition_add'
  | 'condition_remove'
  | 'effect_add'
  | 'effect_remove'
  | 'turn_start'
  | 'round_start'
  | 'custom'

// --- Result payloads per action ---

export type HpResult = {
  delta: number    // positive = heal, negative = damage (always stored as abs in delta field)
  from: number     // HP before
  to: number       // HP after
  max: number      // max HP for display
}

export type TagResult = {
  name: string     // condition or effect name
}

export type CustomResult = {
  text: string     // free-form description
}

export type EventResult = HpResult | TagResult | CustomResult | Record<string, unknown>

// --- DB row ---

export type EncounterEvent = {
  id: string
  encounter_id: string
  actor: string | null
  action: EventAction
  target: string | null
  result: EventResult
  round: number | null
  turn: string | null
  created_at: string
}

// --- Timeline item (union of event and manual log) ---

export type TimelineItem =
  | { kind: 'event'; data: EncounterEvent }
  | { kind: 'log';   data: import('@/lib/log-actions').LogEntry }

// --- CRUD ---

export async function addEvent(
  encounterId: string,
  evt: {
    actor?: string | null
    action: EventAction
    target?: string | null
    result?: EventResult
    round?: number | null
    turn?: string | null
  }
): Promise<EncounterEvent> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('encounter_events')
    .insert({
      encounter_id: encounterId,
      actor: evt.actor ?? null,
      action: evt.action,
      target: evt.target ?? null,
      result: evt.result ?? {},
      round: evt.round ?? null,
      turn: evt.turn ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteEvent(id: string) {
  const supabase = createClient()
  const { error } = await supabase
    .from('encounter_events')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// --- Helpers to merge events + logs into timeline ---

export function mergeTimeline(
  events: EncounterEvent[],
  logs: import('@/lib/log-actions').LogEntry[]
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...events.map((e) => ({ kind: 'event' as const, data: e })),
    ...logs.map((l) => ({ kind: 'log' as const, data: l })),
  ]
  items.sort((a, b) => {
    const ta = new Date(a.data.created_at).getTime()
    const tb = new Date(b.data.created_at).getTime()
    return ta - tb
  })
  return items
}

// --- Human-readable rendering ---

export function renderEvent(evt: EncounterEvent): string {
  const r = evt.result as Record<string, unknown>
  const roundPrefix = evt.round ? `Р${evt.round}: ` : ''

  switch (evt.action) {
    case 'hp_damage': {
      const hp = r as HpResult
      return `${roundPrefix}${evt.target} −${hp.delta} хп → ${hp.to}/${hp.max}`
    }
    case 'hp_heal': {
      const hp = r as HpResult
      return `${roundPrefix}${evt.target} +${hp.delta} хп → ${hp.to}/${hp.max}`
    }
    case 'condition_add': {
      const tag = r as TagResult
      return `${roundPrefix}${evt.target} → ${tag.name}`
    }
    case 'condition_remove': {
      const tag = r as TagResult
      return `${roundPrefix}${evt.target} ✕ ${tag.name}`
    }
    case 'effect_add': {
      const tag = r as TagResult
      return `${roundPrefix}${evt.target} → ✦${tag.name}`
    }
    case 'effect_remove': {
      const tag = r as TagResult
      return `${roundPrefix}${evt.target} ✕ ✦${tag.name}`
    }
    case 'round_start':
      return `── Раунд ${evt.round} ──`
    case 'turn_start':
      return `${roundPrefix}Ход: ${evt.actor}`
    case 'custom': {
      const custom = r as CustomResult
      return `${roundPrefix}${custom.text}`
    }
    default:
      return `${roundPrefix}${evt.action}`
  }
}
