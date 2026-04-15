'use client'

import { useState, useCallback, useRef } from 'react'
import { EncounterGrid, type CatalogNode, type EncounterGridHandle, type Participant } from './encounter-grid'
import { EncounterLog } from './encounter-log'
import { EncounterCatalogPanel } from './encounter-catalog-panel'
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
  initialParticipants: Participant[]
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
  const gridRef = useRef<EncounterGridHandle>(null)

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

  // Panel → Grid: add participant from catalog sidebar
  const handlePanelAdd = useCallback((nodeId: string, displayName: string, maxHp: number, qty: number) => {
    gridRef.current?.addFromCatalogExternal(nodeId, displayName, maxHp, qty)
  }, [])

  return (
    <div className="flex gap-3 items-start">
      {/* Main area: grid + log */}
      <div className="flex-1 min-w-0 space-y-3">
        <EncounterGrid
          ref={gridRef}
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
      </div>

      {/* Sidebar: catalog panel */}
      <EncounterCatalogPanel
        nodes={catalogNodes}
        onAdd={handlePanelAdd}
        disabled={done}
      />
    </div>
  )
}
