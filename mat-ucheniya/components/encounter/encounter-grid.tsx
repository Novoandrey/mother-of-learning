'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { EditableCell } from './editable-cell'
import { HpCell } from './hp-cell'
import { parseHpInput } from './hp-cell'
import { TagCell, type TagEntry } from './tag-cell'
import { AddParticipantRow } from './add-participant-row'
import { SaveAsTemplateButton } from '@/components/save-as-template-button'
import type { EventAction, EventResult } from '@/lib/event-actions'
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
  conditionNames: string[]
  effectNames: string[]
  onAutoEvent?: (evt: { actor?: string; action: EventAction; target?: string; result?: EventResult; round?: number; turn?: string }) => void
}

// ── Role config ─────────────────────────────────────

const ROLES = ['enemy', 'pc', 'ally', 'neutral'] as const
const ROLE_LABEL: Record<string, string> = {
  pc: 'PC', ally: 'Союз', enemy: 'Враг', neutral: '—',
}
const ROLE_DOT: Record<string, string> = {
  pc: 'bg-blue-500', ally: 'bg-green-500', enemy: 'bg-red-500', neutral: 'bg-gray-400',
}
const ROLE_ROW: Record<string, string> = {
  pc: 'bg-blue-50/30', ally: 'bg-green-50/30', enemy: '', neutral: '',
}

function nextRole(current: string): string {
  const idx = ROLES.indexOf(current as typeof ROLES[number])
  return ROLES[(idx + 1) % ROLES.length]
}

// ── Component ───────────────────────────────────────

export function EncounterGrid({
  encounter: initial,
  initialParticipants,
  catalogNodes,
  campaignId,
  campaignSlug,
  conditionNames,
  effectNames,
  onAutoEvent,
}: Props) {
  const router = useRouter()
  const [encounter, setEncounter] = useState(initial)
  const [participants, setParticipants] = useState(initialParticipants)
  const [turnId, setTurnId] = useState<string | null>(initial.current_turn_id || null)
  const [details, setDetails] = useState<Record<string, string>>(initial.details || {})

  const done = encounter.status === 'completed'

  // Save a detail field (loop, day, etc.) to encounter.details jsonb
  const saveDetail = useCallback(async (key: string, value: string) => {
    const updated = { ...details, [key]: value }
    setDetails(updated)
    try {
      const s = createClient()
      await s.from('encounters').update({ details: updated }).eq('id', encounter.id)
    } catch { /* best-effort */ }
  }, [details, encounter.id])

  // Sort: initiative DESC nulls last, then sort_order
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
    [sorted]
  )

  // ── Selection ───────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const lastClickedRef = useRef<string | null>(null)

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    if (done) return
    // Ignore clicks on interactive elements (inputs, buttons, links)
    const target = e.target as HTMLElement
    if (target.closest('input, button, a, [role="button"]')) return

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (e.shiftKey && lastClickedRef.current) {
        // Range select
        const ids = sorted.map((p) => p.id)
        const a = ids.indexOf(lastClickedRef.current)
        const b = ids.indexOf(id)
        if (a !== -1 && b !== -1) {
          const [start, end] = a < b ? [a, b] : [b, a]
          for (let i = start; i <= end; i++) next.add(ids[i])
        }
      } else if (e.ctrlKey || e.metaKey) {
        // Toggle single
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else {
        // Single click — if only this is selected, deselect; otherwise select only this
        if (next.size === 1 && next.has(id)) {
          next.clear()
        } else {
          next.clear()
          next.add(id)
        }
      }
      lastClickedRef.current = id
      return next
    })
  }, [done, sorted])

  const isSelected = (id: string) => selectedIds.size > 0 && selectedIds.has(id)
  const selCount = selectedIds.size

  // Escape to clear selection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedIds.size > 0) {
        setSelectedIds(new Set())
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedIds.size])

  // ── Handlers ──────────────────────────────────────

  const setRound = useCallback(async (delta: number) => {
    const r = Math.max(1, encounter.current_round + delta)
    setEncounter((e) => ({ ...e, current_round: r }))
    try { await updateRound(encounter.id, r) } catch { router.refresh() }
  }, [encounter, router])

  const advanceTurn = useCallback(async () => {
    if (!inCombat.length) return
    const idx = turnId ? inCombat.findIndex((p) => p.id === turnId) : -1
    let next = idx + 1
    if (next >= inCombat.length) { next = 0; setRound(1) }
    const id = inCombat[next].id
    setTurnId(id)
    try {
      const s = createClient()
      await s.from('encounters').update({ current_turn_id: id }).eq('id', encounter.id)
    } catch { /* best-effort */ }
  }, [turnId, inCombat, encounter.id, setRound])

  const prevTurn = useCallback(async () => {
    if (!inCombat.length) return
    const idx = turnId ? inCombat.findIndex((p) => p.id === turnId) : 0
    let prev = idx - 1
    if (prev < 0) {
      prev = inCombat.length - 1
      if (encounter.current_round > 1) setRound(-1)
    }
    const id = inCombat[prev].id
    setTurnId(id)
    try {
      const s = createClient()
      await s.from('encounters').update({ current_turn_id: id }).eq('id', encounter.id)
    } catch { /* best-effort */ }
  }, [turnId, inCombat, encounter.id, encounter.current_round, setRound])

  const currentTurnName = useMemo(() => {
    if (!turnId) return null
    return participants.find((p) => p.id === turnId)?.display_name || null
  }, [turnId, participants])

  // Keyboard shortcuts: Space/→ = next turn, Shift+Space/← = prev turn
  useEffect(() => {
    if (done) return
    const handler = (e: KeyboardEvent) => {
      // Don't fire when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === ' ' || e.key === 'ArrowRight') {
        e.preventDefault()
        if (e.shiftKey) prevTurn()
        else advanceTurn()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        prevTurn()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [done, advanceTurn, prevTurn])

  const onInit = useCallback(async (id: string, v: string) => {
    const n = v === '' ? null : parseFloat(v)
    if (v !== '' && isNaN(n!)) return
    const targets = isSelected(id) ? sorted.filter((p) => selectedIds.has(p.id)).map((p) => p.id) : [id]
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, initiative: n } : p))
    for (const t of targets) {
      try { await updateInitiative(t, n) } catch { /* best-effort */ }
    }
  }, [router, selectedIds, sorted])

  const onHp = useCallback(async (id: string, hp: number) => {
    const p = participants.find((x) => x.id === id)
    if (p && onAutoEvent && p.current_hp !== hp) {
      const delta = hp - p.current_hp
      onAutoEvent({
        action: delta < 0 ? 'hp_damage' : 'hp_heal',
        target: p.display_name,
        result: { delta: Math.abs(delta), from: p.current_hp, to: hp, max: p.max_hp },
        round: encounter.current_round,
      })
    }
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, current_hp: hp } : p))
    try { await updateHp(id, hp) } catch { router.refresh() }
  }, [router, participants, onAutoEvent, encounter.current_round])

  // Apply raw HP input to all OTHER selected rows (triggering row is handled by onHp/onMaxHp)
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
    // Auto-event for mass HP changes
    if (onAutoEvent) {
      for (const u of updates) {
        const delta = u.hp - u.oldHp
        if (delta !== 0) {
          onAutoEvent({
            action: delta < 0 ? 'hp_damage' : 'hp_heal',
            target: u.name,
            result: { delta: Math.abs(delta), from: u.oldHp, to: u.hp, max: u.maxHp },
            round: encounter.current_round,
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
  }, [selectedIds, selCount, sorted, onAutoEvent, encounter.current_round])

  const onMaxHp = useCallback(async (id: string, max: number, cur: number) => {
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, max_hp: max, current_hp: cur } : p))
    try { await updateMaxHp(id, max, cur) } catch { router.refresh() }
  }, [router])

  const onTempHp = useCallback(async (id: string, v: string) => {
    const n = Math.max(0, parseInt(v) || 0)
    const targets = isSelected(id) ? sorted.filter((p) => selectedIds.has(p.id)).map((p) => p.id) : [id]
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, temp_hp: n } : p))
    for (const t of targets) {
      try { await updateTempHp(t, n) } catch { /* best-effort */ }
    }
  }, [router, selectedIds, sorted])

  const onName = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, display_name: name.trim() } : p))
    try { await updateParticipantName(id, name.trim()) } catch { router.refresh() }
  }, [router])

  const onRole = useCallback(async (id: string) => {
    const p = participants.find((p) => p.id === id)
    if (!p) return
    const r = nextRole(p.role || 'enemy')
    const targets = isSelected(id) ? sorted.filter((p) => selectedIds.has(p.id)).map((p) => p.id) : [id]
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, role: r } : p))
    for (const t of targets) {
      try { await updateRole(t, r) } catch { /* best-effort */ }
    }
  }, [participants, router, selectedIds, sorted])

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
      const r = encounter.current_round
      for (const name of added) onAutoEvent({ action: 'condition_add', target: p.display_name, result: { name }, round: r })
      for (const name of removed) onAutoEvent({ action: 'condition_remove', target: p.display_name, result: { name }, round: r })
    }
  }, [participants, router, encounter.current_round, onAutoEvent])

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
      const r = encounter.current_round
      for (const name of added) onAutoEvent({ action: 'effect_add', target: p.display_name, result: { name }, round: r })
      for (const name of removed) onAutoEvent({ action: 'effect_remove', target: p.display_name, result: { name }, round: r })
    }
  }, [participants, router, encounter.current_round, onAutoEvent])

  const onToggle = useCallback(async (id: string) => {
    const p = participants.find((x) => x.id === id)
    if (!p) return
    const v = !p.is_active
    const targets = isSelected(id) ? sorted.filter((p) => selectedIds.has(p.id)).map((p) => p.id) : [id]
    setParticipants((ps) => ps.map((p) => targets.includes(p.id) ? { ...p, is_active: v } : p))
    for (const t of targets) {
      try { await toggleParticipantActive(t, v) } catch { /* best-effort */ }
    }
  }, [participants, router, selectedIds, sorted])

  const onDelete = useCallback(async (id: string) => {
    const targets = isSelected(id) ? sorted.filter((p) => selectedIds.has(p.id)).map((p) => p.id) : [id]
    const msg = targets.length > 1 ? `Удалить ${targets.length} участников?` : 'Удалить участника?'
    if (!confirm(msg)) return
    setParticipants((ps) => ps.filter((p) => !targets.includes(p.id)))
    setSelectedIds(new Set())
    for (const t of targets) {
      try { await deleteParticipant(t) } catch { /* best-effort */ }
    }
  }, [router, selectedIds, sorted])

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
  }, [router])

  const endCombat = useCallback(async () => {
    if (!confirm('Завершить бой?')) return
    setEncounter((e) => ({ ...e, status: 'completed' }))
    try { await updateEncounterStatus(encounter.id, 'completed') } catch { router.refresh() }
  }, [encounter.id, router])

  const addManual = useCallback(async (name: string, hp: number) => {
    try {
      const row = await addParticipantManual(encounter.id, name, hp)
      setParticipants((ps) => [...ps, { ...row, node: null, conditions: [], effects: [], temp_hp: 0, role: 'enemy' }])
    } catch (e) { console.error(e) }
  }, [encounter.id])

  const addFromCatalog = useCallback(async (
    nodeId: string, name: string, hp: number, qty: number
  ) => {
    try {
      const cat = catalogNodes.find((n) => n.id === nodeId)
      const nd = cat ? { id: cat.id, title: cat.title, fields: cat.fields, type: cat.type ? { slug: cat.type.slug } : undefined } : null
      const rows = await addParticipantFromCatalog(encounter.id, nodeId, name, hp, qty)
      setParticipants((ps) => [...ps, ...rows.map((r: any) => ({
        ...r, node: nd, conditions: r.conditions || [], effects: r.effects || [], temp_hp: r.temp_hp || 0, role: r.role || 'enemy',
      }))])
      router.refresh()
    } catch (e) { console.error(e) }
  }, [encounter.id, router, catalogNodes])

  // ── Render ────────────────────────────────────────

  return (
    <div>
      {/* ── Spreadsheet ─── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 960 }}>
          <thead>
            {/* Info bar row — Excel style */}
            <tr className="bg-white">
              <th colSpan={3} className="border border-gray-200 px-2 py-1.5 text-left">
                <span className="text-base font-bold text-gray-900">{encounter.title}</span>
                {done && (
                  <span className="ml-2 rounded bg-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-500 align-middle">
                    Завершён
                  </span>
                )}
              </th>
              <td className="border border-gray-200 px-2 py-1.5 text-center w-[180px]">
                <div className="flex items-center gap-1 justify-center">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Петля</span>
                  <EditableCell
                    value={details.loop || null}
                    onCommit={(v) => saveDetail('loop', v)}
                    type="number"
                    placeholder="—"
                    disabled={done}
                    className="text-center font-mono font-bold w-10"
                  />
                </div>
              </td>
              <td className="border border-gray-200 px-2 py-1.5 text-center w-[180px]">
                <div className="flex items-center gap-1 justify-center">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">День</span>
                  <EditableCell
                    value={details.day || null}
                    onCommit={(v) => saveDetail('day', v)}
                    type="number"
                    placeholder="—"
                    disabled={done}
                    className="text-center font-mono font-bold w-10"
                  />
                </div>
              </td>
              <td className="border border-gray-200 px-2 py-1.5 text-center w-32">
                <div className="flex items-center gap-1 justify-center">
                  <span className="text-[10px] text-gray-400 uppercase tracking-wide">Раунд</span>
                  {!done && (
                    <button onClick={() => setRound(-1)} disabled={encounter.current_round <= 1}
                      className="h-5 w-5 rounded text-xs text-gray-400 hover:bg-gray-100 disabled:opacity-30">−</button>
                  )}
                  <span className="font-mono font-bold text-gray-900 min-w-[2ch] text-center">{encounter.current_round}</span>
                  {!done && (
                    <button onClick={() => setRound(1)}
                      className="h-5 w-5 rounded text-xs text-gray-400 hover:bg-gray-100">+</button>
                  )}
                </div>
              </td>
              <td colSpan={2} className="border border-gray-200 px-2 py-1.5 text-center">
                {!done && (
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={prevTurn} disabled={!inCombat.length}
                      title="Предыдущий ход (← или Shift+Space)"
                      className="rounded-lg bg-gray-100 px-2.5 py-1.5 text-sm font-bold text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors">
                      ←
                    </button>
                    <div className="min-w-[100px] px-2">
                      {currentTurnName ? (
                        <span className="text-sm font-semibold text-yellow-700">{currentTurnName}</span>
                      ) : (
                        <span className="text-xs text-gray-400">Начать →</span>
                      )}
                    </div>
                    <button onClick={advanceTurn} disabled={!inCombat.length}
                      title="Следующий ход (→ или Space)"
                      className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-30 transition-colors">
                      →
                    </button>
                    <span className="mx-1 text-gray-200">|</span>
                    <SaveAsTemplateButton campaignId={campaignId}
                      participants={participants.map((p) => ({
                        id: p.id, display_name: p.display_name, max_hp: p.max_hp,
                        role: p.role, sort_order: p.sort_order, node_id: p.node_id,
                      }))}
                    />
                    <button onClick={endCombat}
                      className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors">
                      Стоп
                    </button>
                  </div>
                )}
              </td>
            </tr>

            {/* Selection indicator */}
            {selCount > 0 && (
              <tr className="bg-blue-50">
                <td colSpan={8} className="border border-gray-200 px-2 py-1">
                  <div className="flex items-center gap-2 text-xs text-blue-700">
                    <span className="font-medium">Выделено: {selCount}</span>
                    <span className="text-blue-400">·</span>
                    <span className="text-blue-500">Изменение в одной строке → все выделенные</span>
                    <button onClick={() => setSelectedIds(new Set())}
                      className="ml-auto rounded px-1.5 py-0.5 text-blue-500 hover:bg-blue-100 transition-colors">
                      Снять ✕
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {/* Column headers */}
            <tr className="bg-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="border border-gray-200 w-8 px-1 py-1.5 text-center">{/* role */}</th>
              <th className="border border-gray-200 w-16 px-1 py-1.5 text-center">Ин.</th>
              <th className="border border-gray-200 px-2 py-1.5 text-left">Имя</th>
              <th className="border border-gray-200 w-[180px] px-2 py-1.5 text-left">Условия</th>
              <th className="border border-gray-200 w-[180px] px-2 py-1.5 text-left">Эффекты</th>
              <th className="border border-gray-200 w-32 px-2 py-1.5 text-center">HP</th>
              <th className="border border-gray-200 w-14 px-1 py-1.5 text-center">Вр.</th>
              <th className="border border-gray-200 w-20 px-1 py-1.5 text-center">⚙</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="border border-gray-200 py-8 text-center text-gray-400">
                  Добавьте участников ↓
                </td>
              </tr>
            )}
            {sorted.map((p) => {
              const isTurn = p.id === turnId
              const isDown = p.current_hp === 0 && p.max_hp > 0
              const statUrl = p.node?.fields?.statblock_url as string | undefined

              // Row background layering
              let rowBg = ROLE_ROW[p.role] || ''
              if (isDown) rowBg = 'bg-red-50/60'
              if (isTurn) rowBg = 'bg-yellow-50'
              if (!p.is_active) rowBg = ''

              return (
                <tr key={p.id}
                  onClick={(e) => toggleSelect(p.id, e)}
                  className={`${rowBg} ${!p.is_active ? 'opacity-25' : ''} ${isTurn ? 'ring-1 ring-inset ring-yellow-400' : ''} ${isSelected(p.id) ? 'outline outline-2 -outline-offset-2 outline-blue-400 bg-blue-50/40' : ''} cursor-default select-none`}
                >
                  {/* Role dot */}
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <button onClick={() => onRole(p.id)} disabled={done}
                      className={`inline-block h-2.5 w-2.5 rounded-full ${ROLE_DOT[p.role] || ROLE_DOT.enemy} ${done ? '' : 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'} transition-all`}
                      title={`${ROLE_LABEL[p.role] || p.role} — клик для смены`}
                    />
                  </td>

                  {/* Initiative */}
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <EditableCell
                      value={p.initiative}
                      onCommit={(v) => onInit(p.id, v)}
                      type="number"
                      placeholder="—"
                      disabled={done}
                      className="text-center font-mono text-xs"
                    />
                  </td>

                  {/* Name */}
                  <td className="border border-gray-200 px-2 py-1">
                    <div className="flex items-center gap-1">
                      {done ? (
                        p.node ? (
                          <Link href={`/c/${campaignSlug}/catalog/${p.node.id}`}
                            className="font-medium text-blue-700 hover:underline truncate text-sm">
                            {p.display_name}
                          </Link>
                        ) : (
                          <span className={`font-medium truncate text-sm ${isDown ? 'text-red-700 line-through' : ''}`}>
                            {p.display_name}
                          </span>
                        )
                      ) : (
                        <EditableCell
                          value={p.display_name}
                          onCommit={(v) => onName(p.id, v)}
                          disabled={done}
                          displayClassName={`font-medium truncate ${p.node ? 'text-blue-700' : isDown ? 'text-red-700 line-through' : ''}`}
                        />
                      )}
                      {statUrl && (
                        <a href={statUrl} target="_blank" rel="noopener noreferrer"
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

                  {/* Conditions */}
                  <td className="border border-gray-200 px-1 py-1">
                    <TagCell
                      tags={p.conditions || []}
                      suggestions={conditionNames}
                      onChange={(c) => onConds(p.id, c)}
                      currentRound={encounter.current_round}
                      placeholder="+"
                      disabled={done}
                    />
                  </td>

                  {/* Effects */}
                  <td className="border border-gray-200 px-1 py-1">
                    <TagCell
                      tags={p.effects || []}
                      suggestions={effectNames}
                      onChange={(e) => onEffects(p.id, e)}
                      currentRound={encounter.current_round}
                      placeholder="+"
                      disabled={done}
                    />
                  </td>

                  {/* HP */}
                  <td className="border border-gray-200 px-1 py-1">
                    <HpCell
                      currentHp={p.current_hp}
                      maxHp={p.max_hp}
                      onHpChange={(hp) => onHp(p.id, hp)}
                      onMaxHpChange={(max, cur) => onMaxHp(p.id, max, cur)}
                      onRawInput={(raw) => onHpRaw(p.id, raw)}
                      disabled={done}
                    />
                  </td>

                  {/* Temp HP */}
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    <EditableCell
                      value={p.temp_hp || null}
                      onCommit={(v) => onTempHp(p.id, v)}
                      type="number"
                      placeholder="—"
                      disabled={done}
                      className="text-center font-mono text-xs"
                    />
                  </td>

                  {/* Actions */}
                  <td className="border border-gray-200 px-1 py-1 text-center">
                    {!done && (
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => onClone(p.id)} title="Клонировать"
                          className="h-5 w-5 rounded text-[11px] text-gray-300 hover:bg-gray-100 hover:text-gray-600">⧉</button>
                        <button onClick={() => onToggle(p.id)}
                          title={p.is_active ? 'Убрать' : 'Вернуть'}
                          className={`h-5 w-5 rounded text-[11px] ${p.is_active ? 'text-gray-300 hover:bg-gray-100 hover:text-gray-600' : 'text-amber-400 hover:bg-amber-50'}`}
                        >{p.is_active ? '◎' : '○'}</button>
                        <button onClick={() => onDelete(p.id)} title="Удалить"
                          className="h-5 w-5 rounded text-[11px] text-gray-300 hover:bg-red-50 hover:text-red-500">✕</button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Add row */}
        {!done && (
          <div className="border border-t-0 border-gray-200 bg-gray-50/50">
            <AddParticipantRow
              catalogNodes={catalogNodes}
              onAddFromCatalog={addFromCatalog}
              onAddManual={addManual}
            />
          </div>
        )}
      </div>
    </div>
  )
}
