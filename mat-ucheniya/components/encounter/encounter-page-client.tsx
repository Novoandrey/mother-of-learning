'use client'

import { useState, useCallback } from 'react'
import { EncounterGrid, type CatalogNode } from './encounter-grid'
import { EncounterLog } from './encounter-log'
import { addLogEntry, type LogEntry } from '@/lib/log-actions'

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
}: Props) {
  const [logEntries, setLogEntries] = useState(initialLogEntries)
  const done = encounter.status === 'completed'

  const handleAutoLog = useCallback(async (message: string) => {
    try {
      const entry = await addLogEntry(encounter.id, message, '⚙')
      setLogEntries((prev) => [...prev, entry])
    } catch (e) {
      console.error('Auto-log failed:', e)
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
        onAutoLog={done ? undefined : handleAutoLog}
      />

      <EncounterLog
        encounterId={encounter.id}
        entries={logEntries}
        onEntriesChange={setLogEntries}
        disabled={done}
      />
    </>
  )
}
