'use client'

import { useState, useCallback } from 'react'
import { EncounterGrid, type CatalogNode } from './encounter-grid'
import { EncounterLog } from './encounter-log'
import { type LogEntry } from '@/lib/log-actions'
import {
  addEvent,
  mergeTimeline,
  type EncounterEvent,
  type EventAction,
  type EventResult,
  type TimelineItem,
} from '@/lib/event-actions'

type Props = {
  encounter: {
    id: string
    title: string
    status: 'active' | 'completed'
    current_round: number
    current_turn_id?: string | null
    details: Record<string, string>
  }
  initialParticipants: any[]
  catalogNodes: CatalogNode[]
  campaignId: string
  campaignSlug: string
  conditionNames: string[]
  effectNames: string[]
  initialLogEntries: LogEntry[]
  initialEvents: EncounterEvent[]
}

export function EncounterPageClient({
  encounter,
  initialParticipants,
  catalogNodes,
  campaignId,
  campaignSlug,
  conditionNames,
  effectNames,
  initialLogEntries,
  initialEvents,
}: Props) {
  const [logEntries, setLogEntries] = useState(initialLogEntries)
  const [events, setEvents] = useState(initialEvents)
  const done = encounter.status === 'completed'

  // Merged timeline for rendering
  const timeline: TimelineItem[] = mergeTimeline(events, logEntries)

  const handleAutoEvent = useCallback(async (evt: {
    actor?: string | null
    action: EventAction
    target?: string | null
    result?: EventResult
    round?: number | null
    turn?: string | null
  }) => {
    try {
      const entry = await addEvent(encounter.id, evt)
      setEvents((prev) => [...prev, entry])
    } catch (e) {
      console.error('Auto-event failed:', e)
    }
  }, [encounter.id])

  return (
    <>
      <EncounterGrid
        encounter={encounter}
        initialParticipants={initialParticipants}
        catalogNodes={catalogNodes}
        campaignId={campaignId}
        campaignSlug={campaignSlug}
        conditionNames={conditionNames}
        effectNames={effectNames}
        onAutoEvent={done ? undefined : handleAutoEvent}
      />

      <EncounterLog
        encounterId={encounter.id}
        logEntries={logEntries}
        onLogEntriesChange={setLogEntries}
        events={events}
        onEventsChange={setEvents}
        timeline={timeline}
        disabled={done}
      />
    </>
  )
}
