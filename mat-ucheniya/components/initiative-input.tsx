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
        className="w-14 rounded border border-blue-400 px-1 py-0.5 text-center text-sm focus:outline-none"
      />
    )
  }

  return (
    <button
      onClick={startEdit}
      disabled={disabled}
      className={`w-14 rounded px-1 py-0.5 text-center text-sm transition-colors ${
        value != null
          ? 'font-bold text-gray-900 hover:bg-gray-100'
          : 'italic text-gray-400 hover:bg-gray-100'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      title={value != null ? 'Изменить инициативу' : 'Задать инициативу'}
    >
      {value != null ? value : '—'}
    </button>
  )
}
