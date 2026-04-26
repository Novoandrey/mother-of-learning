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
import ItemTypeahead from '@/components/item-typeahead'
import { splitCoinsEvenly } from '@/lib/coin-split'
import type {
  CoinLine,
  CoinSet,
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
  campaignId,
  campaignSlug,
  canEditCatalog,
  initialDraft,
  summary,
  participants,
  stashAvailable,
}: {
  encounterId: string
  /** Spec-015 (T040): for the item typeahead's catalog query. */
  campaignId: string
  /** Spec-015 (T040): for the typeahead's «+ Создать» link target. */
  campaignSlug: string
  /** Spec-015 (T040): DM-only typeahead affordance. */
  canEditCatalog: boolean
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
  const [moneyDistribution, setMoneyDistribution] = useState<
    LootDraft['money_distribution']
  >(initialDraft.money_distribution)
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
    money_distribution?: LootDraft['money_distribution']
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

  // The distribute modal owns local state for `lines` (item recipients)
  // and `money_distribution` (single global money choice). On confirm
  // we persist both into the draft AND fire applyEncounterLoot in one
  // go.
  const [distributeOpen, setDistributeOpen] = useState(false)

  async function handleDistributeConfirm(
    distributedLines: LootLine[],
    distributedMoney: LootDraft['money_distribution'],
    confirmed: boolean,
  ) {
    setPending(true)
    setError(null)
    setInfo(null)
    try {
      // 1. Persist the dialog's choices before applying — apply reads
      // from the draft, so we need it written first.
      const upd = await updateEncounterLootDraft(encounterId, {
        lines: distributedLines,
        money_distribution: distributedMoney,
      })
      if (!upd.ok) {
        setError(upd.error)
        return
      }
      // Mirror saved values into local state so the editor reflects
      // them after the dialog closes.
      setLines(distributedLines)
      setMoneyDistribution(distributedMoney)

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
              campaignId={campaignId}
              campaignSlug={campaignSlug}
              canEditCatalog={canEditCatalog}
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
          moneyDistribution={moneyDistribution}
          participants={participants}
          stashAvailable={stashAvailable}
          pending={pending}
          onCancel={() => setDistributeOpen(false)}
          onConfirm={(distributedLines, distributedMoney) =>
            handleDistributeConfirm(distributedLines, distributedMoney, false)
          }
        />
      )}

      {confirmAffected !== null && (
        <ApplyConfirmDialog
          affected={confirmAffected}
          onCancel={() => setConfirmAffected(null)}
          onConfirm={() => handleDistributeConfirm(lines, moneyDistribution, true)}
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
  // 99% case is plain GP; cp/sp/pp hidden behind a toggle to keep the
  // row compact. Auto-expand if any non-GP denom is non-zero (e.g.
  // legacy data or DM intentionally wants mixed denoms).
  const hasOtherDenoms = line.cp > 0 || line.sp > 0 || line.pp > 0
  const [expanded, setExpanded] = useState<boolean>(hasOtherDenoms)

  return (
    <li className="rounded border border-gray-200 bg-gray-50 p-2 space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-700 w-16">Монеты</span>
        <DenomInput label="gp" value={line.gp} onChange={(v) => onChange({ gp: v })} />
        {expanded ? (
          <>
            <DenomInput label="cp" value={line.cp} onChange={(v) => onChange({ cp: v })} />
            <DenomInput label="sp" value={line.sp} onChange={(v) => onChange({ sp: v })} />
            <DenomInput label="pp" value={line.pp} onChange={(v) => onChange({ pp: v })} />
            <button
              type="button"
              onClick={() => setExpanded(false)}
              disabled={hasOtherDenoms}
              title={hasOtherDenoms ? 'Сначала обнули cp/sp/pp' : 'Скрыть прочие монеты'}
              className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1"
            >
              ◂
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-xs text-gray-500 hover:text-gray-800 px-1"
            title="Показать cp/sp/pp"
          >
            +другие
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto text-gray-400 hover:text-red-600 text-lg leading-none px-1"
          aria-label="Удалить строку"
        >
          ×
        </button>
      </div>
      <input
        type="text"
        value={line.comment ?? ''}
        placeholder="За что (например «Тела пауков»)"
        onChange={(e) => onChange({ comment: e.target.value })}
        maxLength={200}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400"
      />
    </li>
  )
}

// ─────────────────────────── item row ───────────────────────────

function ItemLineRow({
  line,
  campaignId,
  campaignSlug,
  canEditCatalog,
  onChange,
  onRemove,
}: {
  line: ItemLine
  campaignId: string
  campaignSlug: string
  canEditCatalog: boolean
  onChange: (patch: Partial<ItemLine>) => void
  onRemove: () => void
}) {
  return (
    <li className="rounded border border-gray-200 bg-gray-50 p-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium text-gray-700 w-16">Предмет</span>
        <div className="flex-1 min-w-0">
          <ItemTypeahead
            campaignId={campaignId}
            campaignSlug={campaignSlug}
            value={{
              itemNodeId: line.item_node_id ?? null,
              itemName: line.name,
            }}
            onChange={(next) =>
              onChange({
                name: next.itemName,
                item_node_id: next.itemNodeId,
              })
            }
            canCreateNew={canEditCatalog}
            showFreeTextHint={false}
            placeholder="Название (или выберите Образец)"
          />
        </div>
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
        className="w-16 rounded border border-gray-300 px-1.5 py-1 text-sm text-right tabular-nums"
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
 * Distribute modal — chat-50 polish: money is one global decision,
 * items are per-line. The editor passes in the current draft state;
 * dialog owns local copies so DM can experiment without tripping
 * the editor's debounced auto-save. On confirm we emit both
 * upstream — the editor persists + applies in one transaction.
 */
function DistributeDialog({
  lines: initialLines,
  moneyDistribution: initialMoney,
  participants,
  stashAvailable,
  pending,
  onCancel,
  onConfirm,
}: {
  lines: LootLine[]
  moneyDistribution: LootDraft['money_distribution']
  participants: PanelParticipant[]
  stashAvailable: boolean
  pending: boolean
  onCancel: () => void
  onConfirm: (
    distributedLines: LootLine[],
    distributedMoney: LootDraft['money_distribution'],
  ) => void
}) {
  const [localLines, setLocalLines] = useState<LootLine[]>(() =>
    initialLines.map((l) => ({ ...l })),
  )
  const [localMoney, setLocalMoney] = useState<LootDraft['money_distribution']>(
    initialMoney,
  )

  // Esc closes (but never while a request is in flight).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel, pending])

  function patchItemLine(id: string, patch: Partial<ItemLine>) {
    setLocalLines((ls) =>
      ls.map((l) =>
        l.id === id && l.kind === 'item' ? ({ ...l, ...patch } as LootLine) : l,
      ),
    )
  }

  // Total money summed across all coin lines — drives the «всего: X gp»
  // header next to the money distribution picker.
  const totalCoins = useMemo(() => {
    const t = { cp: 0, sp: 0, gp: 0, pp: 0 }
    for (const l of localLines) {
      if (l.kind === 'coin') {
        t.cp += l.cp
        t.sp += l.sp
        t.gp += l.gp
        t.pp += l.pp
      }
    }
    return t
  }, [localLines])
  const hasMoney =
    totalCoins.cp > 0 || totalCoins.sp > 0 || totalCoins.gp > 0 || totalCoins.pp > 0

  // Split preview for «поровну» mode.
  const splitPreview = useMemo(() => {
    if (!hasMoney || localMoney.mode !== 'split_evenly') return null
    if (participants.length === 0) return 'нет участников'
    const splits = splitCoinsEvenly(totalCoins, participants.length)
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
  }, [hasMoney, localMoney.mode, totalCoins, participants])

  function presetAllToStash() {
    if (stashAvailable) setLocalMoney({ mode: 'stash', pc_id: null })
    setLocalLines((ls) =>
      ls.map((l) =>
        l.kind === 'item'
          ? ({ ...l, recipient_mode: 'stash', recipient_pc_id: null } as LootLine)
          : l,
      ),
    )
  }

  function presetMoneySplit() {
    setLocalMoney({ mode: 'split_evenly', pc_id: null })
  }

  const itemLines = localLines.filter((l): l is ItemLine => l.kind === 'item')

  // Validity gate. Surface the first issue.
  const invalidReason = useMemo<string | null>(() => {
    if (hasMoney) {
      if (localMoney.mode === 'pc' && !localMoney.pc_id) {
        return 'Не выбран получатель денег'
      }
      if (localMoney.mode === 'stash' && !stashAvailable) {
        return 'Нет общака в кампании'
      }
      if (localMoney.mode === 'split_evenly' && participants.length === 0) {
        return 'Нет участников для деления денег'
      }
      if (localMoney.mode === 'manual') {
        const totalCp =
          totalCoins.cp + 10 * totalCoins.sp + 100 * totalCoins.gp + 1000 * totalCoins.pp
        let sumCp = 0
        for (const c of Object.values(localMoney.amounts)) {
          sumCp += c.cp + 10 * c.sp + 100 * c.gp + 1000 * c.pp
        }
        if (sumCp !== totalCp) {
          const fmt = (cp: number): string => {
            const gp = Math.floor(cp / 100)
            const rem = cp % 100
            return rem === 0 ? `${gp} gp` : `${gp} gp ${rem} cp`
          }
          return `Сумма (${fmt(sumCp)}) ≠ общая (${fmt(totalCp)})`
        }
      }
    }
    for (const l of itemLines) {
      if (l.recipient_mode === 'pc' && !l.recipient_pc_id) {
        return `Не выбран получатель для «${l.name || 'предмета'}»`
      }
      if (l.recipient_mode === 'stash' && !stashAvailable) {
        return 'Нет общака в кампании'
      }
    }
    return null
  }, [hasMoney, localMoney, totalCoins, itemLines, participants.length, stashAvailable])

  // Total apply count: 1 for money (if any) + N for items.
  const applyCount = (hasMoney ? 1 : 0) + itemLines.length

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
              Деньги — одно решение на весь энкаунтер. Предметы — по штуке.
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
          {hasMoney && participants.length > 0 && (
            <button
              type="button"
              onClick={presetMoneySplit}
              disabled={pending}
              className="rounded border border-gray-300 bg-white px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Деньги — поровну
            </button>
          )}
        </div>

        {/* Body */}
        <div className="max-h-[55vh] overflow-y-auto px-5 py-3 space-y-4">
          {/* Money section */}
          {hasMoney ? (
            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-3 space-y-2">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold text-gray-800">Деньги</span>
                <span className="text-gray-500">
                  всего: {formatCoins(totalCoins)}
                </span>
              </div>

              {localMoney.mode !== 'manual' ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-600">Кому:</span>
                    <RecipientPicker
                      mode={localMoney.mode}
                      pcId={localMoney.pc_id}
                      participants={participants}
                      stashAvailable={stashAvailable}
                      allowSplit={true}
                      onChange={(mode, pcId) => {
                        if (mode === 'pc') {
                          setLocalMoney({ mode: 'pc', pc_id: pcId ?? '' })
                        } else if (mode === 'stash') {
                          setLocalMoney({ mode: 'stash', pc_id: null })
                        } else {
                          setLocalMoney({ mode: 'split_evenly', pc_id: null })
                        }
                      }}
                    />
                    {splitPreview && (
                      <span className="text-xs text-gray-500">· {splitPreview}</span>
                    )}
                  </div>
                  {participants.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        // Seed manual amounts from split-evenly so the DM
                        // has a sensible starting point, not a blank slate.
                        const seed: Record<string, CoinSet> = {}
                        if (participants.length > 0) {
                          const splits = splitCoinsEvenly(
                            totalCoins,
                            participants.length,
                          )
                          for (let i = 0; i < participants.length; i++) {
                            seed[participants[i].pcNodeId] = splits[i]
                          }
                        }
                        setLocalMoney({
                          mode: 'manual',
                          pc_id: null,
                          amounts: seed,
                        })
                      }}
                      className="text-xs text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      или указать суммы вручную ▾
                    </button>
                  )}
                </>
              ) : (
                <ManualMoneySection
                  totalCoins={totalCoins}
                  participants={participants}
                  amounts={localMoney.amounts}
                  onChange={(next) =>
                    setLocalMoney({ mode: 'manual', pc_id: null, amounts: next })
                  }
                  onCancel={() =>
                    setLocalMoney({ mode: 'split_evenly', pc_id: null })
                  }
                />
              )}
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-200 px-3 py-3 text-sm text-gray-400">
              Денег нет.
            </div>
          )}

          {/* Items section */}
          {itemLines.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-800">Предметы</div>
              {itemLines.map((l) => (
                <ItemDistributeRow
                  key={l.id}
                  line={l}
                  participants={participants}
                  stashAvailable={stashAvailable}
                  onChange={(patch) => patchItemLine(l.id, patch)}
                />
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <div className="text-xs text-amber-700">
            {invalidReason}
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
              onClick={() => onConfirm(localLines, localMoney)}
              disabled={pending || invalidReason !== null || applyCount === 0}
              className="rounded bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Применить ({applyCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemDistributeRow({
  line,
  participants,
  stashAvailable,
  onChange,
}: {
  line: ItemLine
  participants: PanelParticipant[]
  stashAvailable: boolean
  onChange: (patch: Partial<ItemLine>) => void
}) {
  const summary = `${line.name || '(без названия)'} × ${line.qty}`
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
      <span className="font-medium text-gray-700 min-w-[160px]">{summary}</span>
      <RecipientPicker
        mode={line.recipient_mode}
        pcId={line.recipient_pc_id}
        participants={participants}
        stashAvailable={stashAvailable}
        allowSplit={false}
        onChange={(mode, pcId) => {
          // Items: only stash or pc, never split. RecipientPicker
          // doesn't show split option (allowSplit=false), but be
          // defensive on the type narrowing.
          if (mode === 'pc') {
            onChange({ recipient_mode: 'pc', recipient_pc_id: pcId })
          } else if (mode === 'stash') {
            onChange({ recipient_mode: 'stash', recipient_pc_id: null })
          }
        }}
      />
    </div>
  )
}

// ─────────────────────────── manual money section ───────────────────────────

/**
 * Per-PC manual money input. Lives inside the money section of the
 * Distribute dialog when `localMoney.mode === 'manual'`.
 *
 * Layout: list of PC rows with a GP input each (cp/sp/pp behind a per-
 * row toggle, same pattern as `CoinLineRow`). Above: running total +
 * delta vs draft total. Below: «Заполнить поровну» seeds split-evenly,
 * «обычное распределение» switches back via `onCancel`.
 *
 * The validity check (sum equals draft total) lives in the parent
 * dialog's `invalidReason`; this component just edits the data.
 */
function ManualMoneySection({
  totalCoins,
  participants,
  amounts,
  onChange,
  onCancel,
}: {
  totalCoins: CoinSet
  participants: PanelParticipant[]
  amounts: Record<string, CoinSet>
  onChange: (next: Record<string, CoinSet>) => void
  onCancel: () => void
}) {
  function patchPc(pcNodeId: string, patch: Partial<CoinSet>) {
    const prev = amounts[pcNodeId] ?? { cp: 0, sp: 0, gp: 0, pp: 0 }
    onChange({ ...amounts, [pcNodeId]: { ...prev, ...patch } })
  }

  function fillEvenly() {
    if (participants.length === 0) return
    const splits = splitCoinsEvenly(totalCoins, participants.length)
    const next: Record<string, CoinSet> = {}
    for (let i = 0; i < participants.length; i++) {
      next[participants[i].pcNodeId] = splits[i]
    }
    onChange(next)
  }

  // Running totals.
  const totalCp = totalCp_(totalCoins)
  const sumCp = useMemo(() => {
    let s = 0
    for (const c of Object.values(amounts)) s += totalCp_(c)
    return s
  }, [amounts])
  const delta = sumCp - totalCp
  const balanced = delta === 0

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-gray-600">Кому:</span>
        <span className="text-gray-900 font-medium">вручную по PC</span>
        <button
          type="button"
          onClick={onCancel}
          className="ml-auto text-xs text-blue-700 hover:text-blue-900 hover:underline"
        >
          ← обычное распределение
        </button>
      </div>

      <div className="space-y-1">
        {participants.map((p) => (
          <ManualPcRow
            key={p.pcNodeId}
            participant={p}
            coins={amounts[p.pcNodeId] ?? { cp: 0, sp: 0, gp: 0, pp: 0 }}
            onChange={(patch) => patchPc(p.pcNodeId, patch)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-2 pt-1">
        <span className="text-xs text-gray-500">
          Распределено: {formatCoinsCp(sumCp)} / {formatCoinsCp(totalCp)}
        </span>
        {!balanced && (
          <span className="text-xs text-amber-700">
            ({delta > 0 ? '+' : ''}{formatCoinsCp(Math.abs(delta))} {delta > 0 ? 'лишних' : 'не хватает'})
          </span>
        )}
        <button
          type="button"
          onClick={fillEvenly}
          disabled={participants.length === 0}
          className="ml-auto rounded border border-gray-300 bg-white px-2 py-0.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          Заполнить поровну
        </button>
      </div>
    </div>
  )
}

function ManualPcRow({
  participant,
  coins,
  onChange,
}: {
  participant: PanelParticipant
  coins: CoinSet
  onChange: (patch: Partial<CoinSet>) => void
}) {
  const hasOtherDenoms = coins.cp > 0 || coins.sp > 0 || coins.pp > 0
  const [expanded, setExpanded] = useState<boolean>(hasOtherDenoms)

  return (
    <div className="flex items-center gap-2 rounded border border-gray-200 bg-white px-2 py-1">
      <span className="flex-1 truncate text-gray-800" title={participant.title}>
        {participant.title}
      </span>
      <DenomInput label="gp" value={coins.gp} onChange={(v) => onChange({ gp: v })} />
      {expanded ? (
        <>
          <DenomInput label="cp" value={coins.cp} onChange={(v) => onChange({ cp: v })} />
          <DenomInput label="sp" value={coins.sp} onChange={(v) => onChange({ sp: v })} />
          <DenomInput label="pp" value={coins.pp} onChange={(v) => onChange({ pp: v })} />
          <button
            type="button"
            onClick={() => setExpanded(false)}
            disabled={hasOtherDenoms}
            title={hasOtherDenoms ? 'Сначала обнули cp/sp/pp' : 'Скрыть'}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-30 px-1"
          >
            ◂
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-gray-500 hover:text-gray-800 px-1"
          title="Показать cp/sp/pp"
        >
          +другие
        </button>
      )}
    </div>
  )
}

// Local helpers (avoid name clash with the `totalCp` defined above for
// CoinLine objects — these take a CoinSet which has the same shape but
// no kind discriminator).
function totalCp_(c: CoinSet): number {
  return c.cp + 10 * c.sp + 100 * c.gp + 1000 * c.pp
}

function formatCoinsCp(cp: number): string {
  if (cp === 0) return '0 gp'
  const pp = Math.floor(cp / 1000)
  const rem1 = cp - pp * 1000
  const gp = Math.floor(rem1 / 100)
  const rem2 = rem1 - gp * 100
  const sp = Math.floor(rem2 / 10)
  const cpRem = rem2 - sp * 10
  const parts: string[] = []
  if (pp) parts.push(`${pp} pp`)
  if (gp) parts.push(`${gp} gp`)
  if (sp) parts.push(`${sp} sp`)
  if (cpRem) parts.push(`${cpRem} cp`)
  return parts.join(' ') || '0 gp'
}
