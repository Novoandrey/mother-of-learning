'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { parseHpInput } from '@/components/encounter/hp-cell'
import type { TagEntry } from '@/components/encounter/tag-cell'
import type { Participant, CatalogNode } from '@/components/encounter/encounter-grid'
import type { EventAction, EventResult } from '@/lib/event-actions'
import {
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

const ROLES = ['enemy', 'pc', 'ally', 'neutral'] as const
function nextRole(current: string): string {
  const idx = ROLES.indexOf(current as typeof ROLES[number])
  return ROLES[(idx + 1) % ROLES.length]
}

type Options = {
  encounterId: string
  catalogNodes: CatalogNode[]
  participants: Participant[]
  setParticipants: React.Dispatch<React.SetStateAction<Participant[]>>
  sorted: Participant[]
  selectedIds: Set<string>
  selCount: number
  isSelected: (id: string) => boolean
  clearSelection: () => void
  getCurrentRound: () => number
  onAutoEvent?: (evt: {
    actor?: string | null
    action: EventAction
    target?: string | null
    result?: EventResult
    round?: number | null
    turn?: string | null
  }) => void
}

/**
 * All participant CRUD: HP, initiative, name, role, conditions, effects,
 * toggle, delete, clone, add manual/catalog, end combat.
 */
export function useParticipantActions({
  encounterId,
  catalogNodes,
  participants,
  setParticipants,
  sorted,
  selectedIds,
  selCount,
  isSelected,
  clearSelection,
  getCurrentRound,
  onAutoEvent,
}: Options) {
  const router = useRouter()

  // Targets: if row is selected, apply to all selected; otherwise just that row
  const getTargets = useCallback((id: string) => {
    if (isSelected(id)) return sorted.filter((p) => selectedIds.has(p.id)).map((p) => p.id)
    return [id]
  }, [isSelected, selectedIds, sorted])

  const onInit = useCallback(async (id: string, v: string) => {
    const n = v === '' ? null : parseFloat(v)
    if (v !== '' && isNaN(n!)) return
    const targets = getTargets(id)
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, initiative: n } : p))
    for (const t of targets) {
      try { await updateInitiative(t, n) } catch { /* best-effort */ }
    }
  }, [getTargets, setParticipants])

  const onHp = useCallback(async (id: string, hp: number) => {
    const p = participants.find((x) => x.id === id)
    if (p && onAutoEvent && p.current_hp !== hp) {
      const delta = hp - p.current_hp
      onAutoEvent({
        action: delta < 0 ? 'hp_damage' : 'hp_heal',
        target: p.display_name,
        result: { delta: Math.abs(delta), from: p.current_hp, to: hp, max: p.max_hp },
        round: getCurrentRound(),
      })
    }
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, current_hp: hp } : p))
    try { await updateHp(id, hp) } catch { router.refresh() }
  }, [participants, onAutoEvent, getCurrentRound, router, setParticipants])

  const onHpRaw = useCallback(async (id: string, raw: string) => {
    if (!isSelected(id) || selCount <= 1) return
    const others = sorted.filter((p) => selectedIds.has(p.id) && p.id !== id)
    const updates: { id: string; hp: number; max?: number; name: string; oldHp: number; maxHp: number }[] = []
    for (const p of others) {
      const result = parseHpInput(raw, p.current_hp, p.max_hp)
      if (!result) continue
      updates.push({ id: p.id, hp: result.current, max: result.max !== p.max_hp ? result.max : undefined, name: p.display_name, oldHp: p.current_hp, maxHp: result.max })
    }
    if (!updates.length) return
    setParticipants((ps) => ps.map((p) => {
      const u = updates.find((u) => u.id === p.id)
      if (!u) return p
      return { ...p, current_hp: u.hp, ...(u.max != null ? { max_hp: u.max } : {}) }
    }))
    if (onAutoEvent) {
      for (const u of updates) {
        const delta = u.hp - u.oldHp
        if (delta !== 0) {
          onAutoEvent({
            action: delta < 0 ? 'hp_damage' : 'hp_heal',
            target: u.name,
            result: { delta: Math.abs(delta), from: u.oldHp, to: u.hp, max: u.maxHp },
            round: getCurrentRound(),
          })
        }
      }
    }
    for (const u of updates) {
      try {
        if (u.max != null) await updateMaxHp(u.id, u.max, u.hp)
        else await updateHp(u.id, u.hp)
      } catch { /* best-effort */ }
    }
  }, [selectedIds, selCount, sorted, isSelected, onAutoEvent, getCurrentRound, setParticipants])

  const onMaxHp = useCallback(async (id: string, max: number, cur: number) => {
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, max_hp: max, current_hp: cur } : p))
    try { await updateMaxHp(id, max, cur) } catch { router.refresh() }
  }, [router, setParticipants])

  const onTempHp = useCallback(async (id: string, v: string) => {
    const n = Math.max(0, parseInt(v) || 0)
    const targets = getTargets(id)
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, temp_hp: n } : p))
    for (const t of targets) {
      try { await updateTempHp(t, n) } catch { /* best-effort */ }
    }
  }, [getTargets, setParticipants])

  const onName = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, display_name: name.trim() } : p))
    try { await updateParticipantName(id, name.trim()) } catch { router.refresh() }
  }, [router, setParticipants])

  const onRole = useCallback(async (id: string) => {
    const p = participants.find((p) => p.id === id)
    if (!p) return
    const r = nextRole(p.role || 'enemy')
    const targets = getTargets(id)
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, role: r } : p))
    for (const t of targets) {
      try { await updateRole(t, r) } catch { /* best-effort */ }
    }
  }, [participants, getTargets, setParticipants])

  const onConds = useCallback(async (id: string, c: TagEntry[]) => {
    const p = participants.find((x) => x.id === id)
    if (!p) return
    const oldNames = new Set((p.conditions || []).map((t) => t.name))
    const newNames = new Set(c.map((t) => t.name))
    const added = c.filter((t) => !oldNames.has(t.name)).map((t) => t.name)
    const removed = (p.conditions || []).filter((t) => !newNames.has(t.name)).map((t) => t.name)

    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, conditions: c } : p))
    try { await updateConditions(id, c) } catch { router.refresh() }

    if (onAutoEvent) {
      const r = getCurrentRound()
      for (const name of added) onAutoEvent({ action: 'condition_add', target: p.display_name, result: { name }, round: r })
      for (const name of removed) onAutoEvent({ action: 'condition_remove', target: p.display_name, result: { name }, round: r })
    }
  }, [participants, router, getCurrentRound, onAutoEvent, setParticipants])

  const onEffects = useCallback(async (id: string, e: TagEntry[]) => {
    const p = participants.find((x) => x.id === id)
    if (!p) return
    const oldNames = new Set((p.effects || []).map((t) => t.name))
    const newNames = new Set(e.map((t) => t.name))
    const added = e.filter((t) => !oldNames.has(t.name)).map((t) => t.name)
    const removed = (p.effects || []).filter((t) => !newNames.has(t.name)).map((t) => t.name)

    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, effects: e } : p))
    try { await updateEffects(id, e) } catch { router.refresh() }

    if (onAutoEvent) {
      const r = getCurrentRound()
      for (const name of added) onAutoEvent({ action: 'effect_add', target: p.display_name, result: { name }, round: r })
      for (const name of removed) onAutoEvent({ action: 'effect_remove', target: p.display_name, result: { name }, round: r })
    }
  }, [participants, router, getCurrentRound, onAutoEvent, setParticipants])

  const onToggle = useCallback(async (id: string) => {
    const p = participants.find((x) => x.id === id)
    if (!p) return
    const v = !p.is_active
    const targets = getTargets(id)
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, is_active: v } : p))
    for (const t of targets) {
      try { await toggleParticipantActive(t, v) } catch { /* best-effort */ }
    }
  }, [participants, getTargets, setParticipants])

  const onDelete = useCallback(async (id: string) => {
    const targets = getTargets(id)
    const msg = targets.length > 1 ? `Удалить ${targets.length} участников?` : 'Удалить участника?'
    if (!confirm(msg)) return
    setParticipants((ps) => ps.filter((p) => !targets.includes(p.id)))
    clearSelection()
    for (const t of targets) {
      try { await deleteParticipant(t) } catch { /* best-effort */ }
    }
  }, [getTargets, clearSelection, setParticipants])

  const onClone = useCallback(async (id: string) => {
    try {
      const res = await cloneParticipant(id)
      setParticipants((ps) => {
        const upd = ps.map((p) => p.id === id ? { ...p, display_name: res.updatedOriginalName } : p)
        const clone = res.clone as typeof ps[0]
        const i = upd.findIndex((p) => p.id === id)
        return [...upd.slice(0, i + 1), clone, ...upd.slice(i + 1)]
      })
    } catch { router.refresh() }
  }, [router, setParticipants])

  const endCombat = useCallback(async () => {
    if (!confirm('Завершить бой?')) return
    try { await updateEncounterStatus(encounterId, 'completed') } catch { router.refresh() }
  }, [encounterId, router])

  const addManual = useCallback(async (name: string, hp: number) => {
    try {
      const row = await addParticipantManual(encounterId, name, hp)
      setParticipants((ps) => [...ps, { ...row, node: null, conditions: [], effects: [], temp_hp: 0, role: 'enemy' }])
    } catch (e) { console.error(e) }
  }, [encounterId, setParticipants])

  const addFromCatalog = useCallback(async (
    nodeId: string, name: string, hp: number, qty: number,
  ) => {
    try {
      const cat = catalogNodes.find((n) => n.id === nodeId)
      const nd = cat ? { id: cat.id, title: cat.title, fields: cat.fields, type: cat.type ? { slug: cat.type.slug } : undefined } : null
      const rows = await addParticipantFromCatalog(encounterId, nodeId, name, hp, qty)
      setParticipants((ps) => [...ps, ...rows.map((r: any) => ({
        ...r, node: nd, conditions: r.conditions || [], effects: r.effects || [], temp_hp: r.temp_hp || 0, role: r.role || 'enemy',
      }))])
      router.refresh()
    } catch (e) { console.error(e) }
  }, [encounterId, router, catalogNodes, setParticipants])

  return {
    onInit, onHp, onHpRaw, onMaxHp, onTempHp, onName, onRole,
    onConds, onEffects, onToggle, onDelete, onClone,
    endCombat, addManual, addFromCatalog,
  }
}
