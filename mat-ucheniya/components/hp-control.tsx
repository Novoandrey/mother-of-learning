'use client'

import { useState } from 'react'

type Props = {
  currentHp: number
  maxHp: number
  onChange: (newHp: number) => void
  onMaxHpChange: (maxHp: number, currentHp: number) => void
  disabled?: boolean
}

export function HpControl({ currentHp, maxHp, onChange, onMaxHpChange, disabled }: Props) {
  const [amount, setAmount] = useState('')
  const [editingMax, setEditingMax] = useState(false)
  const [maxDraft, setMaxDraft] = useState('')

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

  function startEditMax() {
    if (disabled) return
    setMaxDraft(maxHp > 0 ? String(maxHp) : '')
    setEditingMax(true)
  }

  function commitMax() {
    setEditingMax(false)
    const n = parseInt(maxDraft)
    if (!isNaN(n) && n >= 0 && n !== maxHp) {
      // When setting max HP, also set current HP to max (full health)
      const newCurrent = n > maxHp ? Math.min(currentHp + (n - maxHp), n) : Math.min(currentHp, n)
      onMaxHpChange(n, maxHp === 0 ? n : newCurrent)
    }
  }

  // No max HP set — show setup prompt
  if (maxHp === 0 && !editingMax) {
    return (
      <button
        onClick={startEditMax}
        disabled={disabled}
        className="rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
      >
        + HP
      </button>
    )
  }

  if (editingMax) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={maxDraft}
        onChange={(e) => setMaxDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commitMax}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitMax()
          if (e.key === 'Escape') setEditingMax(false)
        }}
        placeholder="Макс HP"
        className="w-20 rounded border border-blue-400 px-2 py-1 text-center text-xs font-medium focus:outline-none"
      />
    )
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
          <button
            onClick={startEditMax}
            disabled={disabled}
            className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
            title="Изменить макс. HP"
          >
            / {maxHp}
          </button>
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
