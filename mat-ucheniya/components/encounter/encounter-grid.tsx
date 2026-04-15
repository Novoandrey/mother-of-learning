'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { EditableCell } from './editable-cell'
import { HpCell } from './hp-cell'
import { TagCell } from './tag-cell'
import { AddParticipantRow } from './add-participant-row'
import { SaveAsTemplateButton } from '@/components/save-as-template-button'
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
}: Props) {
  const router = useRouter()
  const [encounter, setEncounter] = useState(initial)
  const [participants, setParticipants] = useState(initialParticipants)
  const [turnId, setTurnId] = useState<string | null>(initial.current_turn_id || null)

  const done = encounter.status === 'completed'

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

  const onInit = useCallback(async (id: string, v: string) => {
    const n = v === '' ? null : parseFloat(v)
    if (v !== '' && isNaN(n!)) return
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, initiative: n } : p))
    try { await updateInitiative(id, n) } catch { router.refresh() }
  }, [router])

  const onHp = useCallback(async (id: string, hp: number) => {
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, current_hp: hp } : p))
    try { await updateHp(id, hp) } catch { router.refresh() }
  }, [router])

  const onMaxHp = useCallback(async (id: string, max: number, cur: number) => {
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, max_hp: max, current_hp: cur } : p))
    try { await updateMaxHp(id, max, cur) } catch { router.refresh() }
  }, [router])

  const onTempHp = useCallback(async (id: string, v: string) => {
    const n = Math.max(0, parseInt(v) || 0)
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, temp_hp: n } : p))
    try { await updateTempHp(id, n) } catch { router.refresh() }
  }, [router])

  const onName = useCallback(async (id: string, name: string) => {
    if (!name.trim()) return
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, display_name: name.trim() } : p))
    try { await updateParticipantName(id, name.trim()) } catch { router.refresh() }
  }, [router])

  const onRole = useCallback(async (id: string) => {
    const p = participants.find((p) => p.id === id)
    if (!p) return
    const r = nextRole(p.role || 'enemy')
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, role: r } : p))
    try { await updateRole(id, r) } catch { router.refresh() }
  }, [participants, router])

  const onConds = useCallback(async (id: string, c: string[]) => {
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, conditions: c } : p))
    try { await updateConditions(id, c) } catch { router.refresh() }
  }, [router])

  const onEffects = useCallback(async (id: string, e: string[]) => {
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, effects: e } : p))
    try { await updateEffects(id, e) } catch { router.refresh() }
  }, [router])

  const onToggle = useCallback(async (id: string) => {
    const p = participants.find((x) => x.id === id)
    if (!p) return
    const v = !p.is_active
    setParticipants((ps) => ps.map((p) => p.id === id ? { ...p, is_active: v } : p))
    try { await toggleParticipantActive(id, v) } catch { router.refresh() }
  }, [participants, router])

  const onDelete = useCallback(async (id: string) => {
    if (!confirm('Удалить участника?')) return
    setParticipants((ps) => ps.filter((p) => p.id !== id))
    try { await deleteParticipant(id) } catch { router.refresh() }
  }, [router])

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
    <div className="space-y-3">
      {/* ── Toolbar ─── */}
      <div className="flex items-center gap-3 text-sm">
        <h1 className="text-lg font-bold text-gray-900 truncate">{encounter.title}</h1>

        {done ? (
          <span className="ml-auto rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-500">Завершён</span>
        ) : (
          <>
            {/* Round */}
            <div className="flex items-center gap-1 ml-4">
              <span className="text-xs text-gray-400 mr-1">Раунд</span>
              <button onClick={() => setRound(-1)} disabled={encounter.current_round <= 1}
                className="h-6 w-6 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-30">−</button>
              <span className="min-w-[2ch] text-center font-bold text-gray-900">{encounter.current_round}</span>
              <button onClick={() => setRound(1)}
                className="h-6 w-6 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50">+</button>
            </div>

            {/* Next turn */}
            <button onClick={advanceTurn}
              className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
              След. ход →
            </button>

            <div className="flex-1" />

            <SaveAsTemplateButton campaignId={campaignId}
              participants={participants.map((p) => ({
                id: p.id, display_name: p.display_name, max_hp: p.max_hp,
                role: p.role, sort_order: p.sort_order, node_id: p.node_id,
              }))}
            />
            <button onClick={endCombat}
              className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors">
              Завершить
            </button>
          </>
        )}
      </div>

      {/* ── Spreadsheet ─── */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 820 }}>
          <thead>
            <tr className="bg-gray-100 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <th className="border border-gray-200 w-7 px-1 py-1.5 text-center">{/* role */}</th>
              <th className="border border-gray-200 w-14 px-1 py-1.5 text-center">Ин.</th>
              <th className="border border-gray-200 px-2 py-1.5 text-left">Имя</th>
              <th className="border border-gray-200 w-[160px] px-1 py-1.5 text-left">Условия</th>
              <th className="border border-gray-200 w-[160px] px-1 py-1.5 text-left">Эффекты</th>
              <th className="border border-gray-200 w-24 px-1 py-1.5 text-center">HP</th>
              <th className="border border-gray-200 w-12 px-1 py-1.5 text-center">Вр.</th>
              <th className="border border-gray-200 w-[72px] px-1 py-1.5 text-center">⚙</th>
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
                  className={`${rowBg} ${!p.is_active ? 'opacity-25' : ''} ${isTurn ? 'ring-1 ring-inset ring-yellow-400' : ''}`}
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
                          className="flex-shrink-0 text-gray-300 hover:text-blue-500 transition-colors" title="Статблок">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                          </svg>
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
