'use client'

import { useState } from 'react'
import type { TransactionWithRelations } from '@/lib/transactions'
import { summarizeExpedition } from '@/lib/transaction-dedup'
import { formatAmount } from '@/lib/transaction-format'

type Props = {
  groupId: string
  /** All 1–3 rows of the вылазка (consumables / reward money / loot). */
  rows: TransactionWithRelations[]
  /** Viewer can delete this вылазка (DM/owner, or the player who ran it). */
  canEdit: boolean
  /** Deletes the whole group (every row) — see `deleteExpeditionGroup`. */
  onDelete: (groupId: string, rows: TransactionWithRelations[]) => void
  busy?: boolean
}

const MINUS_SIGN = '−' // U+2212, typographic minus

/** Plain gp number for the compact breakdown line — no unit, no sign. */
function fmtGp(n: number): string {
  const r = Math.round(n * 100) / 100
  if (Number.isInteger(r)) return String(r)
  return r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/**
 * One вылазка as a single collapsible feed entry (spec-055 R2 #5).
 *
 * A run writes 1–3 rows sharing a `transfer_group_id` (consumables expense,
 * reward money, loot) — the ledger folds them here into one readable record
 * instead of three mirrored-looking lines.
 *
 * Collapsed: 🧭 + day chip + «Вылазка: <цель>» + a muted composition line +
 * the net money on the right. Expanded: the loot itemised. Editing a single
 * leg would desync the `expedition_runs` log, so the summary offers only
 * delete-the-whole-thing (mirrors how a transfer deletes both legs).
 */
export default function ExpeditionRow({
  groupId,
  rows,
  canEdit,
  onDelete,
  busy,
}: Props) {
  const [open, setOpen] = useState(false)
  const s = summarizeExpedition(rows)

  const dayChip =
    s.sessionNumber != null
      ? `д.${s.dayInLoop}·с.${s.sessionNumber}`
      : `д.${s.dayInLoop}`

  const net = s.earnedGp - s.spentGp
  const hasMoney = s.spentGp > 0 || s.earnedGp > 0
  const netAbs = formatAmount({ cp: 0, sp: 0, gp: Math.abs(net), pp: 0 })
  const netText = !hasMoney
    ? '—'
    : net === 0
      ? '0 GP'
      : `${net < 0 ? MINUS_SIGN : '+'}${netAbs}`
  const netClass =
    net < 0 ? 'text-red-700' : net > 0 ? 'text-emerald-700' : 'text-gray-700'

  const lootCount = s.items.reduce((n, it) => n + it.qty, 0)

  // Compact, always-visible composition — spent / earned / loot names.
  const compositionParts: string[] = []
  if (s.spentGp > 0) compositionParts.push(`${MINUS_SIGN}${fmtGp(s.spentGp)} расходники`)
  if (s.earnedGp > 0) compositionParts.push(`+${fmtGp(s.earnedGp)} награда`)
  for (const it of s.items) compositionParts.push(`${it.name} ×${it.qty}`)
  const composition = compositionParts.join(' · ')

  const canExpand = s.items.length > 0

  return (
    <li className="group flex flex-col rounded-md border border-gray-200 border-l-4 border-l-indigo-300 bg-white px-2.5 py-2 hover:border-gray-300 sm:px-3">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: toggle spanning the summary */}
        <button
          type="button"
          onClick={() => canExpand && setOpen((v) => !v)}
          aria-expanded={canExpand ? open : undefined}
          className={`flex min-w-0 flex-1 flex-col gap-0.5 text-left focus:outline-none ${
            canExpand ? '' : 'cursor-default'
          }`}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="shrink-0 text-sm" aria-hidden>
              🧭
            </span>
            <span className="inline-flex shrink-0 items-center rounded bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-700">
              {dayChip}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
              Вылазка: {s.target || '—'}
            </span>
            {lootCount > 0 && (
              <span
                className="hidden shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 sm:inline-flex"
                title="Предметов в луте"
              >
                🎒 {lootCount}
              </span>
            )}
            {canExpand && (
              <span className="shrink-0 text-xs text-gray-400" aria-hidden>
                {open ? '▾' : '▸'}
              </span>
            )}
          </span>
          {composition && (
            <span className="truncate text-xs text-gray-500">{composition}</span>
          )}
        </button>

        {/* Right: net money + delete */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span
            className={`shrink-0 text-right text-sm font-semibold tabular-nums ${netClass}`}
            title="Нетто по деньгам (награда − расходники)"
          >
            {netText}
          </span>
          {canEdit && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onDelete(groupId, rows)}
                disabled={busy}
                className="rounded px-1.5 py-0.5 text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"
                aria-label="Удалить вылазку"
              >
                {busy ? '…' : 'уд.'}
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Expanded: loot itemised (full names + qty). */}
      {open && s.items.length > 0 && (
        <ul className="mt-2 flex flex-col gap-0.5 border-t border-gray-100 pt-2 pl-6 text-xs text-gray-600">
          {s.items.map((it, i) => (
            <li
              key={`${it.name}-${i}`}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate text-gray-700">{it.name}</span>
              <span className="shrink-0 tabular-nums text-gray-500">
                ×{it.qty}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
