'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { EncounterGrid, type CatalogNode, type EncounterGridHandle, type Participant } from './encounter-grid'
import { EncounterLog } from './encounter-log'
import { EncounterCatalogPanel } from './encounter-catalog-panel'
import { StatblockPanel } from './statblock/statblock-panel'
import { type PickerParticipant } from './statblock/target-picker-dialog'
import { type ResolveResult } from './statblock/action-resolve-dialog'
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
  hpMethod: import('@/lib/statblock').HpMethod
  conditionNames: string[]
  effectNames: string[]
  initialLogEntries: LogEntry[]
  initialEvents: EncounterEvent[]
  /**
   * When `false`, the viewer is a player (not DM/owner). RLS on
   * `encounter_participants` / `encounters` / event tables only lets
   * DMs and owners modify rows, so for players any write would be
   * silently rejected. Rather than let optimistic local state drift
   * out of sync with the DB — which produced the chat-44 bug where
   * damage appeared in the target picker but vanished on reload — we
   * gate the action surface on this flag and show a single toast
   * explaining why the click did nothing.
   */
  canEdit: boolean
}

type RightTab = 'statblock' | 'catalog'

export function EncounterPageClient({
  encounter,
  initialParticipants,
  catalogNodes,
  campaignId,
  campaignSlug,
  hpMethod,
  conditionNames,
  effectNames,
  initialLogEntries,
  initialEvents,
  canEdit,
}: Props) {
  const [logEntries, setLogEntries] = useState(initialLogEntries)
  const [events, setEvents] = useState(initialEvents)
  const done = encounter.status === 'completed'
  const gridRef = useRef<EncounterGridHandle>(null)

  // Per-participant counters (reactions/legendary/LR), seeded from DB.
  const [counters, setCounters] = useState<
    Record<
      string,
      { used_reactions: number; legendary_used: number; legendary_resistance_used: number }
    >
  >(() => {
    const out: Record<
      string,
      { used_reactions: number; legendary_used: number; legendary_resistance_used: number }
    > = {}
    for (const p of initialParticipants) {
      const raw = p as unknown as {
        used_reactions?: number
        legendary_used?: number
        legendary_resistance_used?: number
      }
      out[p.id] = {
        used_reactions: raw.used_reactions ?? 0,
        legendary_used: raw.legendary_used ?? 0,
        legendary_resistance_used: raw.legendary_resistance_used ?? 0,
      }
    }
    return out
  })

  // Snapshot of live participants (updated by EncounterGrid via callback).
  const [participantsSnap, setParticipantsSnap] = useState(initialParticipants)

  // Turn holder (updated by EncounterGrid when turn advances).
  const [turnId, setTurnId] = useState<string | null>(encounter.current_turn_id ?? null)
  // User override — shows someone else's statblock without changing turn.
  // null = follow turn holder.
  const [inspectedId, setInspectedId] = useState<string | null>(null)
  const [rightTab, setRightTab] = useState<RightTab>('statblock')

  // When the grid reports a new turn holder, update tracking and clear any
  // manual inspection — the new active turn gets focus automatically.
  const handleTurnChange = useCallback((id: string | null) => {
    setTurnId(id)
    setInspectedId(null)
    if (id) setRightTab('statblock')
  }, [])

  // User clicked a name cell → show that one's statblock, don't touch turn.
  const handleInspect = useCallback((id: string) => {
    setInspectedId(id)
    setRightTab('statblock')
  }, [])

  // Return to turn holder.
  const handleFollowTurn = useCallback(() => {
    setInspectedId(null)
  }, [])

  // Effective active participant = inspected override, else turn holder.
  const activeId = inspectedId ?? turnId

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
    async (
      participantId: string,
      field: 'used_reactions' | 'legendary_used' | 'legendary_resistance_used',
      value: number,
    ) => {
      try {
        const s = createClient()
        await s.from('encounter_participants').update({ [field]: value }).eq('id', participantId)
      } catch (e) {
        console.error(`Failed to persist ${field}:`, e)
      }
    },
    [],
  )

  const makeCounterSetter = useCallback(
    (field: 'used_reactions' | 'legendary_used' | 'legendary_resistance_used') =>
      (pid: string, v: number) => {
        setCounters((prev) => {
          const existing = prev[pid] ?? {
            used_reactions: 0,
            legendary_used: 0,
            legendary_resistance_used: 0,
          }
          return { ...prev, [pid]: { ...existing, [field]: v } }
        })
        persistCounter(pid, field, v)
      },
    [persistCounter],
  )

  const setReactions = useMemo(() => makeCounterSetter('used_reactions'), [makeCounterSetter])
  const setLegendary = useMemo(() => makeCounterSetter('legendary_used'), [makeCounterSetter])
  const setLegendaryResistance = useMemo(
    () => makeCounterSetter('legendary_resistance_used'),
    [makeCounterSetter],
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

  const activeCounters = active
    ? (counters[active.id] ?? { used_reactions: 0, legendary_used: 0, legendary_resistance_used: 0 })
    : null

  // Reset reactions to 0 at START of own turn (when turnId becomes this.id).
  // Tied to turnId — inspecting someone else never triggers a reset.
  useEffect(() => {
    if (!turnId) return
    const current = counters[turnId]?.used_reactions ?? 0
    if (current > 0) setReactions(turnId, 0)
     
  }, [turnId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset legendary actions at END of own turn (when turnId moves AWAY from prev).
  const prevTurnIdRef = useRef<string | null>(turnId)
  useEffect(() => {
    const prev = prevTurnIdRef.current
    if (prev && prev !== turnId) {
      const used = counters[prev]?.legendary_used ?? 0
      if (used > 0) setLegendary(prev, 0)
    }
    prevTurnIdRef.current = turnId
     
  }, [turnId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Action resolved → write events + apply damage ───────────────────
  // One event per target (hp_damage if damage > 0, else custom with hit/miss
  // note). Optional overall comment becomes an additional custom event.
  //
  // Player vs DM (fix for BUG-018, chat 44):
  //   RLS on `encounter_participants` only allows DM/owner writes. Before
  //   the fix, a player's click silently failed in the DB but the target
  //   picker still read HP from stale cached snapshots, showing damage
  //   that vanished on reload. We now gate on `canEdit` up-front and
  //   show one toast instead of half-applying state.
  //
  // DM failure path:
  //   If the DB write genuinely errors (network, constraint, RLS change),
  //   we skip the local HP update — neither page-client snap nor grid
  //   gets the mutation, so reload-vs-live stay consistent. Event log
  //   still fires because the DM's action (roll) happened, just didn't
  //   commit to HP.
  const handleActionResolved = useCallback(
    async (
      action: StatblockAction,
      targets: PickerParticipant[],
      result: ResolveResult,
    ) => {
      if (!active) return

      if (!canEdit) {
        // Player: no writes possible. Don't fire events, don't touch
        // local state — otherwise optimistic-only mutations drift from
        // DB, producing the BUG-018 "ghost damage" pattern.
        window.alert(
          'Применять урон и вести лог энкаунтера может только ДМ. Скажите ДМу результаты броска, он внесёт изменения.',
        )
        return
      }

      // Self action (no targets): fire one custom event with comment or action name.
      if (targets.length === 0) {
        const text = result.comment.trim() || action.name
        await handleAutoEvent({
          actor: active.display_name,
          action: 'custom',
          target: null,
          result: { text: `${action.name}: ${text}` },
          round: encounter.current_round,
          turn: active.id,
        })
        return
      }

      const s = createClient()

      // Process each target sequentially to keep event ordering readable.
      for (const pt of result.perTarget) {
        const target = targets.find((t) => t.id === pt.id)
        if (!target) continue

        // Apply damage to HP (clamped 0..max) if there was any.
        if (pt.hit && pt.damage > 0) {
          const fresh = participantsSnap.find((p) => p.id === pt.id)
          const from = fresh?.current_hp ?? target.current_hp
          const max = fresh?.max_hp ?? target.max_hp
          const to = Math.max(0, from - pt.damage)

          // Write HP in DB first, THEN update local state — avoids
          // "damage appeared then vanished" if the write is rejected.
          const { error: updErr } = await s
            .from('encounter_participants')
            .update({ current_hp: to })
            .eq('id', pt.id)

          if (updErr) {
            console.error('Failed to apply damage:', updErr)
            window.alert(
              `Не удалось записать урон «${target.display_name}»: ${updErr.message}. Перезагрузите страницу.`,
            )
            // Skip grid/snap update — keep both in sync with DB (old HP).
            continue
          }

          // Success: sync both stateful mirrors so the grid matches
          // the picker without waiting for router.refresh.
          setParticipantsSnap((ps) =>
            ps.map((p) => (p.id === pt.id ? { ...p, current_hp: to } : p)),
          )
          gridRef.current?.setParticipantHp(pt.id, to)

          // Log as hp_damage event so it renders with − hp/max formatting.
          await handleAutoEvent({
            actor: active.display_name,
            action: 'hp_damage',
            target: target.display_name,
            result: { delta: pt.damage, from, to, max, note: pt.note || undefined, via: action.name },
            round: encounter.current_round,
            turn: active.id,
          })
        } else {
          // Miss or no-damage outcome → custom event.
          const outcome = pt.hit
            ? (pt.note ? pt.note : 'эффект применён')
            : 'промах'
          const text = `${action.name}: ${target.display_name} — ${outcome}`
          await handleAutoEvent({
            actor: active.display_name,
            action: 'custom',
            target: target.display_name,
            result: { text },
            round: encounter.current_round,
            turn: active.id,
          })
        }
      }

      // Overall comment, if any.
      if (result.comment.trim()) {
        await handleAutoEvent({
          actor: active.display_name,
          action: 'custom',
          target: null,
          result: { text: `${action.name}: ${result.comment.trim()}` },
          round: encounter.current_round,
          turn: active.id,
        })
      }

      // Snap + grid already kept in sync inside the per-target loop —
      // no trailing setParticipantsSnap call needed. Doing it twice
      // when damage > max_hp resulted in a double-subtract (the HP
      // floor at 0 saved us from visual bugs but masked the issue).
    },
    [active, canEdit, participantsSnap, handleAutoEvent, encounter.current_round],
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
          hpMethod={hpMethod}
          conditionNames={conditionNames}
          effectNames={effectNames}
          onAutoEvent={done ? undefined : handleAutoEvent}
          onActiveChange={done ? undefined : handleTurnChange}
          onInspect={done ? undefined : handleInspect}
          onParticipantsChange={setParticipantsSnap}
          canEdit={canEdit}
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
      <div className="flex-shrink-0" style={{ width: 440, minWidth: 440 }}>
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

        {/* Inspecting-other banner — shown only when the DM is looking at
            someone other than the turn holder. Click to snap back. */}
        {rightTab === 'statblock' && inspectedId && inspectedId !== turnId && active && (
          <button
            type="button"
            onClick={handleFollowTurn}
            className="mb-2 flex w-full items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-left text-[11px] text-amber-800 transition-colors hover:bg-amber-100"
            title="Вернуться к тому, чей ход"
          >
            <span>👁 Смотришь: <b>{active.display_name}</b>, ход сейчас не его</span>
            <span className="ml-auto text-amber-600">← К ходящему</span>
          </button>
        )}

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
                legendary_resistance_used: activeCounters.legendary_resistance_used,
                conditions: (active.conditions ?? []).map((c) => c.name),
              }}
              statblock={activeStatblock}
              otherParticipants={pickerTargets.filter((p) => p.id !== active.id)}
              disabled={done}
              onChangeReactions={(v) => setReactions(active.id, v)}
              onChangeLegendary={(v) => setLegendary(active.id, v)}
              onChangeLegendaryResistance={(v) => setLegendaryResistance(active.id, v)}
              onActionResolved={handleActionResolved}
            />
          ) : (
            <div
              className="w-full rounded-lg border bg-white p-4 text-center"
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
