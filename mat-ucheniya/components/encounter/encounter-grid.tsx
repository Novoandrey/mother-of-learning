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
  onActiveChange?: (participantId: string | null) => void
  onInspect?: (participantId: string) => void
  onParticipantsChange?: (participants: Participant[]) => void
}

// ── Role config ─────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  pc: 'PC', ally: 'Союз', enemy: 'Враг', neutral: '—',
}

// Role dot colors (sourced from design tokens).
const ROLE_DOT_COLOR: Record<string, string> = {
  pc: 'var(--blue-500)',
  ally: 'var(--green-500)',
  enemy: 'var(--red-500)',
  neutral: 'var(--gray-400)',
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
  const [participants, setParticipants] = useState(initialParticipants)
  const [details, setDetails] = useState<Record<string, string>>(initial.details || {})
  const [status, setStatus] = useState(initial.status)
  const done = status === 'completed'

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

  const selection = useSelection(sortedIds, done)

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

  roundRef.current = turns.round

  useEffect(() => {
    onActiveChange?.(turns.turnId)
  }, [turns.turnId, onActiveChange])

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

  const saveDetail = useCallback(async (key: string, value: string) => {
    const updated = { ...details, [key]: value }
    setDetails(updated)
    try {
      const s = createClient()
      await s.from('encounters').update({ details: updated }).eq('id', initial.id)
    } catch { /* best-effort */ }
  }, [details, initial.id])

  const handleEndCombat = useCallback(async () => {
    setStatus('completed')
    await actions.endCombat()
  }, [actions])

  useImperativeHandle(ref, () => ({
    addFromCatalogExternal: actions.addFromCatalog,
  }), [actions.addFromCatalog])

  // ── Render ────────────────────────────────────────

  return (
    <div>
      {/* ── Header bar ─────────────────────────────────── */}
      <div
        className="mb-3 flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border px-4 py-3"
        style={{
          borderColor: 'var(--gray-200)',
          background: 'var(--gray-0)',
        }}
      >
        {/* Title */}
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-bold" style={{ color: 'var(--fg-1)' }}>
            {initial.title}
          </span>
          {done && (
            <span
              className="rounded px-2 py-0.5 text-[10px] font-medium"
              style={{ background: 'var(--gray-200)', color: 'var(--fg-3)' }}
            >
              Завершён
            </span>
          )}
        </div>

        {/* Session / Loop / Day / Round */}
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
            <span
              className="text-[10px] uppercase tracking-wider"
              style={{ color: 'var(--fg-mute)' }}
            >
              Раунд
            </span>
            {!done && (
              <button
                onClick={() => turns.setRound(-1)}
                disabled={turns.round <= 1}
                className="h-7 w-7 rounded-[var(--radius)] border text-sm transition-colors disabled:opacity-30 hover:bg-[var(--gray-100)]"
                style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-3)' }}
                aria-label="Предыдущий раунд"
              >
                −
              </button>
            )}
            <span
              className="min-w-[2ch] text-center font-mono text-[16px] font-bold tabular"
              style={{ color: 'var(--fg-1)' }}
            >
              {turns.round}
            </span>
            {!done && (
              <button
                onClick={() => turns.setRound(1)}
                className="h-7 w-7 rounded-[var(--radius)] border text-sm transition-colors hover:bg-[var(--gray-100)]"
                style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-3)' }}
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
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-[13px] font-semibold transition-colors hover:bg-[var(--gray-200)] disabled:opacity-30"
              style={{ background: 'var(--gray-100)', color: 'var(--gray-700)' }}
            >
              <span className="text-base leading-none">←</span>
              <span>Предыдущий</span>
            </button>
            <div className="min-w-[120px] px-2 text-center">
              {turns.currentTurnName ? (
                <span className="text-[13px] font-semibold" style={{ color: 'var(--blue-700)' }}>
                  {turns.currentTurnName}
                </span>
              ) : (
                <span className="text-[11px]" style={{ color: 'var(--fg-mute)' }}>
                  Начать →
                </span>
              )}
            </div>
            <button
              onClick={turns.advanceTurn}
              disabled={!inCombat.length}
              title="→ или Space"
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] px-3 text-[13px] font-semibold text-white transition-colors disabled:opacity-30"
              style={{ background: 'var(--blue-600)' }}
              onMouseEnter={(e) => {
                if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--blue-700)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--blue-600)'
              }}
            >
              <span>Следующий</span>
              <span className="text-base leading-none">→</span>
            </button>
            <span className="mx-1 h-6 w-px" style={{ background: 'var(--gray-200)' }} />
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
              className="rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[11px] transition-colors hover:bg-[var(--red-50)]"
              style={{
                borderColor: 'var(--gray-200)',
                color: 'var(--fg-3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--red-500)'
                e.currentTarget.style.color = 'var(--red-600)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--gray-200)'
                e.currentTarget.style.color = 'var(--fg-3)'
              }}
            >
              Стоп
            </button>
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────── */}
      <div
        className="overflow-x-auto rounded-[var(--radius-lg)] border"
        style={{ borderColor: 'var(--gray-200)', background: 'var(--gray-0)' }}
      >
        <table className="w-full border-collapse text-[13px]" style={{ minWidth: 960 }}>
          <thead>
            <tr
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: 'var(--gray-50)',
                color: 'var(--fg-3)',
                borderBottom: '1px solid var(--gray-200)',
              }}
            >
              <th className="w-8 px-1 py-2 text-center" />
              <th className="w-14 px-1 py-2 text-center">Ин.</th>
              <th className="px-3 py-2 text-left">Имя</th>
              <th className="w-[180px] px-2 py-2 text-left">Состояния</th>
              <th className="w-[180px] px-2 py-2 text-left">Эффекты</th>
              <th className="w-28 px-2 py-2 text-center">HP</th>
              <th className="w-10 px-1 py-2 text-center" title="Временные хиты">Вр.</th>
              <th className="w-[140px] px-1 py-2 text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="py-10 text-center text-[13px]"
                  style={{ color: 'var(--fg-mute)' }}
                >
                  Добавьте участников ↓
                </td>
              </tr>
            )}
            {sorted.map((p) => {
              const isTurn = p.id === turns.turnId
              const isDown = p.current_hp === 0 && p.max_hp > 0
              const selected = selection.isSelected(p.id)
              const statUrl = p.node?.fields?.statblock_url as string | undefined

              // Row background priority: turn > selected > down > inactive > default.
              let rowBg: string = 'transparent'
              if (!p.is_active) rowBg = 'transparent'
              else if (isTurn) rowBg = 'var(--blue-50)'
              else if (selected) rowBg = 'var(--blue-50)'
              else if (isDown) rowBg = 'var(--red-50)'

              // Left accent stripe (3px) indicates turn or selection.
              const leftAccent =
                isTurn ? 'var(--blue-500)' : selected ? 'var(--blue-400)' : 'transparent'

              return (
                <tr
                  key={p.id}
                  onClick={(e) => selection.toggleSelect(p.id, e)}
                  className="cursor-default select-none transition-colors"
                  style={{
                    background: rowBg,
                    borderBottom: '1px solid var(--gray-100)',
                    opacity: p.is_active ? 1 : 0.35,
                    boxShadow: leftAccent !== 'transparent' ? `inset 3px 0 0 0 ${leftAccent}` : 'none',
                  }}
                  onMouseEnter={(e) => {
                    if (!isTurn && !selected && !isDown && p.is_active) {
                      e.currentTarget.style.background = 'var(--gray-50)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = rowBg
                  }}
                >
                  {/* Role dot */}
                  <td className="px-1 py-1 text-center align-middle">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        actions.onRole(p.id)
                      }}
                      disabled={done}
                      className={`inline-block h-2.5 w-2.5 rounded-full transition-all ${
                        done ? '' : 'cursor-pointer hover:ring-2 hover:ring-offset-1'
                      }`}
                      style={{ background: ROLE_DOT_COLOR[p.role] || ROLE_DOT_COLOR.enemy }}
                      title={`${ROLE_LABEL[p.role] || p.role} — клик для смены`}
                    />
                  </td>

                  {/* Initiative */}
                  <td className="px-1 py-1 text-center align-middle">
                    <EditableCell
                      value={p.initiative}
                      onCommit={(v) => actions.onInit(p.id, v)}
                      type="number"
                      placeholder="—"
                      disabled={done}
                      className="text-center font-mono tabular"
                    />
                  </td>

                  {/* Name + statblock link */}
                  <td className="px-3 py-1 align-middle">
                    <div className="flex items-center gap-1.5">
                      {done ? (
                        p.node ? (
                          <Link
                            href={`/c/${campaignSlug}/catalog/${p.node.id}`}
                            className="truncate text-[13px] font-medium hover:underline"
                            style={{ color: 'var(--blue-700)' }}
                          >
                            {p.display_name}
                          </Link>
                        ) : (
                          <span
                            className="truncate text-[13px] font-medium"
                            style={{
                              color: isDown ? 'var(--red-700)' : 'var(--fg-1)',
                              textDecoration: isDown ? 'line-through' : 'none',
                            }}
                          >
                            {p.display_name}
                          </span>
                        )
                      ) : (
                        <NameCell
                          value={p.display_name}
                          onCommit={(v) => actions.onName(p.id, v)}
                          onInspect={onInspect ? () => onInspect(p.id) : undefined}
                          disabled={done}
                          className={`font-medium ${p.node ? 'text-[var(--blue-700)]' : ''} ${
                            isDown ? 'line-through text-[var(--red-700)]' : ''
                          }`}
                        />
                      )}
                      {statUrl && (
                        <a
                          href={statUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex-shrink-0 inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                          style={{
                            background: 'var(--blue-50)',
                            color: 'var(--blue-600)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--blue-100)'
                            e.currentTarget.style.color = 'var(--blue-700)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--blue-50)'
                            e.currentTarget.style.color = 'var(--blue-600)'
                          }}
                          title="Открыть статблок"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
                          стат
                        </a>
                      )}
                    </div>
                  </td>

                  {/* Conditions */}
                  <td className="px-1 py-1 align-middle">
                    <TagCell
                      tags={p.conditions || []}
                      suggestions={conditionNames}
                      onChange={(c) => actions.onConds(p.id, c)}
                      currentRound={turns.round}
                      placeholder="+"
                      disabled={done}
                    />
                  </td>

                  {/* Effects */}
                  <td className="px-1 py-1 align-middle">
                    <TagCell
                      tags={p.effects || []}
                      suggestions={effectNames}
                      onChange={(e) => actions.onEffects(p.id, e)}
                      currentRound={turns.round}
                      placeholder="+"
                      disabled={done}
                    />
                  </td>

                  {/* HP */}
                  <td className="px-1 py-1 align-middle">
                    <HpCell
                      currentHp={p.current_hp}
                      maxHp={p.max_hp}
                      onHpChange={(hp) => actions.onHp(p.id, hp)}
                      onMaxHpChange={(max, cur) => actions.onMaxHp(p.id, max, cur)}
                      onRawInput={(raw) => actions.onHpRaw(p.id, raw)}
                      disabled={done}
                    />
                  </td>

                  {/* Temp HP */}
                  <td className="px-1 py-1 text-center align-middle">
                    <EditableCell
                      value={p.temp_hp || null}
                      onCommit={(v) => actions.onTempHp(p.id, v)}
                      type="number"
                      placeholder="—"
                      disabled={done}
                      className="text-center font-mono tabular"
                    />
                  </td>

                  {/* Row actions */}
                  <td className="px-1 py-1 text-center align-middle">
                    {!done && (
                      <div
                        className="flex items-center justify-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => actions.onClone(p.id)}
                          title="Клонировать"
                          className="inline-flex h-7 items-center gap-1 rounded-[var(--radius)] border px-2 text-[11px] transition-colors"
                          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-3)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--gray-100)'
                            e.currentTarget.style.color = 'var(--fg-1)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--fg-3)'
                          }}
                        >
                          <span>⧉</span>
                          <span>Клон</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => actions.onDelete(p.id)}
                          title="Удалить участника"
                          className="inline-flex h-7 items-center gap-1 rounded-[var(--radius)] border px-2 text-[11px] transition-colors"
                          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-3)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--red-50)'
                            e.currentTarget.style.borderColor = 'var(--red-500)'
                            e.currentTarget.style.color = 'var(--red-600)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.borderColor = 'var(--gray-200)'
                            e.currentTarget.style.color = 'var(--fg-3)'
                          }}
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

        {/* Add participant row — sits inside the rounded card, flush with table */}
        {!done && (
          <div
            style={{
              borderTop: '1px solid var(--gray-200)',
              background: 'var(--gray-50)',
            }}
          >
            <AddParticipantRow
              catalogNodes={catalogNodes}
              onAddFromCatalog={actions.addFromCatalog}
              onAddManual={actions.addManual}
            />
          </div>
        )}
      </div>

      {/* ── Floating selection toast ──────────────── */}
      {selection.selCount > 0 && (
        <div
          className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full border px-4 py-2 text-[11px]"
          style={{
            borderColor: 'var(--blue-200)',
            background: 'var(--gray-0)',
            color: 'var(--blue-700)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div className="flex items-center gap-3">
            <span className="font-semibold">Выделено: {selection.selCount}</span>
            <span style={{ color: 'var(--blue-200)' }}>·</span>
            <span style={{ color: 'var(--blue-500)' }}>
              Изменение в одной строке → все выделенные
            </span>
            <button
              onClick={selection.clearSelection}
              className="rounded-full px-2 py-0.5 transition-colors hover:bg-[var(--blue-50)]"
              style={{ color: 'var(--blue-500)' }}
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
      <span
        className="text-[10px] uppercase tracking-wider"
        style={{ color: 'var(--fg-mute)' }}
      >
        {label}
      </span>
      <EditableCell
        value={value}
        onCommit={onCommit}
        type="number"
        placeholder="—"
        disabled={disabled}
        className="w-12 text-center font-mono tabular text-[15px] font-bold"
      />
    </div>
  )
}
