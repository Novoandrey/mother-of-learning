'use client'

import { useState } from 'react'

type Props = {
  value: number
  onChange: (tempHp: number) => void
  disabled?: boolean
}

export function TempHpInput({ value, onChange, disabled }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit() {
    if (disabled) return
    setDraft(value > 0 ? String(value) : '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const n = parseInt(draft)
    if (draft.trim() === '' || (isNaN(n))) {
      onChange(0)
    } else {
      onChange(Math.max(0, n))
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="0"
        className="w-12 rounded border border-blue-400 bg-white px-1 py-0.5 text-center text-xs font-medium focus:outline-none"
      />
    )
  }

  if (value === 0) {
    return (
      <button
        onClick={startEdit}
        disabled={disabled}
        className="w-12 rounded border border-dashed border-gray-200 py-0.5 text-center text-xs text-gray-300 hover:border-blue-300 hover:text-blue-400 transition-colors"
        title="Добавить временные HP"
      >
        —
      </button>
    )
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className="w-12 rounded border border-cyan-200 bg-cyan-50 py-0.5 text-center text-xs font-bold text-cyan-700 hover:border-cyan-400 transition-colors"
      title="Временные HP"
    >
      +{value}
    </button>
  )
}
