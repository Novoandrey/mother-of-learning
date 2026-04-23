'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoinSet } from '@/lib/transactions'
import { DENOMINATIONS } from '@/lib/transaction-resolver'
import { DENOM_SHORT } from '@/lib/transaction-format'

// --- Types exported for the form wrapper ---

export type AmountInputValue =
  | { mode: 'gp'; amount: number }
  | { mode: 'denom'; coins: CoinSet }

type Props = {
  value: AmountInputValue
  onChange: (v: AmountInputValue) => void
  /** Label shown above the field. */
  label?: string
}

/**
 * Amount input — mobile-first, **magnitude-only**.
 *
 * The sign of a transaction is carried by the parent form (tab
 * choice: Доход / Расход / Перевод). This widget emits absolute
 * values only, which gets rid of the +/− toggle that was confusing
 * when the tabs were already labelled Income/Expense.
 *
 * Default mode: single gp-equivalent field. Tap "подробнее по
 * монетам…" to expand four numeric inputs (cp/sp/gp/pp). Clicks
 * outside the per-denom panel collapse it.
 */
export default function AmountInput({ value, onChange, label = 'Сумма' }: Props) {
  const [expanded, setExpanded] = useState(value.mode === 'denom')
  const rootRef = useRef<HTMLDivElement>(null)

  // Collapse the per-denom panel when focus leaves the widget.
  useEffect(() => {
    if (!expanded) return
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current) return
      if (e.target instanceof Node && rootRef.current.contains(e.target)) return
      setExpanded(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [expanded])

  const handleGpChange = useCallback(
    (raw: string) => {
      const parsed = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(parsed)) return
      onChange({ mode: 'gp', amount: Math.max(0, parsed) })
    },
    [onChange],
  )

  const handleDenomChange = useCallback(
    (d: keyof CoinSet, raw: string) => {
      const parsed = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(parsed)) return
      const currentCoins: CoinSet =
        value.mode === 'denom'
          ? value.coins
          : { cp: 0, sp: 0, gp: value.amount, pp: 0 }
      onChange({
        mode: 'denom',
        coins: { ...currentCoins, [d]: Math.max(0, Math.trunc(parsed)) },
      })
    },
    [onChange, value],
  )

  const expand = useCallback(() => {
    if (value.mode === 'gp') {
      onChange({
        mode: 'denom',
        coins: { cp: 0, sp: 0, gp: value.amount, pp: 0 },
      })
    }
    setExpanded(true)
  }, [onChange, value])

  return (
    <div ref={rootRef} className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </label>

      {!expanded ? (
        <div className="flex items-stretch gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={value.mode === 'gp' ? (value.amount || '') : ''}
            onChange={(e) => handleGpChange(e.target.value)}
            placeholder="0"
            aria-label="GP"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
          <span className="flex items-center px-2 text-sm text-gray-500">GP</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            {DENOMINATIONS.map((d) => (
              <label key={d} className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500">
                  {DENOM_SHORT[d].toUpperCase()}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  value={
                    value.mode === 'denom'
                      ? value.coins[d] || ''
                      : d === 'gp'
                      ? value.amount || ''
                      : ''
                  }
                  onChange={(e) => handleDenomChange(d, e.target.value)}
                  placeholder="0"
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="self-start text-sm text-blue-600 hover:underline"
          >
            свернуть
          </button>
        </>
      )}

      {!expanded && (
        <button
          type="button"
          onClick={expand}
          className="self-start text-sm text-blue-600 hover:underline"
        >
          подробнее по монетам…
        </button>
      )}
    </div>
  )
}
