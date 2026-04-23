'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CoinSet } from '@/lib/transactions'
import { DENOMINATIONS } from '@/lib/transaction-resolver'
import { DENOM_SHORT } from '@/lib/transaction-format'

// --- Types exported for the form wrapper ---

export type AmountInputValue =
  | { mode: 'gp'; amount: number; sign: 1 | -1 }
  | { mode: 'denom'; coins: CoinSet; sign: 1 | -1 }

type Props = {
  value: AmountInputValue
  onChange: (v: AmountInputValue) => void
  /** Disables sign toggle (for item rows / earn-only contexts). */
  signLocked?: boolean
  /** Label shown above the field. Defaults to "Сумма". */
  label?: string
}

/**
 * Amount input — mobile-first.
 *
 * Default mode: single gp-equivalent numeric field + `+/−` toggle.
 * Tap "подробнее по монетам…" to expand four numeric inputs
 * (cp/sp/gp/pp). Clicks outside the per-denom panel collapse it
 * back to the aggregate field. Controlled component — `value` in,
 * `onChange` out, no internal source of truth.
 */
export default function AmountInput({
  value,
  onChange,
  signLocked = false,
  label = 'Сумма',
}: Props) {
  const [expanded, setExpanded] = useState(value.mode === 'denom')
  const rootRef = useRef<HTMLDivElement>(null)

  // Collapse the per-denom panel when focus leaves the widget. Mousedown-based
  // detection matches the native select/dropdown dismiss behavior.
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

  const toggleSign = useCallback(() => {
    if (signLocked) return
    const next: AmountInputValue = { ...value, sign: value.sign === 1 ? -1 : 1 }
    onChange(next)
  }, [onChange, signLocked, value])

  const handleGpChange = useCallback(
    (raw: string) => {
      const parsed = raw === '' ? 0 : Number(raw)
      if (!Number.isFinite(parsed)) return
      onChange({
        mode: 'gp',
        amount: Math.max(0, parsed),
        sign: value.sign,
      })
    },
    [onChange, value.sign],
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
        sign: value.sign,
      })
    },
    [onChange, value],
  )

  const expand = useCallback(() => {
    if (value.mode === 'gp') {
      onChange({
        mode: 'denom',
        coins: { cp: 0, sp: 0, gp: value.amount, pp: 0 },
        sign: value.sign,
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
          <button
            type="button"
            onClick={toggleSign}
            disabled={signLocked}
            aria-label={value.sign === 1 ? 'Доход' : 'Расход'}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              value.sign === 1
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            {value.sign === 1 ? '+' : '−'}
          </button>
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
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSign}
              disabled={signLocked}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                value.sign === 1
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              {value.sign === 1 ? '+' : '−'}
            </button>
            <span className="text-xs text-gray-500">знак применится ко всем монетам</span>
          </div>
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
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            свернуть
          </button>
        </div>
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
