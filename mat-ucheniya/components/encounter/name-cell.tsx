'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'

type Props = {
  value: string
  onCommit: (value: string) => void
  onInspect?: () => void
  disabled?: boolean
  className?: string
}

/**
 * Participant-name cell with two interactions:
 *   - single click  → onInspect (open right-side statblock panel)
 *   - double click  → enter edit mode (rename)
 *
 * Separated from EditableCell because everywhere else in the grid we
 * want single-click-to-edit; name is the only field where inspect takes
 * precedence and editing is the secondary action.
 */
export function NameCell({ value, onCommit, onInspect, disabled, className = '' }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const clickTimer = useRef<number | null>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  function startEdit() {
    if (disabled) return
    setDraft(value)
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== value) onCommit(trimmed)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    }
    if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  // Distinguish single vs double click with a short timer.
  function handleClick(e: React.MouseEvent) {
    if (editing || disabled) return
    // Double click fired if detail === 2
    if (e.detail === 2) {
      if (clickTimer.current != null) {
        window.clearTimeout(clickTimer.current)
        clickTimer.current = null
      }
      startEdit()
      return
    }
    // Defer single-click so a double-click gets a chance to pre-empt it.
    clickTimer.current = window.setTimeout(() => {
      clickTimer.current = null
      onInspect?.()
    }, 220)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded border border-blue-400 bg-white px-1.5 py-0.5 text-sm focus:outline-none"
      />
    )
  }

  return (
    <span
      onClick={handleClick}
      title={disabled ? value : 'Клик — показать статблок, двойной клик — переименовать'}
      className={`block truncate rounded px-1.5 py-0.5 text-sm transition-colors ${
        disabled ? 'cursor-default' : 'cursor-pointer hover:bg-blue-50/60'
      } ${className}`}
    >
      {value}
    </span>
  )
}
