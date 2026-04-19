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
        className={`w-full rounded-[var(--radius)] border bg-white px-1.5 py-[3px] text-[13px] focus:outline-none ${inputClassName} ${className}`}
        style={{ borderColor: 'var(--blue-500)', boxShadow: 'var(--shadow-focus)' }}
      />
    )
  }

  const displayValue = value != null && value !== '' ? String(value) : null

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={disabled}
      className={`w-full rounded-[var(--radius)] px-1.5 py-[3px] text-left text-[13px] transition-colors ${
        disabled ? 'cursor-default' : 'cursor-text hover:bg-[var(--blue-50)]'
      } ${displayClassName} ${className}`}
      style={{
        color: disabled
          ? 'var(--fg-3)'
          : displayValue
            ? 'var(--fg-1)'
            : 'var(--gray-300)',
      }}
      tabIndex={disabled ? -1 : 0}
    >
      {displayValue || placeholder}
    </button>
  )
}
