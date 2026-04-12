'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ParticipantRow } from './participant-row'
import { AddParticipantDialog } from './add-participant-dialog'
import {
  advanceTurn,
  updateInitiative,
  updateHp,
  updateParticipantName,
  toggleParticipantActive,
  deleteParticipant,
  updateEncounterStatus,
  addParticipantFromCatalog,
  addParticipantManual,
} from '@/lib/encounter-actions'

type Encounter = {
  id: string
  title: string
  status: 'active' | 'completed'
  current_round: number
  current_turn_id: string | null
}

type Participant = {
  id: string
  display_name: string
  initiative: number | null
  max_hp: number
  current_hp: number
  sort_order: number
  is_active: boolean
  node_id: string | null
  node?: { id: string; title: string; type?: { slug: string } } | null
}

type Props = {
  encounter: Encounter
  initialParticipants: Participant[]
  campaignId: string
  campaignSlug: string
}

export function CombatTracker({ encounter: initial, initialParticipants, campaignId, campaignSlug }: Props) {
  const router = useRouter()
  const [encounter, setEncounter] = useState(initial)
  const [participants, setParticipants] = useState(initialParticipants)
  const [showAddDialog, setShowAddDialog] = useState(false)

  const isCompleted = encounter.status === 'completed'

  // Split into combat (has initiative) and bench (no initiative)
  const { combatants, bench } = useMemo(() => {
    const combat: Participant[] = []
    const benchList: Participant[] = []
    for (const p of participants) {
      if (p.initiative != null) combat.push(p)
      else benchList.push(p)
    }
    combat.sort((a, b) => {
      const diff = (b.initiative ?? 0) - (a.initiative ?? 0)
      return diff !== 0 ? diff : a.sort_order - b.sort_order
    })
    return { combatants: combat, bench: benchList }
  }, [participants])

  const activeCombatants = combatants.filter((p) => p.is_active)

  // ── Optimistic handlers ───────────────────────────────────

  const handleInitiativeChange = useCallback(async (id: string, value: number | null) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, initiative: value } : p)))
    try { await updateInitiative(id, value) } catch { router.refresh() }
  }, [router])

  const handleHpChange = useCallback(async (id: string, newHp: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, current_hp: newHp } : p)))
    try { await updateHp(id, newHp) } catch { router.refresh() }
  }, [router])

  const handleToggleActive = useCallback(async (id: string, isActive: boolean) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p)))
    try { await toggleParticipantActive(id, isActive) } catch { router.refresh() }
  }, [router])

  const handleDelete = useCallback(async (id: string) => {
    setParticipants((prev) => prev.filter((p) => p.id !== id))
    try { await deleteParticipant(id) } catch { router.refresh() }
  }, [router])

  const handleRename = useCallback(async (id: string, newName: string) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, display_name: newName } : p)))
    try { await updateParticipantName(id, newName) } catch { router.refresh() }
  }, [router])

  // ── Turn advancement ──────────────────────────────────────

  const handleNextTurn = useCallback(async () => {
    const active = combatants.filter((p) => p.is_active)
    if (active.length === 0) return

    const currentIdx = active.findIndex((p) => p.id === encounter.current_turn_id)
    let nextIdx: number
    let newRound = encounter.current_round

    if (currentIdx === -1 || currentIdx >= active.length - 1) {
      nextIdx = 0
      newRound = encounter.current_round + 1
    } else {
      nextIdx = currentIdx + 1
    }

    const nextId = active[nextIdx].id
    setEncounter((prev) => ({ ...prev, current_turn_id: nextId, current_round: newRound }))
    try { await advanceTurn(encounter.id, nextId, newRound) } catch { router.refresh() }
  }, [combatants, encounter, router])

  // ── End combat ────────────────────────────────────────────

  const handleEndCombat = useCallback(async () => {
    if (!confirm('Завершить бой?')) return
    setEncounter((prev) => ({ ...prev, status: 'completed' }))
    try { await updateEncounterStatus(encounter.id, 'completed') } catch { router.refresh() }
  }, [encounter.id, router])

  // ── Add participants ──────────────────────────────────────

  const handleAddFromCatalog = useCallback(async (
    nodeId: string, displayName: string, maxHp: number, quantity: number
  ) => {
    try {
      const newRows = await addParticipantFromCatalog(encounter.id, nodeId, displayName, maxHp, quantity)
      setParticipants((prev) => [...prev, ...newRows.map((r: any) => ({ ...r, node: null }))])
      router.refresh() // refresh to get joined node data
    } catch (e) { console.error(e) }
  }, [encounter.id, router])

  const handleAddManual = useCallback(async (displayName: string, maxHp: number) => {
    try {
      const newRow = await addParticipantManual(encounter.id, displayName, maxHp)
      setParticipants((prev) => [...prev, { ...newRow, node: null }])
    } catch (e) { console.error(e) }
  }, [encounter.id])

  // ── Render ────────────────────────────────────────────────

  const currentTurnName = activeCombatants.find((p) => p.id === encounter.current_turn_id)?.display_name

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{encounter.title}</h1>
        {isCompleted && (
          <span className="mt-1 inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
            Завершён
          </span>
        )}
      </div>

      {/* Combat controls */}
      {!isCompleted && (
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-3">
          <div className="text-sm">
            <span className="text-gray-400">Раунд</span>{' '}
            <span className="text-lg font-bold text-gray-900">{encounter.current_round}</span>
          </div>

          {activeCombatants.length > 0 && (
            <>
              <div className="text-sm text-gray-500">
                Ход: <span className="font-medium text-gray-900">{currentTurnName || '—'}</span>
              </div>
              <button
                onClick={handleNextTurn}
                className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Следующий ход →
              </button>
            </>
          )}

          <button
            onClick={handleEndCombat}
            className={`rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors ${activeCombatants.length === 0 ? 'ml-auto' : ''}`}
          >
            Завершить
          </button>
        </div>
      )}

      {/* Combat table */}
      {combatants.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Бой ({combatants.length})
          </h2>
          <div className="space-y-1">
            {combatants.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                isCurrentTurn={p.id === encounter.current_turn_id}
                isCompleted={isCompleted}
                campaignSlug={campaignSlug}
                onInitiativeChange={handleInitiativeChange}
                onHpChange={handleHpChange}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        </div>
      )}

      {/* Bench */}
      {bench.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            Скамейка ({bench.length})
          </h2>
          <div className="space-y-1 opacity-70">
            {bench.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                isCurrentTurn={false}
                isCompleted={isCompleted}
                campaignSlug={campaignSlug}
                onInitiativeChange={handleInitiativeChange}
                onHpChange={handleHpChange}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {participants.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-gray-500">Добавьте участников</p>
          <p className="mt-1 text-sm text-gray-400">Из каталога или вручную — они появятся на скамейке</p>
        </div>
      )}

      {/* Add button */}
      {!isCompleted && (
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full rounded-lg border-2 border-dashed border-gray-200 py-3 text-sm text-gray-500 transition-colors hover:border-blue-400 hover:text-blue-600"
        >
          + Добавить участника
        </button>
      )}

      {/* Dialog */}
      {showAddDialog && (
        <AddParticipantDialog
          campaignId={campaignId}
          onAddFromCatalog={handleAddFromCatalog}
          onAddManual={handleAddManual}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  )
}
