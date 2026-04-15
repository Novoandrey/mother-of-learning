'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'

type Props = {
  currentHp: number
  maxHp: number
  onHpChange: (newHp: number) => void
  onMaxHpChange: (maxHp: number, currentHp: number) => void
  disabled?: boolean
}

/**
 * Smart HP parser — one input, multiple formats:
 *   "-10"   → subtract 10 from current
 *   "+7"    → add 7 to current
 *   "45"    → set current to 45
 *   "45/60" → set current to 45, max to 60
 *   "/60"   → set max to 60, adjust current if needed
 */
function parseHpInput(
  input: string,
  currentHp: number,
  maxHp: number
): { current: number; max: number } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Format: "current/max" or "/max"
  if (trimmed.includes('/')) {
    const [left, right] = trimmed.split('/')
    const newMax = parseInt(right)
    if (isNaN(newMax) || newMax < 0) return null

    if (left.trim() === '') {
      // "/60" — only change max
      return { current: Math.min(currentHp, newMax), max: newMax }
    }
    const newCur = parseInt(left)
    if (isNaN(newCur) || newCur < 0) return null
    return { current: Math.min(newCur, newMax), max: newMax }
  }

  // Delta: starts with + or -
  if (trimmed.startsWith('-') || trimmed.startsWith('+')) {
    const delta = parseInt(trimmed)
    if (isNaN(delta)) return null
    return { current: Math.max(0, Math.min(maxHp, currentHp + delta)), max: maxHp }
  }

  // Direct value: set current HP
  const val = parseInt(trimmed)
  if (isNaN(val) || val < 0) return null
  return { current: Math.min(val, maxHp || val), max: maxHp || val }
}

export function HpCell({ currentHp, maxHp, onHpChange, onMaxHpChange, disabled = false }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function startEdit() {
    if (disabled) return
    // Pre-fill with current/max for easy editing
    setDraft(maxHp > 0 ? '' : '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const result = parseHpInput(draft, currentHp, maxHp)
    if (!result) return

    if (result.max !== maxHp) {
      onMaxHpChange(result.max, result.current)
    } else if (result.current !== currentHp) {
      onHpChange(result.current)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') setEditing(false)
  }

  // Editing mode — single input
  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9+\-/. ]/g, ''))}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={maxHp > 0 ? '-10, +7, 45, 30/60' : '60 или 30/60'}
        className="w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-center text-sm font-mono focus:outline-none"
      />
    )
  }

  // No max HP yet — show setup prompt
  if (maxHp === 0) {
    return (
      <button
        onClick={startEdit}
        disabled={disabled}
        className="rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
      >
        + HP
      </button>
    )
  }

  // Display mode — one clickable area
  const pct = maxHp > 0 ? (currentHp / maxHp) * 100 : 0
  const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : pct > 0 ? 'bg-red-500' : 'bg-gray-300'

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={`w-full text-left ${disabled ? 'cursor-default' : 'cursor-text hover:bg-blue-50/50'} rounded px-1 py-0.5 transition-colors`}
      title="Клик: -10 урон, +7 лечение, 45 прямое, 30/60 оба"
    >
      <div className="flex items-baseline gap-0.5 font-mono text-sm">
        <span className={`font-bold ${currentHp === 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {currentHp}
        </span>
        <span className="text-gray-400 text-xs">/{maxHp}</span>
      </div>
      <div className="mt-0.5 h-1 rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </button>
  )
}
