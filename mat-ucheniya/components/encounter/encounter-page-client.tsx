'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { EncounterGrid, type CatalogNode, type EncounterGridHandle, type Participant } from './encounter-grid'
import { EncounterLog } from './encounter-log'
import { EncounterCatalogPanel } from './encounter-catalog-panel'
import { StatblockPanel } from './statblock/statblock-panel'
import { type PickerParticipant } from './statblock/target-picker-dialog'
import { parseStatblock, hasDeadCondition, type StatblockAction } from '@/lib/statblock'
import { createClient } from '@/lib/supabase/client'
import { type LogEntry } from '@/lib/log-actions'
import {
  addEvent,
  mergeTimeline,
  type EncounterEvent,
  type EventAction,
  type EventResult,
  type TimelineItem,
} from '@/lib/event-actions'
import { Swords, BookOpen } from 'lucide-react'

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

type RightTab = 'statblock' | 'catalog'

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

  // Per-participant counters (reactions/legendary), seeded from DB.
  const [counters, setCounters] = useState<Record<string, { used_reactions: number; legendary_used: number }>>(
    () => {
      const out: Record<string, { used_reactions: number; legendary_used: number }> = {}
      for (const p of initialParticipants) {
        out[p.id] = {
          used_reactions: (p as unknown as { used_reactions?: number }).used_reactions ?? 0,
          legendary_used: (p as unknown as { legendary_used?: number }).legendary_used ?? 0,
        }
      }
      return out
    },
  )

  // Snapshot of live participants (updated by EncounterGrid via callback).
  const [participantsSnap, setParticipantsSnap] = useState(initialParticipants)

  // Active participant: whose statblock is shown. Defaults to turn-holder.
  const [activeId, setActiveId] = useState<string | null>(encounter.current_turn_id ?? null)
  const [rightTab, setRightTab] = useState<RightTab>('statblock')

  const handleActiveChange = useCallback((id: string | null) => {
    setActiveId(id)
    if (id) setRightTab('statblock')
  }, [])

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

  const handlePanelAdd = useCallback((nodeId: string, displayName: string, maxHp: number, qty: number) => {
    gridRef.current?.addFromCatalogExternal(nodeId, displayName, maxHp, qty)
  }, [])

  // ── Counter persistence ─────────────────────────────────────────────
  const persistCounter = useCallback(
    async (participantId: string, field: 'used_reactions' | 'legendary_used', value: number) => {
      try {
        const s = createClient()
        await s.from('encounter_participants').update({ [field]: value }).eq('id', participantId)
      } catch (e) {
        console.error(`Failed to persist ${field}:`, e)
      }
    },
    [],
  )

  const setReactions = useCallback(
    (pid: string, v: number) => {
      setCounters((prev) => ({
        ...prev,
        [pid]: { ...(prev[pid] ?? { used_reactions: 0, legendary_used: 0 }), used_reactions: v },
      }))
      persistCounter(pid, 'used_reactions', v)
    },
    [persistCounter],
  )
  const setLegendary = useCallback(
    (pid: string, v: number) => {
      setCounters((prev) => ({
        ...prev,
        [pid]: { ...(prev[pid] ?? { used_reactions: 0, legendary_used: 0 }), legendary_used: v },
      }))
      persistCounter(pid, 'legendary_used', v)
    },
    [persistCounter],
  )

  // ── Active participant → statblock ──────────────────────────────────
  // Priority:
  //   1. Explicit active (turn-holder when combat is running, or user-selected).
  //   2. Fallback: first participant whose node fields parse into a real
  //      statblock. Lets the DM see a monster's actions before starting combat
  //      and right after adding a new creature to an existing encounter.
  const active = useMemo(() => {
    const explicit = activeId ? participantsSnap.find((p) => p.id === activeId) : null
    if (explicit) return explicit
    for (const p of participantsSnap) {
      if (!p.node?.fields) continue
      if (parseStatblock(p.display_name, p.node.fields) != null) return p
    }
    return null
  }, [participantsSnap, activeId])

  const activeStatblock = useMemo(() => {
    if (!active || !active.node) return null
    return parseStatblock(active.display_name, active.node.fields ?? null)
  }, [active])

  const activeCounters = active ? (counters[active.id] ?? { used_reactions: 0, legendary_used: 0 }) : null

  // Reset reactions to 0 at START of own turn (when activeId becomes this.id).
  useEffect(() => {
    if (!activeId) return
    const current = counters[activeId]?.used_reactions ?? 0
    if (current > 0) setReactions(activeId, 0)
     
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset legendary actions at END of own turn (when activeId moves AWAY from prev).
  const prevActiveIdRef = useRef<string | null>(activeId)
  useEffect(() => {
    const prev = prevActiveIdRef.current
    if (prev && prev !== activeId) {
      const used = counters[prev]?.legendary_used ?? 0
      if (used > 0) setLegendary(prev, 0)
    }
    prevActiveIdRef.current = activeId
     
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Target picker candidates ────────────────────────────────────────
  const pickerTargets: PickerParticipant[] = useMemo(() => {
    return participantsSnap
      .filter((p) => p.is_active)
      .map((p) => ({
        id: p.id,
        display_name: p.display_name,
        current_hp: p.current_hp,
        max_hp: p.max_hp,
        temp_hp: p.temp_hp ?? 0,
        role: p.role,
        is_dead: hasDeadCondition(p.conditions ?? []),
      }))
  }, [participantsSnap])

  // ── Action fired → write to event log ───────────────────────────────
  const handleActionUsed = useCallback(
    (action: StatblockAction, targetIds: string[]) => {
      if (!active) return
      const targetNames = targetIds
        .map((id) => participantsSnap.find((p) => p.id === id)?.display_name)
        .filter(Boolean)
        .join(', ')
      const text = targetNames ? `${action.name} → ${targetNames}` : action.name
      handleAutoEvent({
        actor: active.display_name,
        action: 'custom',
        target: targetNames || null,
        result: { text },
        round: encounter.current_round,
        turn: active.id,
      })
    },
    [active, participantsSnap, handleAutoEvent, encounter.current_round],
  )

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
          onActiveChange={done ? undefined : handleActiveChange}
          onParticipantsChange={setParticipantsSnap}
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

      {/* Right rail */}
      <div className="flex-shrink-0" style={{ width: 440 }}>
        <div
          className="mb-2 flex gap-1 rounded-md border p-1"
          style={{ borderColor: 'var(--gray-200)', background: 'var(--gray-50)' }}
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'statblock'}
            onClick={() => setRightTab('statblock')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[12px] font-medium transition-colors"
            style={{
              background: rightTab === 'statblock' ? '#fff' : 'transparent',
              color: rightTab === 'statblock' ? 'var(--gray-900)' : 'var(--fg-3)',
              boxShadow: rightTab === 'statblock' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <Swords size={13} strokeWidth={1.5} />
            Статблок
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'catalog'}
            onClick={() => setRightTab('catalog')}
            className="flex flex-1 items-center justify-center gap-1.5 rounded py-1.5 text-[12px] font-medium transition-colors"
            style={{
              background: rightTab === 'catalog' ? '#fff' : 'transparent',
              color: rightTab === 'catalog' ? 'var(--gray-900)' : 'var(--fg-3)',
              boxShadow: rightTab === 'catalog' ? 'var(--shadow-sm)' : 'none',
            }}
          >
            <BookOpen size={13} strokeWidth={1.5} />
            Каталог
          </button>
        </div>

        {rightTab === 'statblock' ? (
          active && activeCounters ? (
            <StatblockPanel
              participant={{
                id: active.id,
                display_name: active.display_name,
                current_hp: active.current_hp,
                max_hp: active.max_hp,
                temp_hp: active.temp_hp ?? 0,
                used_reactions: activeCounters.used_reactions,
                legendary_used: activeCounters.legendary_used,
                conditions: (active.conditions ?? []).map((c) => c.name),
              }}
              statblock={activeStatblock}
              otherParticipants={pickerTargets.filter((p) => p.id !== active.id)}
              disabled={done}
              onChangeReactions={(v) => setReactions(active.id, v)}
              onChangeLegendary={(v) => setLegendary(active.id, v)}
              onActionUsed={handleActionUsed}
            />
          ) : (
            <div
              className="rounded-lg border bg-white p-4 text-center"
              style={{ borderColor: 'var(--gray-200)' }}
            >
              <div className="text-[12px]" style={{ color: 'var(--fg-3)' }}>
                Нет активного участника. Начни бой — нажми{' '}
                <kbd className="rounded border px-1 font-mono text-[10px]" style={{ borderColor: 'var(--gray-200)' }}>
                  →
                </kbd>{' '}
                или пробел.
              </div>
            </div>
          )
        ) : (
          <EncounterCatalogPanel nodes={catalogNodes} onAdd={handlePanelAdd} disabled={done} />
        )}
      </div>
    </div>
  )
}
