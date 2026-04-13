'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ParticipantRow } from './participant-row'
import { InlineAddRow } from './inline-add-row'
import { CatalogPanel } from './catalog-panel'
import { EncounterDetailsCard } from './encounter-details-card'
import { SaveAsTemplateButton } from './save-as-template-button'
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

type Encounter = {
  id: string
  title: string
  status: 'active' | 'completed'
  current_round: number
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

  // ── Handlers ────────────────────────────────────────────

  const handleRoundChange = useCallback(async (delta: number) => {
    const newRound = Math.max(1, encounter.current_round + delta)
    setEncounter((prev) => ({ ...prev, current_round: newRound }))
    try { await updateRound(encounter.id, newRound) } catch { router.refresh() }
  }, [encounter, router])

  const handleInitiativeChange = useCallback(async (id: string, value: number | null) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, initiative: value } : p)))
    try { await updateInitiative(id, value) } catch { router.refresh() }
  }, [router])

  const handleHpChange = useCallback(async (id: string, newHp: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, current_hp: newHp } : p)))
    try { await updateHp(id, newHp) } catch { router.refresh() }
  }, [router])

  const handleMaxHpChange = useCallback(async (id: string, maxHp: number, currentHp: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, max_hp: maxHp, current_hp: currentHp } : p)))
    try { await updateMaxHp(id, maxHp, currentHp) } catch { router.refresh() }
  }, [router])

  const handleConditionsChange = useCallback(async (id: string, conditions: string[]) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, conditions } : p)))
    try { await updateConditions(id, conditions) } catch { router.refresh() }
  }, [router])

  const handleEffectsChange = useCallback(async (id: string, effects: string[]) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, effects } : p)))
    try { await updateEffects(id, effects) } catch { router.refresh() }
  }, [router])

  const handleRoleChange = useCallback(async (id: string, role: string) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)))
    try { await updateRole(id, role) } catch { router.refresh() }
  }, [router])

  const handleTempHpChange = useCallback(async (id: string, tempHp: number) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, temp_hp: tempHp } : p)))
    try { await updateTempHp(id, tempHp) } catch { router.refresh() }
  }, [router])

  const handleToggleActive = useCallback(async (id: string, isActive: boolean) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: isActive } : p)))
    try { await toggleParticipantActive(id, isActive) } catch { router.refresh() }
  }, [router])

  const handleDelete = useCallback(async (id: string) => {
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

  const handleRename = useCallback(async (id: string, newName: string) => {
    setParticipants((prev) => prev.map((p) => (p.id === id ? { ...p, display_name: newName } : p)))
    try { await updateParticipantName(id, newName) } catch { router.refresh() }
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
      const newRows = await addParticipantFromCatalog(encounter.id, nodeId, displayName, maxHp, quantity)
      setParticipants((prev) => [...prev, ...newRows.map((r: any) => ({
        ...r, node: null, conditions: r.conditions || [], effects: r.effects || [], temp_hp: r.temp_hp || 0, role: r.role || 'enemy',
      }))])
      router.refresh()
    } catch (e) { console.error(e) }
  }, [encounter.id, router])

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">{encounter.title}</h1>
        {isCompleted && (
          <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-medium text-gray-600">
            Завершён
          </span>
        )}
      </div>

      {/* Encounter details card */}
      <EncounterDetailsCard
        encounterId={encounter.id}
        details={encounter.details || {}}
        disabled={isCompleted}
      />

      {/* Round counter + controls */}
      {!isCompleted && (
        <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-600">Раунд</span>
            <button
              onClick={() => handleRoundChange(-1)}
              disabled={encounter.current_round <= 1}
              className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-30"
            >
              −
            </button>
            <span className="min-w-[2ch] text-center text-xl font-bold text-gray-900">
              {encounter.current_round}
            </span>
            <button
              onClick={() => handleRoundChange(1)}
              className="flex h-8 w-8 items-center justify-center rounded border border-gray-300 font-medium text-gray-700 hover:bg-gray-100"
            >
              +
            </button>
          </div>
          <div className="flex-1" />
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
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            Завершить бой
          </button>
        </div>
      )}

      {/* Participant table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        {/* Table header */}
        <div className="flex min-w-[900px] items-center gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <div className="w-6" />
          <div className="w-14 text-center">Иниц.</div>
          <div className="min-w-0 flex-1">Имя</div>
          <div className="w-44 shrink-0">Состояния</div>
          <div className="w-44 shrink-0">Эффекты</div>
          <div className="w-36 shrink-0">HP</div>
          <div className="w-12 text-center shrink-0">Врем.</div>
          <div className="w-8" />
        </div>

        {sorted.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {sorted.map((p) => (
              <ParticipantRow
                key={p.id}
                participant={p}
                isCompleted={isCompleted}
                campaignId={campaignId}
                campaignSlug={campaignSlug}
                onInitiativeChange={handleInitiativeChange}
                onHpChange={handleHpChange}
                onMaxHpChange={handleMaxHpChange}
                onTempHpChange={handleTempHpChange}
                onRoleChange={handleRoleChange}
                onConditionsChange={handleConditionsChange}
                onEffectsChange={handleEffectsChange}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onClone={handleClone}
                onRename={handleRename}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-gray-400">Добавьте участников из каталога или вручную ↓</p>
          </div>
        )}

        {!isCompleted && (
          <div className="border-t border-gray-200 bg-gray-50">
            <InlineAddRow onAdd={handleAddManual} />
          </div>
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
