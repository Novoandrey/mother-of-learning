'use client'

import { useState, useRef, useEffect, useLayoutEffect, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { PillEditor } from './pill-editor'

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
  // Pill editor state: which pill is open + the DOM element anchoring the popover.
  const [openPill, setOpenPill] = useState<{ name: string; el: HTMLElement } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const tagNames = tags.map((t) => t.name)
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

  useEffect(() => {
    if (!editing) return
    function handleClick(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (t.closest?.('[data-tag-dropdown]')) return
      if (t.closest?.('[data-pill-editor]')) return
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

  const openPillTag = openPill ? tags.find((t) => t.name === openPill.name) : null

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Tags display + input trigger */}
      <div
        className={`flex min-h-[24px] flex-wrap items-center gap-1 rounded-[var(--radius)] px-1 py-[2px] transition-shadow ${
          disabled ? '' : 'cursor-text'
        }`}
        style={{
          boxShadow: editing ? `0 0 0 1px var(--blue-500), var(--shadow-focus)` : 'none',
        }}
        onClick={(e) => {
          e.stopPropagation()
          // Only enter edit mode if the click was on the cell itself, not a pill.
          const t = e.target as HTMLElement
          if (t.closest?.('[data-pill-anchor]')) return
          if (!disabled) setEditing(true)
        }}
      >
        {tags.map((tag) => {
          const isOpen = openPill?.name === tag.name
          return (
            <span
              key={tag.name}
              data-pill-anchor
              className="inline-flex items-center rounded-full px-2 py-[1px] text-[11px] font-medium transition-colors"
              style={{
                background: isOpen ? 'var(--blue-50)' : 'var(--gray-100)',
                color: isOpen ? 'var(--blue-700)' : 'var(--gray-700)',
                cursor: disabled ? 'default' : 'pointer',
                boxShadow: isOpen ? '0 0 0 1px var(--blue-400)' : 'none',
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isOpen) {
                  e.currentTarget.style.background = 'var(--gray-200)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isOpen) {
                  e.currentTarget.style.background = 'var(--gray-100)'
                }
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (disabled) return
                // Toggle: clicking the open pill again closes the editor.
                if (openPill?.name === tag.name) {
                  setOpenPill(null)
                  return
                }
                setOpenPill({ name: tag.name, el: e.currentTarget })
                // Close any inline edit state so dropdown and popover don't overlap.
                if (editing) {
                  setEditing(false)
                  setQuery('')
                }
              }}
              title={tag.name}
            >
              {tag.name}
            </span>
          )
        })}
        {editing && (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tags.length === 0 ? placeholder : ''}
            className="min-w-[48px] flex-1 border-none bg-transparent text-[11px] outline-none"
            style={{ color: 'var(--fg-1)' }}
          />
        )}
        {!editing && tags.length === 0 && !disabled && (
          <span className="text-[11px]" style={{ color: 'var(--gray-300)' }}>
            {placeholder}
          </span>
        )}
      </div>

      {/* Autocomplete dropdown (portaled). */}
      {editing && filtered.length > 0 && dropdownPos && typeof document !== 'undefined' && createPortal(
        <div
          data-tag-dropdown
          className="max-h-56 overflow-y-auto rounded-[var(--radius-md)] border bg-white"
          style={{
            position: 'fixed',
            left: dropdownPos.left,
            top: dropdownPos.top,
            width: dropdownPos.width,
            zIndex: 9999,
            borderColor: 'var(--gray-200)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {filtered.slice(0, 30).map((s, i) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(s) }}
              className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors"
              style={{
                background: i === highlightIdx ? 'var(--blue-50)' : 'transparent',
                color: i === highlightIdx ? 'var(--blue-700)' : 'var(--gray-700)',
              }}
              onMouseEnter={(e) => {
                if (i !== highlightIdx) e.currentTarget.style.background = 'var(--gray-50)'
              }}
              onMouseLeave={(e) => {
                if (i !== highlightIdx) e.currentTarget.style.background = 'transparent'
              }}
            >
              {s}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {/* Pill editor popover */}
      {openPill && openPillTag && !disabled && (
        <PillEditor
          anchorEl={openPill.el}
          tagName={openPillTag.name}
          round={openPillTag.round}
          actions={[
            {
              label: 'Убрать',
              tone: 'danger',
              onClick: () => removeTag(openPillTag.name),
            },
          ]}
          onClose={() => setOpenPill(null)}
        />
      )}
    </div>
  )
}
