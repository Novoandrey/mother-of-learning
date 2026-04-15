'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const tagNames = tags.map((t) => t.name)
  const filtered = query
    ? suggestions.filter(
        (s) => s.toLowerCase().includes(query.toLowerCase()) && !tagNames.includes(s)
      )
    : []

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editing])

  useEffect(() => {
    setHighlightIdx(0)
  }, [query])

  // Close on outside click
  useEffect(() => {
    if (!editing) return
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
        onClick={() => { if (!disabled) setEditing(true) }}
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
            title={disabled ? `${tag.name} (${roundLabel(tag.round)})` : `Удалить: ${tag.name} (${roundLabel(tag.round)})`}
          >
            {tag.name}
            {tag.round > 0 && (
              <span className="ml-0.5 text-[9px] font-mono text-gray-400">{tag.round}</span>
            )}
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

      {/* Autocomplete dropdown */}
      {editing && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-40 w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.slice(0, 8).map((s, i) => (
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
        </div>
      )}
    </div>
  )
}
