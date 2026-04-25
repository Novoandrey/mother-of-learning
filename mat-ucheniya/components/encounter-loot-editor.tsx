'use client'

/**
 * Spec-013 T017+T018+T019+T020+T021+T022 — Encounter loot editor
 * client island. Consolidated: line list + coin/item rows + day
 * picker + apply button + confirm dialog wiring + «Всё в общак»
 * shortcut, all in one component to keep the state coherent.
 *
 * Why one big component instead of T018/T019/T020 split files: the
 * line list, day picker, and apply button all share a single
 * "current draft" state. Splitting into per-row components is a
 * future optimisation if line counts grow large enough to matter
 * for re-render cost. With ~10 lines per encounter, monolithic is
 * simpler to reason about and matches what the resolver pipeline
 * sees.
 *
 * Edit-flow: optimistic local state on every change → debounced call
 * to `updateEncounterLootDraft` (300 ms). The server validates and
 * rejects malformed patches; the panel surfaces the error inline.
 */

import { useEffect, useMemo, useRef, useState } from 'react'

import {
  applyEncounterLoot,
  updateEncounterLootDraft,
} from '@/app/actions/encounter-loot'
import { ApplyConfirmDialog } from '@/components/apply-confirm-dialog'
import { splitCoinsEvenly } from '@/lib/coin-split'
import type {
  CoinLine,
  ItemLine,
  LootDraft,
  LootLine,
} from '@/lib/encounter-loot-types'
import type { AffectedRow } from '@/lib/starter-setup'

import type { PanelParticipant } from './encounter-loot-panel'

// ─────────────────────────── helpers ───────────────────────────

function newCoinLine(): CoinLine {
  return {
    id: crypto.randomUUID(),
    kind: 'coin',
    cp: 0,
    sp: 0,
    gp: 0,
    pp: 0,
    // Default to stash. The actual recipient is picked in the
    // distribute dialog when the DM is ready to hand out rewards.
    recipient_mode: 'stash',
    recipient_pc_id: null,
  }
}

function newItemLine(): ItemLine {
  return {
    id: crypto.randomUUID(),
    kind: 'item',
    name: '',
    qty: 1,
    recipient_mode: 'stash',
    recipient_pc_id: null,
  }
}

function totalCp(c: { cp: number; sp: number; gp: number; pp: number }): number {
  return c.cp + 10 * c.sp + 100 * c.gp + 1000 * c.pp
}

function formatCoins(c: { cp: number; sp: number; gp: number; pp: number }): string {
  const parts: string[] = []
  if (c.pp) parts.push(`${c.pp} pp`)
  if (c.gp) parts.push(`${c.gp} gp`)
  if (c.sp) parts.push(`${c.sp} sp`)
  if (c.cp) parts.push(`${c.cp} cp`)
  return parts.length > 0 ? parts.join(' + ') : '0'
}

// ─────────────────────────── main component ───────────────────────────

type Summary = {
  rowCount: number
  lastAppliedAt: string | null
  mirrorNodeId: string
}

export function EncounterLootEditor({
  encounterId,
  initialDraft,
  summary,
  participants,
  stashAvailable,
}: {
  encounterId: string
  initialDraft: LootDraft
  summary: Summary
  participants: PanelParticipant[]
  stashAvailable: boolean
}) {
  const [lines, setLines] = useState<LootLine[]>(initialDraft.lines)
  const [loopNumber, setLoopNumber] = useState<number | null>(
    initialDraft.loop_number,
  )
  const [dayInLoop, setDayInLoop] = useState<number | null>(
    initialDraft.day_in_loop,
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const [confirmAffected, setConfirmAffected] = useState<AffectedRow[] | null>(
    null,
  )

  // Debounce server saves on edits.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function schedulePersist(patch: {
    lines?: LootLine[]
    loop_number?: number | null
    day_in_loop?: number | null
  }) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const r = await updateEncounterLootDraft(encounterId, patch)
      if (!r.ok) setError(r.error)
      else setError(null)
    }, 300)
  }
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  function updateLines(next: LootLine[]) {
    setLines(next)
    schedulePersist({ lines: next })
  }

  function updateLine(id: string, patch: Partial<LootLine>) {
    updateLines(
      lines.map((l) =>
        l.id === id ? ({ ...l, ...patch } as LootLine) : l,
      ),
    )
  }

  function removeLine(id: string) {
    updateLines(lines.filter((l) => l.id !== id))
  }

  function addCoinLine() {
    updateLines([...lines, newCoinLine()])
  }

  function addItemLine() {
    updateLines([...lines, newItemLine()])
  }

  // ─────────── distribute (modal) ───────────

  // The distribute modal owns its own draft of recipient_mode /
  // recipient_pc_id. On confirm we persist updated lines AND fire
  // applyEncounterLoot in one go.
  const [distributeOpen, setDistributeOpen] = useState(false)

  async function handleDistributeConfirm(
    distributedLines: LootLine[],
    confirmed: boolean,
  ) {
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      // 1. Persist the recipient choices (and any other line edits the
      // dialog made) before applying — apply reads from the draft.
      const upd = await updateEncounterLootDraft(encounterId, {
        lines: distributedLines,
      })
      if (!upd.ok) {
        setError(upd.error)
        return
      }
      // Mirror the saved version into local state so the line list
      // updates immediately after the dialog closes.
      setLines(distributedLines)

      // 2. Apply.
      const r = await applyEncounterLoot(encounterId, { confirmed })
      if ('needsConfirmation' in r) {
        setConfirmAffected(r.affected)
        return
      }
      if (r.ok) {
        setInfo(`Лут распределён · ${r.rowsAffected} строк`)
        setConfirmAffected(null)
        setDistributeOpen(false)
        window.location.reload()
        return
      }
      setError(r.error)
    } finally {
      setPending(false)
    }
  }

  const dayMissing = loopNumber === null || dayInLoop === null
  const canApply = !pending && !dayMissing
  const hasLines = lines.length > 0

  return (
    <div className="space-y-3">
      {/* Day picker */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-gray-600">Петля</span>
        <input
          type="number"
          min={1}
          value={loopNumber ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            setLoopNumber(v)
            schedulePersist({ loop_number: v })
          }}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="text-gray-600">· День</span>
        <input
          type="number"
          min={1}
          max={30}
          value={dayInLoop ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            setDayInLoop(v)
            schedulePersist({ day_in_loop: v })
          }}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        {dayMissing && (
          <span className="text-xs text-amber-700">Укажите перед применением</span>
        )}
      </div>

      {/* Lines */}
      {lines.length === 0 && (
        <p className="text-sm text-gray-500 italic py-2">
          Пока строк нет. Нажми «+ монеты» или «+ предмет», чтобы добавить.
        </p>
      )}

      <ul className="space-y-2">
        {lines.map((line) =>
          line.kind === 'coin' ? (
            <CoinLineRow
              key={line.id}
              line={line}
              onChange={(patch) => updateLine(line.id, patch)}
              onRemove={() => removeLine(line.id)}
            />
          ) : (
            <ItemLineRow
              key={line.id}
              line={line}
              onChange={(patch) => updateLine(line.id, patch)}
              onRemove={() => removeLine(line.id)}
            />
          ),
        )}
      </ul>

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          onClick={addCoinLine}
          className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50"
        >
          + монеты
        </button>
        <button
          type="button"
          onClick={addItemLine}
          className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50"
        >
          + предмет
        </button>
      </div>

      {/* Distribute */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-3">
        <div className="text-xs">
          {error && <span className="text-red-700">{error}</span>}
          {info && !error && <span className="text-emerald-700">{info}</span>}
        </div>
        <button
          type="button"
          onClick={() => setDistributeOpen(true)}
          disabled={!canApply || !hasLines}
          className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {summary.rowCount > 0 ? 'Перераспределить' : 'Распределить'}
        </button>
      </div>

      {distributeOpen && (
        <DistributeDialog
          lines={lines}
          participants={participants}
          stashAvailable={stashAvailable}
          pending={pending}
          onCancel={() => setDistributeOpen(false)}
          onConfirm={(distributedLines) =>
            handleDistributeConfirm(distributedLines, false)
          }
        />
      )}

      {confirmAffected !== null && (
        <ApplyConfirmDialog
          affected={confirmAffected}
          onCancel={() => setConfirmAffected(null)}
          onConfirm={() => handleDistributeConfirm(lines, true)}
          pending={pending}
        />
      )}
    </div>
  )
}

// ─────────────────────────── coin row ───────────────────────────

function CoinLineRow({
  line,
  onChange,
  onRemove,
}: {
  line: CoinLine
  onChange: (patch: Partial<CoinLine>) => void
  onRemove: () => void
}) {
  return (
    <li className="rounded border border-gray-200 bg-gray-50 p-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-700 w-16">Монеты</span>
        <DenomInput label="cp" value={line.cp} onChange={(v) => onChange({ cp: v })} />
        <DenomInput label="sp" value={line.sp} onChange={(v) => onChange({ sp: v })} />
        <DenomInput label="gp" value={line.gp} onChange={(v) => onChange({ gp: v })} />
        <DenomInput label="pp" value={line.pp} onChange={(v) => onChange({ pp: v })} />
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-gray-400 hover:text-red-600 text-lg leading-none px-1"
          aria-label="Удалить строку"
        >
          ×
        </button>
      </div>
    </li>
  )
}

// ─────────────────────────── item row ───────────────────────────

function ItemLineRow({
  line,
  onChange,
  onRemove,
}: {
  line: ItemLine
  onChange: (patch: Partial<ItemLine>) => void
  onRemove: () => void
}) {
  return (
    <li className="rounded border border-gray-200 bg-gray-50 p-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-700 w-16">Предмет</span>
        <input
          type="text"
          value={line.name}
          placeholder="Название"
          onChange={(e) => onChange({ name: e.target.value })}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <span className="text-gray-500 text-xs">×</span>
        <input
          type="number"
          min={1}
          value={line.qty}
          onChange={(e) => onChange({ qty: Math.max(1, Number(e.target.value) || 1) })}
          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-gray-400 hover:text-red-600 text-lg leading-none px-1"
          aria-label="Удалить строку"
        >
          ×
        </button>
      </div>
    </li>
  )
}

// ─────────────────────────── shared bits ───────────────────────────

function DenomInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        value={value === 0 ? '' : value}
        placeholder="0"
        onChange={(e) =>
          onChange(Math.max(0, Number(e.target.value) || 0))
        }
        className="w-14 rounded border border-gray-300 px-2 py-1 text-sm text-right"
      />
      <span className="text-xs text-gray-500">{label}</span>
    </label>
  )
}

function RecipientPicker({
  mode,
  pcId,
  participants,
  stashAvailable,
  allowSplit,
  onChange,
}: {
  mode: 'pc' | 'stash' | 'split_evenly'
  pcId: string | null
  participants: PanelParticipant[]
  stashAvailable: boolean
  allowSplit: boolean
  onChange: (mode: 'pc' | 'stash' | 'split_evenly', pcId: string | null) => void
}) {
  // Encode current selection as a single string value:
  //   'stash' / 'split' / `pc:${pcId}`
  const current =
    mode === 'stash'
      ? 'stash'
      : mode === 'split_evenly'
        ? 'split'
        : pcId
          ? `pc:${pcId}`
          : ''

  return (
    <select
      value={current}
      onChange={(e) => {
        const v = e.target.value
        if (v === 'stash') onChange('stash', null)
        else if (v === 'split') onChange('split_evenly', null)
        else if (v.startsWith('pc:')) onChange('pc', v.slice(3))
      }}
      className="rounded border border-gray-300 px-2 py-1 text-sm bg-white"
    >
      {!current && <option value="">— выбрать —</option>}
      {stashAvailable && <option value="stash">В общак</option>}
      {allowSplit && <option value="split">Поровну участникам</option>}
      {participants.map((p) => (
        <option key={p.pcNodeId} value={`pc:${p.pcNodeId}`}>
          {p.title}
          {p.initiative !== null ? ` (init ${p.initiative})` : ''}
        </option>
      ))}
    </select>
  )
}

// ─────────────────────────── distribute dialog ───────────────────────────

/**
 * Modal that turns a flat list of loot lines (content) into per-line
 * recipient choices (distribution). Editor stays focused on
 * "what dropped"; this dialog is the explicit "now hand it out" step.
 *
 * Local state owns a copy of the lines so DM can play with options
 * without tripping the editor's debounced auto-save. On confirm we
 * emit the modified list upstream — the editor persists + applies in
 * one transaction.
 */
function DistributeDialog({
  lines: initialLines,
  participants,
  stashAvailable,
  pending,
  onCancel,
  onConfirm,
}: {
  lines: LootLine[]
  participants: PanelParticipant[]
  stashAvailable: boolean
  pending: boolean
  onCancel: () => void
  onConfirm: (distributedLines: LootLine[]) => void
}) {
  const [localLines, setLocalLines] = useState<LootLine[]>(() =>
    initialLines.map((l) => ({ ...l })),
  )

  // Esc closes (but never while a request is in flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, pending])

  function patchLine(id: string, patch: Partial<LootLine>) {
    setLocalLines((ls) =>
      ls.map((l) => (l.id === id ? ({ ...l, ...patch } as LootLine) : l)),
    )
  }

  function presetAllToStash() {
    setLocalLines((ls) =>
      ls.map((l) => ({ ...l, recipient_mode: 'stash', recipient_pc_id: null })) as LootLine[],
    )
  }

  function presetAllSplit() {
    setLocalLines((ls) =>
      ls.map((l) =>
        l.kind === 'coin'
          ? ({ ...l, recipient_mode: 'split_evenly', recipient_pc_id: null } as LootLine)
          : l,
      ),
    )
  }

  // Validity gate for the apply button. Each line must have a
  // resolvable recipient given current participants/stash.
  const invalidReasons = useMemo(() => {
    const reasons: string[] = []
    for (const l of localLines) {
      if (l.recipient_mode === 'pc' && !l.recipient_pc_id) {
        reasons.push('Не выбран получатель для одной из строк')
        break
      }
      if (l.recipient_mode === 'stash' && !stashAvailable) {
        reasons.push('Нет общака в кампании')
        break
      }
      if (l.recipient_mode === 'split_evenly' && participants.length === 0) {
        reasons.push('Нет участников для деления')
        break
      }
    }
    return reasons
  }, [localLines, participants.length, stashAvailable])

  const hasCoinLines = localLines.some((l) => l.kind === 'coin')

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(17,24,39,0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Распределение лута"
    >
      <div
        className="w-[640px] max-w-[95vw] overflow-hidden rounded-lg bg-white shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">
              Распределить лут
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Выбери получателя для каждой строки.
            </p>
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2 border-b border-gray-100 bg-gray-50 px-5 py-2 text-sm">
          {stashAvailable && (
            <button
              type="button"
              onClick={presetAllToStash}
              disabled={pending}
              className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Всё в общак
            </button>
          )}
          {hasCoinLines && participants.length > 0 && (
            <button
              type="button"
              onClick={presetAllSplit}
              disabled={pending}
              className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Все монеты — поровну
            </button>
          )}
        </div>

        {/* Lines */}
        <div className="max-h-[55vh] overflow-y-auto px-5 py-3 space-y-2">
          {localLines.map((l) => (
            <DistributeLineRow
              key={l.id}
              line={l}
              participants={participants}
              stashAvailable={stashAvailable}
              onChange={(patch) => patchLine(l.id, patch)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <div className="text-xs text-amber-700">
            {invalidReasons[0]}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={pending}
              className="rounded border border-gray-300 bg-white px-4 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={() => onConfirm(localLines)}
              disabled={pending || invalidReasons.length > 0}
              className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Применить ({localLines.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DistributeLineRow({
  line,
  participants,
  stashAvailable,
  onChange,
}: {
  line: LootLine
  participants: PanelParticipant[]
  stashAvailable: boolean
  onChange: (patch: Partial<LootLine>) => void
}) {
  // Live split preview for coin lines in split_evenly mode.
  const splitPreview = useMemo(() => {
    if (line.kind !== 'coin' || line.recipient_mode !== 'split_evenly') return null
    if (participants.length === 0) return 'нет участников'
    const splits = splitCoinsEvenly(
      { cp: line.cp, sp: line.sp, gp: line.gp, pp: line.pp },
      participants.length,
    )
    if (splits.length === 0) return null
    const first = splits[0]
    const last = splits[splits.length - 1]
    const same = splits.every(
      (s) => s.cp === first.cp && s.sp === first.sp && s.gp === first.gp && s.pp === first.pp,
    )
    if (same) return `по ${formatCoins(first)} каждому`
    const remainderCp = totalCp(first) - totalCp(last)
    const firstName = participants[0]?.title ?? '?'
    return `${formatCoins(last)} каждому, +${remainderCp} cp → ${firstName}`
  }, [line, participants])

  const summary =
    line.kind === 'coin'
      ? formatCoins(line) || '0'
      : `${line.name || '(без названия)'} × ${line.qty}`

  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <span className="font-medium text-gray-700 min-w-[120px]">{summary}</span>
      <RecipientPicker
        mode={line.recipient_mode}
        pcId={line.recipient_pc_id}
        participants={participants}
        stashAvailable={stashAvailable}
        allowSplit={line.kind === 'coin'}
        onChange={(mode, pcId) =>
          onChange({
            recipient_mode: mode,
            recipient_pc_id: pcId,
          } as Partial<LootLine>)
        }
      />
      {splitPreview && (
        <span className="text-xs text-gray-500">· {splitPreview}</span>
      )}
    </div>
  )
}
