'use client'

import { useState } from 'react'

type Props = {
  currentHp: number
  maxHp: number
  onChange: (newHp: number) => void
  disabled?: boolean
}

export function HpControl({ currentHp, maxHp, onChange, disabled }: Props) {
  const [amount, setAmount] = useState('')

  function applyDamage() {
    const n = parseInt(amount)
    if (isNaN(n) || n <= 0) return
    onChange(Math.max(0, currentHp - n))
    setAmount('')
  }

  function applyHeal() {
    const n = parseInt(amount)
    if (isNaN(n) || n <= 0) return
    onChange(Math.min(maxHp, currentHp + n))
    setAmount('')
  }

  const pct = maxHp > 0 ? (currentHp / maxHp) * 100 : 0
  const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : pct > 0 ? 'bg-red-500' : 'bg-gray-300'

  return (
    <div className="flex items-center gap-1.5">
      {/* HP numbers + bar */}
      <div className="w-24">
        <div className="flex items-baseline justify-between">
          <span className={`text-sm font-mono font-bold ${currentHp === 0 ? 'text-red-500' : 'text-gray-900'}`}>
            {currentHp}
          </span>
          <span className="text-xs text-gray-400">/ {maxHp}</span>
        </div>
        <div className="mt-0.5 h-1.5 rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-200 ${barColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Controls */}
      {!disabled && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={applyDamage}
            disabled={!amount || currentHp === 0}
            className="flex h-6 w-6 items-center justify-center rounded text-sm font-bold text-red-600 hover:bg-red-50 disabled:opacity-30"
            title="Урон"
          >
            −
          </button>
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && applyDamage()}
            placeholder="0"
            className="w-10 rounded border border-gray-200 px-1 py-0.5 text-center text-xs focus:border-blue-400 focus:outline-none"
          />
          <button
            onClick={applyHeal}
            disabled={!amount || currentHp === maxHp}
            className="flex h-6 w-6 items-center justify-center rounded text-sm font-bold text-green-600 hover:bg-green-50 disabled:opacity-30"
            title="Лечение"
          >
            +
          </button>
        </div>
      )}
    </div>
  )
}
