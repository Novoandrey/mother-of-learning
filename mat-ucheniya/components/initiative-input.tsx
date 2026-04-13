'use client'

import { useState, useRef, useEffect } from 'react'

type Props = {
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
}

export function InitiativeInput({ value, onChange, disabled }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function startEdit() {
    if (disabled) return
    setDraft(value != null ? String(value) : '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed === '') {
      onChange(null)
    } else {
      const num = parseFloat(trimmed)
      if (!isNaN(num)) onChange(num)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditing(false)
        }}
        className="w-14 rounded border border-blue-400 bg-white px-1 py-1 text-center text-sm font-medium focus:outline-none"
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={`w-14 rounded border px-1 py-1 text-center text-sm transition-colors ${
        value != null
          ? 'border-gray-200 bg-gray-50 font-bold text-gray-900 hover:border-blue-300 hover:bg-blue-50'
          : 'border-dashed border-gray-300 text-gray-400 hover:border-blue-300 hover:bg-blue-50'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      title={value != null ? 'Изменить инициативу' : 'Задать инициативу'}
    >
      {value != null ? value : '—'}
    </button>
  )
}
