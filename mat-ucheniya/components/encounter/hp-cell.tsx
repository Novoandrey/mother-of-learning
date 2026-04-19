'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'

type Props = {
  currentHp: number
  maxHp: number
  onHpChange: (newHp: number) => void
  onMaxHpChange: (maxHp: number, currentHp: number) => void
  onRawInput?: (raw: string) => void
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
export function parseHpInput(
  input: string,
  currentHp: number,
  maxHp: number
): { current: number; max: number } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (trimmed.includes('/')) {
    const [left, right] = trimmed.split('/')
    const newMax = parseInt(right)
    if (isNaN(newMax) || newMax < 0) return null

    if (left.trim() === '') {
      return { current: Math.min(currentHp, newMax), max: newMax }
    }
    const newCur = parseInt(left)
    if (isNaN(newCur) || newCur < 0) return null
    return { current: Math.min(newCur, newMax), max: newMax }
  }

  if (trimmed.startsWith('-') || trimmed.startsWith('+')) {
    const delta = parseInt(trimmed)
    if (isNaN(delta)) return null
    return { current: Math.max(0, Math.min(maxHp, currentHp + delta)), max: maxHp }
  }

  const val = parseInt(trimmed)
  if (isNaN(val) || val < 0) return null
  return { current: Math.min(val, maxHp || val), max: maxHp || val }
}

export function HpCell({ currentHp, maxHp, onHpChange, onMaxHpChange, onRawInput, disabled = false }: Props) {
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
    setDraft('')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const result = parseHpInput(draft, currentHp, maxHp)
    if (!result) return

    onRawInput?.(draft)

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
        className="w-full rounded-[var(--radius)] border bg-white px-1.5 py-[3px] text-center font-mono text-[13px] focus:outline-none"
        style={{ borderColor: 'var(--blue-500)', boxShadow: 'var(--shadow-focus)' }}
      />
    )
  }

  if (maxHp === 0) {
    return (
      <button
        onClick={startEdit}
        disabled={disabled}
        className="rounded-[var(--radius)] border border-dashed px-2 py-[3px] text-[11px] transition-colors hover:text-[var(--blue-600)]"
        style={{ borderColor: 'var(--gray-300)', color: 'var(--fg-mute)' }}
      >
        + HP
      </button>
    )
  }

  const pct = maxHp > 0 ? (currentHp / maxHp) * 100 : 0
  // Semantic HP bar colour: green > 50%, amber > 25%, red > 0%, gray at 0.
  const barColor =
    pct > 50 ? 'var(--green-500)' : pct > 25 ? 'var(--amber-400)' : pct > 0 ? 'var(--red-500)' : 'var(--gray-300)'
  const trackColor = 'var(--gray-200)'

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={`w-full rounded-[var(--radius)] px-1 py-[3px] text-left transition-colors ${
        disabled ? 'cursor-default' : 'cursor-text hover:bg-[var(--blue-50)]'
      }`}
      title="Клик: -10 урон, +7 лечение, 45 прямое, 30/60 оба"
    >
      <div className="flex items-baseline gap-0.5 tabular font-mono text-[13px]">
        <span
          className="font-semibold"
          style={{ color: currentHp === 0 ? 'var(--red-600)' : 'var(--fg-1)' }}
        >
          {currentHp}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--fg-mute)' }}>
          /{maxHp}
        </span>
      </div>
      <div
        className="mt-[3px] h-[3px] overflow-hidden rounded-full"
        style={{ background: trackColor }}
      >
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
    </button>
  )
}
