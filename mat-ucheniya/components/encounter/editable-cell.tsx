'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'

type Props = {
  value: string | number | null
  onCommit: (value: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  disabled?: boolean
  className?: string
  displayClassName?: string
  inputClassName?: string
  selectOnFocus?: boolean
}

export function EditableCell({
  value,
  onCommit,
  type = 'text',
  placeholder = '—',
  disabled = false,
  className = '',
  displayClassName = '',
  inputClassName = '',
  selectOnFocus = true,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      if (selectOnFocus) {
        inputRef.current.select()
      }
    }
  }, [editing, selectOnFocus])

  function startEdit() {
    if (disabled) return
    setDraft(value != null ? String(value) : '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed !== (value != null ? String(value) : '')) {
      onCommit(trimmed)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab') {
      // Let Tab propagate for natural focus movement
      if (e.key === 'Enter') e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode={type === 'number' ? 'numeric' : 'text'}
        value={draft}
        onChange={(e) => setDraft(type === 'number' ? e.target.value.replace(/[^0-9.\-+]/g, '') : e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-sm focus:outline-none ${inputClassName} ${className}`}
      />
    )
  }

  const displayValue = value != null && value !== '' ? String(value) : null

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled}
      className={`w-full rounded px-1.5 py-0.5 text-left text-sm transition-colors ${
        disabled
          ? 'cursor-default text-gray-500'
          : 'cursor-text hover:bg-blue-50/50'
      } ${displayValue ? 'text-gray-900' : 'text-gray-300'} ${displayClassName} ${className}`}
      tabIndex={disabled ? -1 : 0}
    >
      {displayValue || placeholder}
    </button>
  )
}
