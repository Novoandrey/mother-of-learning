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
 * Parse HP input with delta notation:
 * "-14" → subtract 14
 * "+7"  → add 7
 * "45"  → set to 45
 */
function parseHpInput(input: string, currentHp: number, maxHp: number): number | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Delta: starts with + or -
  if (trimmed.startsWith('-') || trimmed.startsWith('+')) {
    const delta = parseInt(trimmed)
    if (isNaN(delta)) return null
    return Math.max(0, Math.min(maxHp, currentHp + delta))
  }

  // Direct value
  const val = parseInt(trimmed)
  if (isNaN(val) || val < 0) return null
  return Math.min(val, maxHp)
}

export function HpCell({ currentHp, maxHp, onHpChange, onMaxHpChange, disabled = false }: Props) {
  const [editingCurrent, setEditingCurrent] = useState(false)
  const [editingMax, setEditingMax] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if ((editingCurrent || editingMax) && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingCurrent, editingMax])

  // No max HP yet — show setup
  if (maxHp === 0 && !editingMax) {
    return (
      <button
        onClick={() => { if (!disabled) { setDraft(''); setEditingMax(true) } }}
        disabled={disabled}
        className="rounded border border-dashed border-gray-300 px-2 py-0.5 text-xs text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
      >
        + HP
      </button>
    )
  }

  function commitCurrent() {
    setEditingCurrent(false)
    const result = parseHpInput(draft, currentHp, maxHp)
    if (result !== null && result !== currentHp) {
      onHpChange(result)
    }
  }

  function commitMax() {
    setEditingMax(false)
    const n = parseInt(draft)
    if (!isNaN(n) && n >= 0 && n !== maxHp) {
      const newCurrent = maxHp === 0 ? n : Math.min(currentHp, n)
      onMaxHpChange(n, newCurrent)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, commitFn: () => void) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (e.key === 'Enter') e.preventDefault()
      commitFn()
    }
    if (e.key === 'Escape') {
      setEditingCurrent(false)
      setEditingMax(false)
    }
  }

  if (editingCurrent || editingMax) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9+\-.]/g, ''))}
        onBlur={editingCurrent ? commitCurrent : commitMax}
        onKeyDown={(e) => handleKeyDown(e, editingCurrent ? commitCurrent : commitMax)}
        placeholder={editingMax ? 'Max HP' : '-14, +7, 45'}
        className="w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-center text-sm font-mono focus:outline-none"
      />
    )
  }

  const pct = maxHp > 0 ? (currentHp / maxHp) * 100 : 0
  const barColor = pct > 50 ? 'bg-green-500' : pct > 25 ? 'bg-yellow-500' : pct > 0 ? 'bg-red-500' : 'bg-gray-300'

  return (
    <div className="w-full">
      <div className="flex items-baseline gap-0.5">
        <button
          onClick={() => { if (!disabled) { setDraft(''); setEditingCurrent(true) } }}
          disabled={disabled}
          className={`font-mono text-sm font-bold ${
            disabled ? 'cursor-default' : 'cursor-text hover:underline'
          } ${currentHp === 0 ? 'text-red-500' : 'text-gray-900'}`}
          title="Клик: прямой ввод. -14 = урон, +7 = лечение"
        >
          {currentHp}
        </button>
        <button
          onClick={() => { if (!disabled) { setDraft(String(maxHp)); setEditingMax(true) } }}
          disabled={disabled}
          className={`text-xs text-gray-400 ${disabled ? 'cursor-default' : 'hover:text-blue-500'} transition-colors`}
          title="Изменить макс. HP"
        >
          /{maxHp}
        </button>
      </div>
      <div className="mt-0.5 h-1 rounded-full bg-gray-200">
        <div
          className={`h-full rounded-full transition-all duration-200 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
