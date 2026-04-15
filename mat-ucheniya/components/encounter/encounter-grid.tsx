'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { EncounterHeader } from './encounter-header'
import { EditableCell } from './editable-cell'
import { HpCell } from './hp-cell'
import { TagCell } from './tag-cell'
import { AddParticipantRow } from './add-participant-row'
import { EncounterDetailsCard } from '@/components/encounter-details-card'
import {
  updateRound,
  updateInitiative,
  updateHp,
  updateMaxHp,
  updateParticipantName,
  updateConditions,
  updateEffects,
  updateRole,
  updateTempHp,
  toggleParticipantActive,
  deleteParticipant,
  cloneParticipant,
  updateEncounterStatus,
  addParticipantFromCatalog,
  addParticipantManual,
} from '@/lib/encounter-actions'

// ── Types ────────────────────────────────────────────

type Encounter = {
  id: string
  title: string
  status: 'active' | 'completed'
  current_round: number
  current_turn_id?: string | null
  details: Record<string, string>
}

type Participant = {
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
  conditions: string[]
  effects: string[]
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
  conditionNames: string[]
  effectNames: string[]
}

// ── Role helpers ────────────────────────────────────

const ROLES = ['enemy', 'pc', 'ally', 'neutral'] as const
const ROLE_COLORS: Record<string, { dot: string; row: string }> = {
  pc:      { dot: 'bg-blue-500',   row: 'bg-blue-50/40' },
  ally:    { dot: 'bg-green-500',  row: 'bg-green-50/40' },
  enemy:   { dot: 'bg-red-500',    row: 'bg-red-50/30' },
  neutral: { dot: 'bg-gray-400',   row: '' },
}

function nextRole(current: string): string {
  const idx = ROLES.indexOf(current as typeof ROLES[number])
  return ROLES[(idx + 1) % ROLES.length]
}

// ── Component ────────────────────────────────────────

export function EncounterGrid({
  encounter: initial,
  initialParticipants,
  catalogNodes,
  campaignId,
  campaignSlug,
  conditionNames,
  effectNames,
}: Props) {
  const router = useRouter()
  const [encounter, setEncounter] = useState(initial)
  const [participants, setParticipants] = useState(initialParticipants)
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(initial.current_turn_id || null)

  const isCompleted = encounter.status === 'completed'

  // Sort: initiative DESC (nulls last), then sort_order
  const sorted = useMemo(() => {
    return [...participants].sort((a, b) => {
      if (a.initiative != null && b.initiative != null) {
        const diff = b.initiative - a.initiative
        return diff !== 0 ? diff : a.sort_order - b.sort_order
      }
      if (a.initiative != null) return -1
      if (b.initiative != null) return 1
      return a.sort_order - b.sort_order
    })
  }, [participants])

  // Active participants with initiative (in combat)
  const inCombat = useMemo(() => sorted.filter((p) => p.initiative != null && p.is_active), [sorted])

  // ── Handlers ────────────────────────────────────────

  const handleRoundChange = useCallback(async (delta: number) => {
    const newRound = Math.max(1, encounter.current_round + delta)
    setEncounter((prev) => ({ ...prev, current_round: newRound }))
    try { await updateRound(encounter.id, newRound) } catch { router.refresh() }
  }, [encounter, router])

  const handleNextTurn = useCallback(async () => {
    if (inCombat.length === 0) return
    const currentIdx = currentTurnId ? inCombat.findIndex((p) => p.id === currentTurnId) : -1
    let nextIdx = currentIdx + 1
    if (nextIdx >= inCombat.length) {
      nextIdx = 0
      handleRoundChange(1)
    }
    const nextId = inCombat[nextIdx].id
    setCurrentTurnId(nextId)
    // Persist to DB (best-effort)
    try {
      const supabase = createClient()
      await supabase.from('encounters').update({ current_turn_id: nextId }).eq('id', encounter.id)
    } catch { /* non-critical */ }
  }, [currentTurnId, inCombat, encounter.id, handleRoundChange])

  const handleInitiativeChange = useCallback(async (id: string, value: string) => {
    const parsed = value === '' ? null : parseFloat(value)
    if (value !== '' && isNaN(parsed!)) return
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, initiative: parsed } : p)))
    try { await updateInitiative(id, parsed) } catch { router.refresh() }
  }, [router])

  const handleHpChange = useCallback(async (id: string, newHp: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, current_hp: newHp } : p)))
    try { await updateHp(id, newHp) } catch { router.refresh() }
  }, [router])

  const handleMaxHpChange = useCallback(async (id: string, maxHp: number, currentHp: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, max_hp: maxHp, current_hp: currentHp } : p)))
    try { await updateMaxHp(id, maxHp, currentHp) } catch { router.refresh() }
  }, [router])

  const handleTempHpChange = useCallback(async (id: string, value: string) => {
    const n = parseInt(value) || 0
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, temp_hp: Math.max(0, n) } : p)))
    try { await updateTempHp(id, Math.max(0, n)) } catch { router.refresh() }
  }, [router])

  const handleNameChange = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, display_name: name.trim() } : p)))
    try { await updateParticipantName(id, name.trim()) } catch { router.refresh() }
  }, [router])

  const handleRoleChange = useCallback(async (id: string) => {
    const p = participants.find((p) => p.id === id)
    if (!p) return
    const newRole = nextRole(p.role || 'enemy')
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, role: newRole } : p)))
    try { await updateRole(id, newRole) } catch { router.refresh() }
  }, [participants, router])

  const handleConditionsChange = useCallback(async (id: string, conditions: string[]) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, conditions } : p)))
    try { await updateConditions(id, conditions) } catch { router.refresh() }
  }, [router])

  const handleEffectsChange = useCallback(async (id: string, effects: string[]) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, effects } : p)))
    try { await updateEffects(id, effects) } catch { router.refresh() }
  }, [router])

  const handleToggleActive = useCallback(async (id: string) => {
    const p = participants.find((p) => p.id === id)
    if (!p) return
    const newActive = !p.is_active
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: newActive } : p)))
    try { await toggleParticipantActive(id, newActive) } catch { router.refresh() }
  }, [participants, router])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Удалить участника?')) return
    setParticipants((prev) => prev.filter((p) => p.id !== id))
    try { await deleteParticipant(id) } catch { router.refresh() }
  }, [router])

  const handleClone = useCallback(async (id: string) => {
    try {
      const result = await cloneParticipant(id)
      setParticipants((prev) => {
        const updated = prev.map((p) =>
          p.id === id ? { ...p, display_name: result.updatedOriginalName } : p
        )
        const clone = result.clone as typeof prev[0]
        const idx = updated.findIndex((p) => p.id === id)
        return [...updated.slice(0, idx + 1), clone, ...updated.slice(idx + 1)]
      })
    } catch { router.refresh() }
  }, [router])

  const handleEndCombat = useCallback(async () => {
    if (!confirm('Завершить бой?')) return
    setEncounter((prev) => ({ ...prev, status: 'completed' }))
    try { await updateEncounterStatus(encounter.id, 'completed') } catch { router.refresh() }
  }, [encounter.id, router])

  const handleAddManual = useCallback(async (displayName: string, maxHp: number) => {
    try {
      const newRow = await addParticipantManual(encounter.id, displayName, maxHp)
      setParticipants((prev) => [...prev, { ...newRow, node: null, conditions: [], effects: [], temp_hp: 0, role: 'enemy' }])
    } catch (e) { console.error(e) }
  }, [encounter.id])

  const handleAddFromCatalog = useCallback(async (
    nodeId: string, displayName: string, maxHp: number, quantity: number
  ) => {
    try {
      const catalogNode = catalogNodes.find((n) => n.id === nodeId)
      const nodeData = catalogNode
        ? { id: catalogNode.id, title: catalogNode.title, fields: catalogNode.fields, type: catalogNode.type ? { slug: catalogNode.type.slug } : undefined }
        : null
      const newRows = await addParticipantFromCatalog(encounter.id, nodeId, displayName, maxHp, quantity)
      setParticipants((prev) => [...prev, ...newRows.map((r: any) => ({
        ...r, node: nodeData, conditions: r.conditions || [], effects: r.effects || [], temp_hp: r.temp_hp || 0, role: r.role || 'enemy',
      }))])
      router.refresh()
    } catch (e) { console.error(e) }
  }, [encounter.id, router, catalogNodes])

  // ── Render ────────────────────────────────────────

  return (
    <div className="space-y-4">
      <EncounterHeader
        title={encounter.title}
        status={encounter.status}
        currentRound={encounter.current_round}
        onRoundChange={handleRoundChange}
        onNextTurn={handleNextTurn}
        onEndCombat={handleEndCombat}
        campaignId={campaignId}
        participants={participants.map((p) => ({
          id: p.id, display_name: p.display_name, max_hp: p.max_hp,
          role: p.role, sort_order: p.sort_order, node_id: p.node_id,
        }))}
      />

      <EncounterDetailsCard
        encounterId={encounter.id}
        details={encounter.details || {}}
        disabled={isCompleted}
      />

      {/* Grid table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-400">
              <th className="w-8 px-2 py-2.5" />
              <th className="w-16 px-2 py-2.5 text-center">Иниц.</th>
              <th className="px-2 py-2.5 text-left">Имя</th>
              <th className="w-40 px-2 py-2.5 text-left">Условия</th>
              <th className="w-40 px-2 py-2.5 text-left">Эффекты</th>
              <th className="w-28 px-2 py-2.5 text-center">HP</th>
              <th className="w-14 px-2 py-2.5 text-center">Вр.</th>
              <th className="w-20 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-gray-400">
                  Добавьте участников ↓
                </td>
              </tr>
            ) : (
              sorted.map((p) => {
                const roleColor = ROLE_COLORS[p.role] || ROLE_COLORS.enemy
                const isCurrentTurn = p.id === currentTurnId
                const isDown = p.current_hp === 0 && p.max_hp > 0
                const statblockUrl = p.node?.fields?.statblock_url as string | undefined

                return (
                  <tr
                    key={p.id}
                    className={`transition-colors ${roleColor.row} ${
                      !p.is_active ? 'opacity-30' : ''
                    } ${isDown ? '!bg-red-50' : ''} ${
                      isCurrentTurn ? '!bg-yellow-50 ring-1 ring-inset ring-yellow-300' : ''
                    }`}
                  >
                    {/* Role dot */}
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => handleRoleChange(p.id)}
                        disabled={isCompleted}
                        className={`inline-block h-3 w-3 rounded-full ${roleColor.dot} ${
                          isCompleted ? 'cursor-default' : 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'
                        } transition-all`}
                        title={`${p.role} — клик для смены`}
                      />
                    </td>

                    {/* Initiative */}
                    <td className="px-2 py-2 text-center">
                      <EditableCell
                        value={p.initiative}
                        onCommit={(v) => handleInitiativeChange(p.id, v)}
                        type="number"
                        placeholder="—"
                        disabled={isCompleted}
                        className="text-center font-mono"
                      />
                    </td>

                    {/* Name */}
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        {isCompleted ? (
                          p.node ? (
                            <Link href={`/c/${campaignSlug}/catalog/${p.node.id}`} className="font-medium text-blue-700 hover:underline truncate">
                              {p.display_name}
                            </Link>
                          ) : (
                            <span className={`font-medium truncate ${isDown ? 'text-red-700 line-through' : 'text-gray-900'}`}>
                              {p.display_name}
                            </span>
                          )
                        ) : (
                          <EditableCell
                            value={p.display_name}
                            onCommit={(v) => handleNameChange(p.id, v)}
                            disabled={isCompleted}
                            displayClassName={`font-medium truncate ${
                              p.node ? 'text-blue-700' : isDown ? 'text-red-700 line-through' : 'text-gray-900'
                            }`}
                          />
                        )}
                        {statblockUrl && (
                          <a href={statblockUrl} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors" title="Статблок"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                            </svg>
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Conditions */}
                    <td className="px-2 py-2">
                      <TagCell
                        tags={p.conditions || []}
                        suggestions={conditionNames}
                        onChange={(conds) => handleConditionsChange(p.id, conds)}
                        placeholder="+"
                        disabled={isCompleted}
                      />
                    </td>

                    {/* Effects */}
                    <td className="px-2 py-2">
                      <TagCell
                        tags={p.effects || []}
                        suggestions={effectNames}
                        onChange={(effs) => handleEffectsChange(p.id, effs)}
                        placeholder="+"
                        disabled={isCompleted}
                      />
                    </td>

                    {/* HP */}
                    <td className="px-2 py-2">
                      <HpCell
                        currentHp={p.current_hp}
                        maxHp={p.max_hp}
                        onHpChange={(hp) => handleHpChange(p.id, hp)}
                        onMaxHpChange={(maxHp, currentHp) => handleMaxHpChange(p.id, maxHp, currentHp)}
                        disabled={isCompleted}
                      />
                    </td>

                    {/* Temp HP */}
                    <td className="px-2 py-2 text-center">
                      <EditableCell
                        value={p.temp_hp || null}
                        onCommit={(v) => handleTempHpChange(p.id, v)}
                        type="number"
                        placeholder="—"
                        disabled={isCompleted}
                        className="text-center font-mono text-xs"
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2">
                      {!isCompleted && (
                        <div className="flex items-center gap-0.5">
                          <button onClick={() => handleClone(p.id)} className="h-6 w-6 rounded text-gray-300 hover:bg-gray-100 hover:text-gray-600 text-xs" title="Клонировать">⧉</button>
                          <button onClick={() => handleToggleActive(p.id)}
                            className={`h-6 w-6 rounded text-xs ${p.is_active ? 'text-gray-300 hover:bg-gray-100 hover:text-gray-600' : 'text-amber-400 hover:bg-amber-50 hover:text-amber-600'}`}
                            title={p.is_active ? 'Убрать из боя' : 'Вернуть в бой'}
                          >{p.is_active ? '◎' : '○'}</button>
                          <button onClick={() => handleDelete(p.id)} className="h-6 w-6 rounded text-gray-300 hover:bg-red-50 hover:text-red-500" title="Удалить">✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>

        {/* Add participant */}
        {!isCompleted && (
          <div className="border-t border-gray-200 bg-gray-50">
            <AddParticipantRow
              catalogNodes={catalogNodes}
              onAddFromCatalog={handleAddFromCatalog}
              onAddManual={handleAddManual}
            />
          </div>
        )}
      </div>
    </div>
  )
}
