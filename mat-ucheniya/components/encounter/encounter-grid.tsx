'use client'

import { useState, useMemo, useCallback, useRef, useImperativeHandle, useEffect, forwardRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { EditableCell } from './editable-cell'
import { HpCell } from './hp-cell'
import { TagCell } from './tag-cell'
import { AddParticipantRow } from './add-participant-row'
import { NameCell } from './name-cell'
import { SaveAsTemplateButton } from '@/components/save-as-template-button'
import type { EventAction, EventResult } from '@/lib/event-actions'
import { useSelection } from '@/hooks/use-selection'
import { useEncounterTurns } from '@/hooks/use-encounter-turns'
import { useParticipantActions } from '@/hooks/use-participant-actions'
import type { TagEntry } from './tag-cell'

// ── Types ────────────────────────────────────────────

type Encounter = {
  id: string
  title: string
  status: 'active' | 'completed'
  current_round: number
  current_turn_id?: string | null
  details: Record<string, string>
}

export type Participant = {
  id: string
  display_name: string
  initiative: number | null
  max_hp: number
  current_hp: number
  temp_hp: number
  role: string
  sort_order: number
  is_active: boolean
  node_id: string | null
  conditions: TagEntry[]
  effects: TagEntry[]
  node?: { id: string; title: string; fields?: Record<string, unknown>; type?: { slug: string } } | null
}

export type CatalogNode = {
  id: string
  title: string
  fields: Record<string, unknown>
  type: { slug: string; label: string } | null
}

type Props = {
  encounter: Encounter
  initialParticipants: Participant[]
  catalogNodes: CatalogNode[]
  campaignId: string
  campaignSlug: string
  hpMethod: import('@/lib/statblock').HpMethod
  conditionNames: string[]
  effectNames: string[]
  onAutoEvent?: (evt: { actor?: string | null; action: EventAction; target?: string | null; result?: EventResult; round?: number | null; turn?: string | null }) => void
  /** Fires when the turn-holder changes OR user clicks a row to inspect it. */
  onActiveChange?: (participantId: string | null) => void
  /** Fires when user explicitly clicks "inspect statblock" on a row — doesn't change turn order. */
  onInspect?: (participantId: string) => void
  /** Fires whenever the participant list or any row changes. */
  onParticipantsChange?: (participants: Participant[]) => void
}

// ── Role config ─────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  pc: 'PC', ally: 'Союз', enemy: 'Враг', neutral: '—',
}
const ROLE_DOT: Record<string, string> = {
  pc: 'bg-blue-500', ally: 'bg-green-500', enemy: 'bg-red-500', neutral: 'bg-gray-400',
}
const ROLE_ROW: Record<string, string> = {
  pc: 'bg-blue-50/30', ally: 'bg-green-50/30', enemy: '', neutral: '',
}

export type EncounterGridHandle = {
  addFromCatalogExternal: (nodeId: string, displayName: string, maxHp: number, qty: number) => void
}

// ── Component ───────────────────────────────────────

export const EncounterGrid = forwardRef<EncounterGridHandle, Props>(function EncounterGrid({
  encounter: initial,
  initialParticipants,
  catalogNodes,
  campaignId,
  campaignSlug,
  hpMethod,
  conditionNames,
  effectNames,
  onAutoEvent,
  onActiveChange,
  onInspect,
  onParticipantsChange,
}, ref) {
  // ── State owned by this component ─────────────────
  const [participants, setParticipants] = useState(initialParticipants)
  const [details, setDetails] = useState<Record<string, string>>(initial.details || {})
  const [status, setStatus] = useState(initial.status)
  const done = status === 'completed'

  // ── Derived: sort ─────────────────────────────────
  const sorted = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.initiative != null && b.initiative != null) {
        const d = b.initiative - a.initiative
        return d !== 0 ? d : a.sort_order - b.sort_order
      }
      if (a.initiative != null) return -1
      if (b.initiative != null) return 1
      return a.sort_order - b.sort_order
    })
  }, [participants])

  const inCombat = useMemo(
    () => sorted.filter((p) => p.initiative != null && p.is_active),
    [sorted],
  )

  const sortedIds = useMemo(() => sorted.map((p) => p.id), [sorted])

  // ── Hooks ─────────────────────────────────────────
  const selection = useSelection(sortedIds, done)

  // Round ref for getCurrentRound (avoids stale closures in participant actions)
  const roundRef = useRef(initial.current_round)
  const getCurrentRound = useCallback(() => roundRef.current, [])

  const turns = useEncounterTurns({
    encounterId: initial.id,
    initialRound: initial.current_round,
    initialTurnId: initial.current_turn_id || null,
    participants,
    inCombat,
    done,
    onRoundChange: (r) => { roundRef.current = r },
  })

  // Keep roundRef in sync
  roundRef.current = turns.round

  // Report active participant upward (turn-holder changes).
  // User-initiated inspection is fired from row click below.
  useEffect(() => {
    onActiveChange?.(turns.turnId)
  }, [turns.turnId, onActiveChange])

  // Report participant list upward whenever any row changes
  // (HP, conditions, effects, initiative, roster).
  useEffect(() => {
    onParticipantsChange?.(participants)
  }, [participants, onParticipantsChange])

  const actions = useParticipantActions({
    encounterId: initial.id,
    catalogNodes,
    participants,
    setParticipants,
    sorted,
    selectedIds: selection.selectedIds,
    selCount: selection.selCount,
    isSelected: selection.isSelected,
    clearSelection: selection.clearSelection,
    getCurrentRound,
    onAutoEvent,
    hpMethod,
  })

  // ── Detail fields (loop, day) ─────────────────────
  const saveDetail = useCallback(async (key: string, value: string) => {
    const updated = { ...details, [key]: value }
    setDetails(updated)
    try {
      const s = createClient()
      await s.from('encounters').update({ details: updated }).eq('id', initial.id)
    } catch { /* best-effort */ }
  }, [details, initial.id])

  // ── End combat (needs setStatus) ──────────────────
  const handleEndCombat = useCallback(async () => {
    setStatus('completed')
    await actions.endCombat()
  }, [actions])

  // ── Imperative handle ─────────────────────────────
  useImperativeHandle(ref, () => ({
    addFromCatalogExternal: actions.addFromCatalog,
  }), [actions.addFromCatalog])

  // ── Render ────────────────────────────────────────

  return (
    <div>
      {/* Header bar — decoupled from table columns so widths don't dictate layout */}
      <div
        className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
      >
        {/* Title */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-900">{initial.title}</span>
          {done && (
            <span className="rounded bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500">
              Завершён
            </span>
          )}
        </div>

        {/* Session / Loop / Day pickers */}
        <div className="flex items-center gap-3">
          <DetailField
            label="Сессия"
            value={details.session || null}
            onCommit={(v) => saveDetail('session', v)}
            disabled={done}
          />
          <DetailField
            label="Петля"
            value={details.loop || null}
            onCommit={(v) => saveDetail('loop', v)}
            disabled={done}
          />
          <DetailField
            label="День"
            value={details.day || null}
            onCommit={(v) => saveDetail('day', v)}
            disabled={done}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-gray-400">Раунд</span>
            {!done && (
              <button
                onClick={() => turns.setRound(-1)}
                disabled={turns.round <= 1}
                className="h-7 w-7 rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                aria-label="Предыдущий раунд"
              >
                −
              </button>
            )}
            <span className="min-w-[2ch] text-center font-mono text-base font-bold text-gray-900">
              {turns.round}
            </span>
            {!done && (
              <button
                onClick={() => turns.setRound(1)}
                className="h-7 w-7 rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-100"
                aria-label="Следующий раунд"
              >
                +
              </button>
            )}
          </div>
        </div>

        {/* Turn controls */}
        {!done && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={turns.prevTurn}
              disabled={!inCombat.length}
              title="← или Shift+Space"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gray-100 px-3.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              <span className="text-base leading-none">←</span>
              <span>Предыдущий</span>
            </button>
            <div className="min-w-[140px] px-2 text-center">
              {turns.currentTurnName ? (
                <span className="text-sm font-semibold text-yellow-700">
                  {turns.currentTurnName}
                </span>
              ) : (
                <span className="text-xs text-gray-400">Начать →</span>
              )}
            </div>
            <button
              onClick={turns.advanceTurn}
              disabled={!inCombat.length}
              title="→ или Space"
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-30 transition-colors"
            >
              <span>Следующий</span>
              <span className="text-base leading-none">→</span>
            </button>
            <span className="mx-1 h-6 w-px bg-gray-200" />
            <SaveAsTemplateButton
              campaignId={campaignId}
              participants={participants.map((p) => ({
                id: p.id,
                display_name: p.display_name,
                max_hp: p.max_hp,
                role: p.role,
                sort_order: p.sort_order,
                node_id: p.node_id,
              }))}
            />
            <button
              onClick={handleEndCombat}
              className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              Стоп
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 960 }}>
          <thead>
            <tr className="bg-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="border border-gray-200 w-8 px-1 py-1.5 text-center" />
              <th className="border border-gray-200 w-16 px-1 py-1.5 text-center">Ин.</th>
              <th className="border border-gray-200 px-2 py-1.5 text-left">Имя</th>
              <th className="border border-gray-200 w-[180px] px-2 py-1.5 text-left">Состояния</th>
              <th className="border border-gray-200 w-[180px] px-2 py-1.5 text-left">Эффекты</th>
              <th className="border border-gray-200 w-32 px-2 py-1.5 text-center">HP</th>
              <th className="border border-gray-200 w-10 px-1 py-1.5 text-center" title="Временные хиты">Вр.</th>
              <th className="border border-gray-200 w-[140px] px-1 py-1.5 text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="border border-gray-200 py-8 text-center text-gray-400">Добавьте участников ↓</td>
              </tr>
            )}
            {sorted.map((p) => {
              const isTurn = p.id === turns.turnId
              const isDown = p.current_hp === 0 && p.max_hp > 0
              const statUrl = p.node?.fields?.statblock_url as string | undefined

              let rowBg = ROLE_ROW[p.role] || ''
              if (isDown) rowBg = 'bg-red-50/60'
              if (isTurn) rowBg = 'bg-yellow-50'
              if (!p.is_active) rowBg = ''

              return (
                <tr key={p.id}
                  onClick={(e) => selection.toggleSelect(p.id, e)}
                  className={`${rowBg} ${!p.is_active ? 'opacity-25' : ''} ${isTurn ? 'ring-1 ring-inset ring-yellow-400' : ''} ${selection.isSelected(p.id) ? 'outline outline-2 -outline-offset-2 outline-blue-400 bg-blue-50/40' : ''} cursor-default select-none`}
                >
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <button onClick={() => actions.onRole(p.id)} disabled={done}
                      className={`inline-block h-2.5 w-2.5 rounded-full ${ROLE_DOT[p.role] || ROLE_DOT.enemy} ${done ? '' : 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'} transition-all`}
                      title={`${ROLE_LABEL[p.role] || p.role} — клик для смены`} />
                  </td>
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <EditableCell value={p.initiative} onCommit={(v) => actions.onInit(p.id, v)} type="number" placeholder="—" disabled={done} className="text-center font-mono text-xs" />
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    <div className="flex items-center gap-1">
                      {done ? (
                        p.node ? (
                          <Link href={`/c/${campaignSlug}/catalog/${p.node.id}`} className="font-medium text-blue-700 hover:underline truncate text-sm">{p.display_name}</Link>
                        ) : (
                          <span className={`font-medium truncate text-sm ${isDown ? 'text-red-700 line-through' : ''}`}>{p.display_name}</span>
                        )
                      ) : (
                        <NameCell
                          value={p.display_name}
                          onCommit={(v) => actions.onName(p.id, v)}
                          onInspect={onInspect ? () => onInspect(p.id) : undefined}
                          disabled={done}
                          className={`font-medium ${p.node ? 'text-blue-700' : isDown ? 'text-red-700 line-through' : ''}`}
                        />
                      )}
                      {statUrl && (
                        <a href={statUrl} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-medium text-blue-500 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 transition-colors"
                          title="Открыть статблок">
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          стат
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="border border-gray-200 px-1 py-1">
                    <TagCell tags={p.conditions || []} suggestions={conditionNames} onChange={(c) => actions.onConds(p.id, c)} currentRound={turns.round} placeholder="+" disabled={done} />
                  </td>
                  <td className="border border-gray-200 px-1 py-1">
                    <TagCell tags={p.effects || []} suggestions={effectNames} onChange={(e) => actions.onEffects(p.id, e)} currentRound={turns.round} placeholder="+" disabled={done} />
                  </td>
                  <td className="border border-gray-200 px-1 py-1">
                    <HpCell currentHp={p.current_hp} maxHp={p.max_hp}
                      onHpChange={(hp) => actions.onHp(p.id, hp)}
                      onMaxHpChange={(max, cur) => actions.onMaxHp(p.id, max, cur)}
                      onRawInput={(raw) => actions.onHpRaw(p.id, raw)}
                      disabled={done} />
                  </td>
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <EditableCell value={p.temp_hp || null} onCommit={(v) => actions.onTempHp(p.id, v)} type="number" placeholder="—" disabled={done} className="text-center font-mono text-xs" />
                  </td>
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    {!done && (
                      <div
                        className="flex items-center justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => actions.onClone(p.id)}
                          title="Клонировать"
                          className="inline-flex h-7 items-center gap-1 rounded border border-gray-200 px-2 text-[11px] text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
                        >
                          <span>⧉</span>
                          <span>Клон</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => actions.onDelete(p.id)}
                          title="Удалить участника"
                          className="inline-flex h-7 items-center gap-1 rounded border border-gray-200 px-2 text-[11px] text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-colors"
                        >
                          <span>✕</span>
                          <span>Удал.</span>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {!done && (
        <div className="border border-t-0 border-gray-200 bg-gray-50/50">
          <AddParticipantRow catalogNodes={catalogNodes} onAddFromCatalog={actions.addFromCatalog} onAddManual={actions.addManual} />
        </div>
      )}

      {/* Floating selection toast — doesn't shift table layout */}
      {selection.selCount > 0 && (
        <div
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border border-blue-200 bg-white px-4 py-2 text-xs text-blue-700 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <span className="font-medium">Выделено: {selection.selCount}</span>
            <span className="text-blue-300">·</span>
            <span className="text-blue-500">Изменение в одной строке → все выделенные</span>
            <button
              onClick={selection.clearSelection}
              className="rounded-full px-2 py-0.5 text-blue-500 hover:bg-blue-50 transition-colors"
            >
              Снять ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

// ── Small helper: labelled numeric detail in the header bar ─────────

function DetailField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string
  value: string | null
  onCommit: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-gray-400">{label}</span>
      <EditableCell
        value={value}
        onCommit={onCommit}
        type="number"
        placeholder="—"
        disabled={disabled}
        className="w-12 text-center font-mono text-base font-bold"
      />
    </div>
  )
}
