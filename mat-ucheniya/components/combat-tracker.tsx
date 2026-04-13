'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ParticipantRow } from './participant-row'
import { InlineAddRow } from './inline-add-row'
import { CatalogPanel } from './catalog-panel'
import {
  updateRound,
  updateInitiative,
  updateHp,
  updateParticipantName,
  updateConditions,
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
  conditions: string[]
  node?: { id: string; title: string; type?: { slug: string } } | null
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
}

export function CombatTracker({
  encounter: initial,
  initialParticipants,
  catalogNodes,
  campaignId,
  campaignSlug,
}: Props) {
  const router = useRouter()
  const [encounter, setEncounter] = useState(initial)
  const [participants, setParticipants] = useState(initialParticipants)

  const isCompleted = encounter.status === 'completed'

  // Sort: initiative desc (nulls last), then sort_order
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

  // ── Round ───────────────────────────────────────────────

  const handleRoundChange = useCallback(async (delta: number) => {
    const newRound = Math.max(0, encounter.current_round + delta)
    setEncounter((prev) => ({ ...prev, current_round: newRound }))
    try { await updateRound(encounter.id, newRound) } catch { router.refresh() }
  }, [encounter, router])

  // ── Participant handlers ────────────────────────────────

  const handleInitiativeChange = useCallback(async (id: string, value: number | null) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, initiative: value } : p)))
    try { await updateInitiative(id, value) } catch { router.refresh() }
  }, [router])

  const handleHpChange = useCallback(async (id: string, newHp: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, current_hp: newHp } : p)))
    try { await updateHp(id, newHp) } catch { router.refresh() }
  }, [router])

  const handleConditionsChange = useCallback(async (id: string, conditions: string[]) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, conditions } : p)))
    try { await updateConditions(id, conditions) } catch { router.refresh() }
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

  // ── End combat ────────────────────────────────────────────

  const handleEndCombat = useCallback(async () => {
    if (!confirm('Завершить бой?')) return
    setEncounter((prev) => ({ ...prev, status: 'completed' }))
    try { await updateEncounterStatus(encounter.id, 'completed') } catch { router.refresh() }
  }, [encounter.id, router])

  // ── Add participants ──────────────────────────────────────

  const handleAddManual = useCallback(async (displayName: string, maxHp: number) => {
    try {
      const newRow = await addParticipantManual(encounter.id, displayName, maxHp)
      setParticipants((prev) => [...prev, { ...newRow, node: null, conditions: newRow.conditions || [] }])
    } catch (e) { console.error(e) }
  }, [encounter.id])

  const handleAddFromCatalog = useCallback(async (
    nodeId: string, displayName: string, maxHp: number, quantity: number
  ) => {
    try {
      const newRows = await addParticipantFromCatalog(encounter.id, nodeId, displayName, maxHp, quantity)
      setParticipants((prev) => [...prev, ...newRows.map((r: any) => ({ ...r, node: null, conditions: r.conditions || [] }))])
      router.refresh()
    } catch (e) { console.error(e) }
  }, [encounter.id, router])

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{encounter.title}</h1>
        {isCompleted && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
            Завершён
          </span>
        )}
      </div>

      {/* Round counter + controls */}
      {!isCompleted && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Раунд</span>
            <button
              onClick={() => handleRoundChange(-1)}
              disabled={encounter.current_round === 0}
              className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-30"
            >
              −
            </button>
            <span className="min-w-[2ch] text-center text-lg font-bold text-gray-900">
              {encounter.current_round}
            </span>
            <button
              onClick={() => handleRoundChange(1)}
              className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              +
            </button>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleEndCombat}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            Завершить бой
          </button>
        </div>
      )}

      {/* Participant table */}
      <div>
        {sorted.length > 0 ? (
          <div className="space-y-1">
            {sorted.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                isCompleted={isCompleted}
                campaignSlug={campaignSlug}
                onInitiativeChange={handleInitiativeChange}
                onHpChange={handleHpChange}
                onConditionsChange={handleConditionsChange}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 py-8 text-center">
            <p className="text-gray-400">Добавьте участников из каталога или вручную ↓</p>
          </div>
        )}

        {/* Inline add */}
        {!isCompleted && (
          <InlineAddRow onAdd={handleAddManual} />
        )}
      </div>

      {/* Catalog panel */}
      {!isCompleted && (
        <CatalogPanel
          nodes={catalogNodes}
          onAdd={handleAddFromCatalog}
        />
      )}
    </div>
  )
}
