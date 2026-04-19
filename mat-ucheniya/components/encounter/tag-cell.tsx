'use client'

import { useState, useRef, useEffect, useLayoutEffect, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export type TagEntry = { name: string; round: number }

type Props = {
  tags: TagEntry[]
  suggestions: string[]
  onChange: (tags: TagEntry[]) => void
  currentRound?: number
  placeholder?: string
  disabled?: boolean
}

export function TagCell({
  tags,
  suggestions,
  onChange,
  currentRound = 0,
  placeholder = '+',
  disabled = false,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; width: number } | null>(
    null,
  )
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const tagNames = tags.map((t) => t.name)
  // Empty query → show all available (not-yet-applied) suggestions.
  const available = suggestions.filter((s) => !tagNames.includes(s))
  const filtered = query
    ? available.filter((s) => s.toLowerCase().includes(query.toLowerCase()))
    : available

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  // Position the portal-rendered dropdown relative to the cell. Recomputed
  // on open, scroll, and resize so it stays pinned even when the user
  // scrolls the page or the grid's horizontal overflow container.
  useLayoutEffect(() => {
    if (!editing) {
      setDropdownPos(null)
      return
    }
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setDropdownPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 224) })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [editing])

  // Close on outside click (allow clicks inside the portal-rendered dropdown).
  useEffect(() => {
    if (!editing) return
    function handleClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (t.closest?.('[data-tag-dropdown]')) return
      if (containerRef.current && !containerRef.current.contains(t)) {
        setEditing(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editing])

  function addTag(name: string) {
    const trimmed = name.trim()
    if (trimmed && !tagNames.includes(trimmed)) {
      onChange([...tags, { name: trimmed, round: currentRound }])
    }
    setQuery('')
    inputRef.current?.focus()
  }

  function removeTag(name: string) {
    onChange(tags.filter((t) => t.name !== name))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered.length > 0 && highlightIdx < filtered.length) {
        addTag(filtered[highlightIdx])
      } else if (query.trim()) {
        addTag(query)
      }
    }
    if (e.key === 'Escape') {
      setEditing(false)
      setQuery('')
    }
    if (e.key === 'Backspace' && !query && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
    if (e.key === 'ArrowDown' && filtered.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp' && filtered.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Tab') {
      setEditing(false)
      setQuery('')
    }
  }

  function roundLabel(round: number): string {
    return round > 0 ? `с раунда ${round}` : 'до боя'
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Tags display + input trigger */}
      <div
        className={`flex min-h-[28px] flex-wrap items-center gap-1 rounded px-1 py-0.5 ${
          editing ? 'ring-1 ring-blue-400' : ''
        } ${disabled ? '' : 'cursor-text'}`}
        onClick={(e) => {
          // Prevent row-level selection toggle; this cell owns its click.
          e.stopPropagation()
          if (!disabled) setEditing(true)
        }}
      >
        {tags.map((tag) => (
          <span
            key={tag.name}
            className={`inline-flex items-center gap-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 ${
              disabled ? '' : 'hover:bg-red-100 hover:text-red-600 cursor-pointer'
            } transition-colors`}
            onClick={(e) => {
              e.stopPropagation()
              if (!disabled) removeTag(tag.name)
            }}
            title={`${tag.name} — ${roundLabel(tag.round)}${disabled ? '' : ' (клик — убрать)'}`}
          >
            {tag.name}
            {!disabled && <span className="text-[10px] opacity-50">×</span>}
          </span>
        ))}
        {editing && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="min-w-[60px] flex-1 border-none bg-transparent text-xs outline-none placeholder:text-gray-300"
          />
        )}
        {!editing && tags.length === 0 && !disabled && (
          <span className="text-xs text-gray-300">{placeholder}</span>
        )}
      </div>

      {/* Autocomplete dropdown — portaled to body to escape overflow
          containers (the table's overflow-x-auto clips any locally-
          positioned dropdown). */}
      {editing && filtered.length > 0 && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          data-tag-dropdown
          className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{
            position: 'fixed',
            left: dropdownPos.left,
            top: dropdownPos.top,
            width: dropdownPos.width,
            zIndex: 9999,
          }}
        >
          {filtered.slice(0, 30).map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
              className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                i === highlightIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {s}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
