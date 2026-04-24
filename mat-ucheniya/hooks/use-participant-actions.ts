'use client'

import { useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { parseHpInput } from '@/components/encounter/hp-cell'
import type { TagEntry } from '@/components/encounter/tag-cell'
import type { Participant, CatalogNode } from '@/components/encounter/encounter-grid'
import type { EventAction, EventResult } from '@/lib/event-actions'
import { computeMonsterHp, type HpMethod } from '@/lib/statblock'
import {
  updateInitiative,
  updateHp,
  updateMaxHp,
  updateParticipantName,
  updateConditions,
  updateEffects,
  updateRole,
  updateTempHp,
  updateAc,
  updateDeathSaves,
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
  hpMethod: HpMethod
  /**
   * DM/owner writes only (RLS on encounter_participants, encounters,
   * encounter_events, encounter_log). Players need gating at the UI
   * layer — without it, optimistic state updates land locally but
   * the DB rejects silently, which is the BUG-018 pattern.
   */
  canEdit: boolean
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
  hpMethod,
  canEdit,
}: Options) {
  const router = useRouter()

  // Warn once per session — clicking a dozen grid cells shouldn't pop a
  // dozen modals. One toast teaches the player who to bug (the DM) and
  // we stay quiet after that.
  const warnedRef = useRef(false)
  const guard = useCallback(() => {
    if (canEdit) return true
    if (!warnedRef.current) {
      warnedRef.current = true
      window.alert(
        'Изменять участников энкаунтера может только ДМ. Попросите ДМа внести изменения.',
      )
    }
    return false
  }, [canEdit])

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
    // Auto-clear death saves when healed back above 0.
    const shouldResetSaves = p && hp > 0 && p.current_hp === 0 &&
      ((p.death_saves?.successes ?? 0) > 0 || (p.death_saves?.failures ?? 0) > 0)
    setParticipants((ps) => ps.map((row) => {
      if (row.id !== id) return row
      if (shouldResetSaves) return { ...row, current_hp: hp, death_saves: { successes: 0, failures: 0 } }
      return { ...row, current_hp: hp }
    }))
    try { await updateHp(id, hp) } catch { router.refresh() }
    if (shouldResetSaves) {
      try { await updateDeathSaves(id, { successes: 0, failures: 0 }) } catch { /* best-effort */ }
    }
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

  const onTempHp = useCallback(async (id: string, v: string, currentTempHp?: number) => {
    const trimmed = v.trim()
    let n: number
    // "+3" / "-3" → delta on current temp_hp; plain number → absolute.
    if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
      const delta = parseInt(trimmed)
      if (isNaN(delta)) return
      n = Math.max(0, (currentTempHp ?? 0) + delta)
    } else if (trimmed === '') {
      n = 0
    } else {
      n = Math.max(0, parseInt(trimmed) || 0)
    }
    const targets = getTargets(id)
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, temp_hp: n } : p))
    for (const t of targets) {
      try { await updateTempHp(t, n) } catch { /* best-effort */ }
    }
  }, [getTargets, setParticipants])

  const onAc = useCallback(async (id: string, v: string) => {
    const trimmed = v.trim()
    const n = trimmed === '' ? null : parseInt(trimmed)
    if (trimmed !== '' && isNaN(n!)) return
    const targets = getTargets(id)
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, ac: n } : p))
    for (const t of targets) {
      try { await updateAc(t, n) } catch { /* best-effort */ }
    }
  }, [getTargets, setParticipants])

  // Death saves: click advances per kind (success/failure), capped at 3.
  // Reaching 3 failures = dead (we don't auto-apply, just let DM read the grid).
  // Reaching 3 successes = stabilised.
  // Right-click (handled in grid) resets all to 0.
  const onDeathSaveTick = useCallback(async (id: string, kind: 'successes' | 'failures') => {
    const p = participants.find((x) => x.id === id)
    if (!p) return
    const cur = p.death_saves || { successes: 0, failures: 0 }
    const next = { ...cur, [kind]: Math.min(3, (cur[kind] || 0) + 1) }
    setParticipants((ps) => ps.map((row) => row.id === id ? { ...row, death_saves: next } : row))
    try { await updateDeathSaves(id, next) } catch { router.refresh() }
    if (onAutoEvent) {
      onAutoEvent({
        action: 'custom',
        target: p.display_name,
        result: { note: kind === 'successes' ? `Спасбросок от смерти: успех (${next.successes}/3)` : `Спасбросок от смерти: провал (${next.failures}/3)` },
        round: getCurrentRound(),
      })
    }
  }, [participants, router, onAutoEvent, getCurrentRound, setParticipants])

  const onDeathSavesReset = useCallback(async (id: string) => {
    const cleared = { successes: 0, failures: 0 }
    setParticipants((ps) => ps.map((row) => row.id === id ? { ...row, death_saves: cleared } : row))
    try { await updateDeathSaves(id, cleared) } catch { router.refresh() }
  }, [router, setParticipants])

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
    const added = c.filter((t) => !oldNames.has(t.name))
    const removed = (p.conditions || []).filter((t) => !newNames.has(t.name))
    const targets = getTargets(id)

    // Apply the same diff to every selected target (bulk).
    setParticipants((ps) =>
      ps.map((row) => {
        if (!targets.includes(row.id)) return row
        if (row.id === id) return { ...row, conditions: c }
        const cur = row.conditions || []
        const afterRemove = cur.filter((t) => !removed.some((r) => r.name === t.name))
        const afterAdd = [
          ...afterRemove,
          ...added.filter((t) => !afterRemove.some((e) => e.name === t.name)),
        ]
        return { ...row, conditions: afterAdd }
      }),
    )

    for (const tid of targets) {
      const row = participants.find((x) => x.id === tid)
      const cur = row?.conditions || []
      const afterRemove = cur.filter((t) => !removed.some((r) => r.name === t.name))
      const next = tid === id
        ? c
        : [...afterRemove, ...added.filter((t) => !afterRemove.some((e) => e.name === t.name))]
      try { await updateConditions(tid, next) } catch { router.refresh() }
    }

    if (onAutoEvent) {
      const r = getCurrentRound()
      for (const tid of targets) {
        const row = participants.find((x) => x.id === tid)
        if (!row) continue
        for (const t of added) onAutoEvent({ action: 'condition_add', target: row.display_name, result: { name: t.name }, round: r })
        for (const t of removed) onAutoEvent({ action: 'condition_remove', target: row.display_name, result: { name: t.name }, round: r })
      }
    }
  }, [participants, router, getCurrentRound, onAutoEvent, setParticipants, getTargets])

  const onEffects = useCallback(async (id: string, e: TagEntry[]) => {
    const p = participants.find((x) => x.id === id)
    if (!p) return
    const oldNames = new Set((p.effects || []).map((t) => t.name))
    const newNames = new Set(e.map((t) => t.name))
    const added = e.filter((t) => !oldNames.has(t.name))
    const removed = (p.effects || []).filter((t) => !newNames.has(t.name))
    const targets = getTargets(id)

    setParticipants((ps) =>
      ps.map((row) => {
        if (!targets.includes(row.id)) return row
        if (row.id === id) return { ...row, effects: e }
        const cur = row.effects || []
        const afterRemove = cur.filter((t) => !removed.some((r) => r.name === t.name))
        const afterAdd = [
          ...afterRemove,
          ...added.filter((t) => !afterRemove.some((x) => x.name === t.name)),
        ]
        return { ...row, effects: afterAdd }
      }),
    )

    for (const tid of targets) {
      const row = participants.find((x) => x.id === tid)
      const cur = row?.effects || []
      const afterRemove = cur.filter((t) => !removed.some((r) => r.name === t.name))
      const next = tid === id
        ? e
        : [...afterRemove, ...added.filter((t) => !afterRemove.some((x) => x.name === t.name))]
      try { await updateEffects(tid, next) } catch { router.refresh() }
    }

    if (onAutoEvent) {
      const r = getCurrentRound()
      for (const tid of targets) {
        const row = participants.find((x) => x.id === tid)
        if (!row) continue
        for (const t of added) onAutoEvent({ action: 'effect_add', target: row.display_name, result: { name: t.name }, round: r })
        for (const t of removed) onAutoEvent({ action: 'effect_remove', target: row.display_name, result: { name: t.name }, round: r })
      }
    }
  }, [participants, router, getCurrentRound, onAutoEvent, setParticipants, getTargets])

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
        const clone = res.clone as typeof ps[0]
        // Rename original if server did (first clone triggers " 1" suffix).
        const renamed = ps.map((p) =>
          p.id === id ? { ...p, display_name: res.updatedOriginalName } : p,
        )
        return [...renamed, clone]
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
      setParticipants((ps) => [...ps, { ...row, node: null, conditions: [], effects: [], temp_hp: 0, role: 'enemy', ac: null, death_saves: { successes: 0, failures: 0 } }])
    } catch (e) { console.error(e) }
  }, [encounterId, setParticipants])

  const addFromCatalog = useCallback(async (
    nodeId: string, name: string, hp: number, qty: number,
  ) => {
    try {
      const cat = catalogNodes.find((n) => n.id === nodeId)
      const nd = cat ? { id: cat.id, title: cat.title, fields: cat.fields, type: cat.type ? { slug: cat.type.slug } : undefined } : null
      // Compute per-instance HP from the campaign's hp_method.
      // 'roll' varies per instance; other methods give the same value each time.
      const hps: number[] = []
      for (let i = 0; i < qty; i++) {
        const v = cat ? computeMonsterHp(cat.fields, hpMethod) : 0
        hps.push(v > 0 ? v : hp)
      }
      // Seed AC from catalog node fields (falls back to null if absent / not a number).
      const rawAc = cat?.fields?.ac
      const acSeed = typeof rawAc === 'number' ? rawAc
        : (typeof rawAc === 'string' && !isNaN(parseInt(rawAc)) ? parseInt(rawAc) : null)
      const rows = await addParticipantFromCatalog(encounterId, nodeId, name, hps, acSeed)
      type NewParticipantRow = {
        id: string
        display_name: string
        initiative: number | null
        max_hp: number
        current_hp: number
        ac: number | null
        sort_order: number
        is_active: boolean
        node_id: string | null
        temp_hp?: number | null
        role?: string | null
        conditions?: TagEntry[] | null
        effects?: TagEntry[] | null
        death_saves?: { successes: number; failures: number } | null
      }
      const typedRows = (rows ?? []) as NewParticipantRow[]
      setParticipants((ps) => [...ps, ...typedRows.map<Participant>((r) => ({
        id: r.id,
        display_name: r.display_name,
        initiative: r.initiative,
        max_hp: r.max_hp,
        current_hp: r.current_hp,
        ac: r.ac,
        sort_order: r.sort_order,
        is_active: r.is_active,
        node_id: r.node_id,
        node: nd,
        conditions: r.conditions || [],
        effects: r.effects || [],
        temp_hp: r.temp_hp || 0,
        role: r.role || 'enemy',
        death_saves: r.death_saves || { successes: 0, failures: 0 },
      }))])
      router.refresh()
    } catch (e) { console.error(e) }
  }, [encounterId, router, catalogNodes, setParticipants, hpMethod])

  // If the viewer isn't a DM/owner, replace every mutation with a
  // single guarded noop. One alert the first time a player clicks
  // something; silence afterwards. Callsites stay unchanged.
  const real = {
    onInit, onHp, onHpRaw, onMaxHp, onTempHp, onAc, onName, onRole,
    onDeathSaveTick, onDeathSavesReset,
    onConds, onEffects, onToggle, onDelete, onClone,
    endCombat, addManual, addFromCatalog,
  }
  if (!canEdit) {
    const blocked = async () => { guard() }
    const gated = Object.fromEntries(
      Object.keys(real).map((k) => [k, blocked]),
    )
    return gated as unknown as typeof real
  }
  return real
}
