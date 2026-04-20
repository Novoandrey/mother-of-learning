'use client'

import { useState, useMemo, useCallback, useRef, useImperativeHandle, useEffect, forwardRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { EditableCell } from './editable-cell'
import { HpCell } from './hp-cell'
import { TagCell } from './tag-cell'
import { AddParticipantRow } from './add-participant-row'
import { NameCell } from './name-cell'
import { DeathSavesCell } from './death-saves-cell'
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
  ac: number | null
  death_saves: { successes: number; failures: number }
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

const ROLE_LABEL: Record<string, string> = {
  pc: 'PC', ally: 'Союз', enemy: 'Враг', neutral: '—',
}
const ROLE_DOT_COLOR: Record<string, string> = {
  pc: 'var(--blue-500)',
  ally: 'var(--green-500)',
  enemy: 'var(--red-500)',
  neutral: 'var(--gray-400)',
}

export type EncounterGridHandle = {
  addFromCatalogExternal: (nodeId: string, displayName: string, maxHp: number, qty: number) => void
}

// Shared cell class — excel-like gridlines between cells.
// Every <td> and <th> gets this except the last column which drops
// the right border (handled by not applying it on last cell).
const CELL = 'border-r'
const CELL_STYLE: React.CSSProperties = { borderRightColor: 'var(--gray-200)' }

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

  useEffect(() => { onActiveChange?.(turns.turnId) }, [turns.turnId, onActiveChange])
  useEffect(() => { onParticipantsChange?.(participants) }, [participants, onParticipantsChange])

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

  // ── Render ──────────────────────────────────────────

  return (
    <div>
      {/* Header bar */}
      <div
        className="mb-3 flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border px-4 py-3"
        style={{ borderColor: 'var(--gray-200)', background: 'var(--gray-0)' }}
      >
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

        <div className="flex items-center gap-3">
          <DetailField label="Сессия" value={details.session || null} onCommit={(v) => saveDetail('session', v)} disabled={done} />
          <DetailField label="Петля" value={details.loop || null} onCommit={(v) => saveDetail('loop', v)} disabled={done} />
          <DetailField label="День" value={details.day || null} onCommit={(v) => saveDetail('day', v)} disabled={done} />
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--fg-mute)' }}>Раунд</span>
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
            <span className="min-w-[2ch] text-center font-mono text-[16px] font-bold tabular" style={{ color: 'var(--fg-1)' }}>
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
                <span className="text-[11px]" style={{ color: 'var(--fg-mute)' }}>Начать →</span>
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
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--blue-600)' }}
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
              className="rounded-[var(--radius-md)] border px-2.5 py-1.5 text-[11px] transition-colors"
              style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-3)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--red-500)'
                e.currentTarget.style.color = 'var(--red-600)'
                e.currentTarget.style.background = 'var(--red-50)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--gray-200)'
                e.currentTarget.style.color = 'var(--fg-3)'
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Стоп
            </button>
          </div>
        )}
      </div>

      {/* Table — Excel-style: outer border, full gridlines, crisp separators.
          NOTE: overflow-x-auto wraps ONLY the <table> so that AddParticipantRow
          below can live at full width and its dropdown is free to escape the
          overflow container vertically. */}
      <div
        className="rounded-[var(--radius-lg)] border"
        style={{ borderColor: 'var(--gray-300)', background: 'var(--gray-0)' }}
      >
        <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-[13px]"
          style={{ minWidth: 1120 }}
        >
          <thead>
            <tr
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: 'var(--gray-100)',
                color: 'var(--fg-3)',
                borderBottom: '1px solid var(--gray-300)',
              }}
            >
              <th className={`w-10 px-1 py-2 text-center ${CELL}`} style={CELL_STYLE} title="Номер строки · клик = выделить">#</th>
              <th className={`w-14 px-1 py-2 text-center ${CELL}`} style={CELL_STYLE}>Ин.</th>
              <th className={`w-12 px-1 py-2 text-center ${CELL}`} style={CELL_STYLE} title="Класс доспеха (КД)">AC</th>
              <th className={`px-3 py-2 text-left ${CELL}`} style={CELL_STYLE}>Имя</th>
              <th className={`w-[180px] px-2 py-2 text-left ${CELL}`} style={CELL_STYLE}>Состояния</th>
              <th className={`w-[180px] px-2 py-2 text-left ${CELL}`} style={CELL_STYLE}>Эффекты</th>
              <th className={`w-28 px-2 py-2 text-center ${CELL}`} style={CELL_STYLE}>HP</th>
              <th className={`w-12 px-1 py-2 text-center ${CELL}`} style={CELL_STYLE} title="Временные хиты">Вр.</th>
              <th className={`w-[120px] px-1 py-2 text-center ${CELL}`} style={CELL_STYLE} title="Спасброски от смерти (только для PC на 0 HP)">Смерть</th>
              <th className="w-[140px] px-1 py-2 text-center">Действия</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={10} className="py-10 text-center text-[13px]" style={{ color: 'var(--fg-mute)' }}>
                  Добавьте участников ↓
                </td>
              </tr>
            )}
            {sorted.map((p, idx) => {
              const isTurn = p.id === turns.turnId
              const isDown = p.current_hp === 0 && p.max_hp > 0
              const selected = selection.isSelected(p.id)
              const statUrl = p.node?.fields?.statblock_url as string | undefined

              // ── Row state combinations ────────────────────
              // Turn:        amber stripe + amber-50 tint + bold ring + ► marker
              // Selected:    blue stripe + blue-50 tint
              // Turn+Sel:    blue-50 tint + amber stripe + amber ring (both visible)
              // Down:        red-50 tint
              // Inactive:    opacity 0.4
              let rowBg: string = 'transparent'
              if (isTurn && selected) rowBg = 'var(--blue-50)'
              else if (isTurn) rowBg = 'var(--yellow-50)'
              else if (selected) rowBg = 'var(--blue-50)'
              else if (isDown) rowBg = 'var(--red-50)'
              else if (idx % 2 === 1) rowBg = 'var(--gray-50)' // zebra

              const stripe = isTurn
                ? 'var(--amber-400)'
                : selected
                  ? 'var(--blue-500)'
                  : 'transparent'

              // Turn ring — outlines the whole row with amber inside.
              const boxShadow = isTurn
                ? `inset 4px 0 0 0 ${stripe}, inset 0 0 0 1px var(--amber-400)`
                : selected
                  ? `inset 4px 0 0 0 ${stripe}`
                  : 'none'

              return (
                <tr
                  key={p.id}
                  onClick={(e) => selection.toggleSelect(p.id, e)}
                  className="cursor-default select-none transition-colors"
                  style={{
                    background: rowBg,
                    opacity: p.is_active ? 1 : 0.4,
                    boxShadow,
                  }}
                  onMouseEnter={(e) => {
                    if (!isTurn && !selected && !isDown && p.is_active) {
                      e.currentTarget.style.background = 'var(--blue-50)'
                    }
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = rowBg }}
                >
                  {/* # column — row index + bulk-select indicator.
                      Turn marker ▶ lives here too; row state bg+stripe from row-level style.
                      Clicking the row already toggles selection (tr onClick), so this cell
                      just visualises that with the index number + selected pill. */}
                  <td
                    className={`px-1 py-1 text-center align-middle ${CELL}`}
                    style={{
                      ...CELL_STYLE,
                      borderBottom: '1px solid var(--gray-200)',
                      height: 34,
                    }}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {isTurn && (
                        <span
                          className="font-bold leading-none"
                          style={{ color: 'var(--amber-400)', fontSize: 14 }}
                          title="Текущий ход"
                        >
                          ▶
                        </span>
                      )}
                      <span
                        className="font-mono tabular text-[11px]"
                        style={{
                          color: selected ? 'var(--blue-700)' : 'var(--fg-mute)',
                          fontWeight: selected ? 700 : 500,
                        }}
                      >
                        {idx + 1}
                      </span>
                    </div>
                  </td>

                  {/* Initiative */}
                  <td
                    className={`px-1 py-1 text-center align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
                    <EditableCell
                      value={p.initiative}
                      onCommit={(v) => actions.onInit(p.id, v)}
                      type="number"
                      placeholder="—"
                      disabled={done}
                      className="text-center font-mono tabular"
                    />
                  </td>

                  {/* AC */}
                  <td
                    className={`px-1 py-1 text-center align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
                    <EditableCell
                      value={p.ac}
                      onCommit={(v) => actions.onAc(p.id, v)}
                      type="number"
                      placeholder="—"
                      disabled={done}
                      className="text-center font-mono tabular"
                    />
                  </td>

                  {/* Name + role dot + statblock link */}
                  <td
                    className={`px-3 py-1 align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      {/* Role dot — click to cycle enemy→pc→ally→neutral. Tooltip shows label. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          actions.onRole(p.id)
                        }}
                        disabled={done}
                        className={`flex-shrink-0 inline-block h-2.5 w-2.5 rounded-full transition-all ${
                          done ? '' : 'cursor-pointer hover:ring-2 hover:ring-offset-1'
                        }`}
                        style={{ background: ROLE_DOT_COLOR[p.role] || ROLE_DOT_COLOR.enemy }}
                        title={`${ROLE_LABEL[p.role] || p.role} — клик для смены`}
                      />
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
                          className={`font-medium ${p.node ? 'text-[var(--blue-700)]' : ''} ${isTurn ? 'font-bold' : ''} ${
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
                          style={{ background: 'var(--blue-50)', color: 'var(--blue-600)' }}
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
                  <td
                    className={`px-1 py-1 align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
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
                  <td
                    className={`px-1 py-1 align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
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
                  <td
                    className={`px-1 py-1 align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
                    <HpCell
                      currentHp={p.current_hp}
                      maxHp={p.max_hp}
                      onHpChange={(hp) => actions.onHp(p.id, hp)}
                      onMaxHpChange={(max, cur) => actions.onMaxHp(p.id, max, cur)}
                      onRawInput={(raw) => actions.onHpRaw(p.id, raw)}
                      disabled={done}
                    />
                  </td>

                  {/* Temp HP — delta-aware cell (custom) */}
                  <td
                    className={`px-1 py-1 text-center align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
                    <EditableCell
                      value={p.temp_hp || null}
                      onCommit={(v) => actions.onTempHp(p.id, v, p.temp_hp)}
                      type="text"
                      placeholder="—"
                      disabled={done}
                      className="text-center font-mono tabular"
                    />
                  </td>

                  {/* Death saves — only for PCs at 0 HP; blank otherwise.
                      Keeps alignment stable; non-PC rows show an em-dash. */}
                  <td
                    className={`px-1 py-1 align-middle ${CELL}`}
                    style={{ ...CELL_STYLE, borderBottom: '1px solid var(--gray-200)' }}
                  >
                    <DeathSavesCell
                      successes={p.death_saves?.successes ?? 0}
                      failures={p.death_saves?.failures ?? 0}
                      visible={p.node?.type?.slug === 'character' && p.current_hp === 0 && p.max_hp > 0}
                      onTick={(kind) => actions.onDeathSaveTick(p.id, kind)}
                      onReset={() => actions.onDeathSavesReset(p.id)}
                      disabled={done}
                    />
                  </td>

                  {/* Row actions */}
                  <td
                    className="px-1 py-1 text-center align-middle"
                    style={{ borderBottom: '1px solid var(--gray-200)' }}
                  >
                    {!done && (
                      <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => actions.onClone(p.id)}
                          title="Клонировать"
                          className="inline-flex h-7 items-center gap-1 rounded-[var(--radius)] border px-2 text-[11px] transition-colors"
                          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-3)', background: 'var(--gray-0)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--gray-100)'
                            e.currentTarget.style.color = 'var(--fg-1)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--gray-0)'
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
                          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-3)', background: 'var(--gray-0)' }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--red-50)'
                            e.currentTarget.style.borderColor = 'var(--red-500)'
                            e.currentTarget.style.color = 'var(--red-600)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--gray-0)'
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
        </div>

        {!done && (
          <div style={{ borderTop: '1px solid var(--gray-300)', background: 'var(--gray-50)' }}>
            <AddParticipantRow
              catalogNodes={catalogNodes}
              onAddFromCatalog={actions.addFromCatalog}
              onAddManual={actions.addManual}
            />
          </div>
        )}
      </div>

      {/* Floating selection toast */}
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
            <span style={{ color: 'var(--blue-500)' }}>Изменение в одной строке → все выделенные</span>
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

function DetailField({
  label, value, onCommit, disabled,
}: {
  label: string
  value: string | null
  onCommit: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--fg-mute)' }}>{label}</span>
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
