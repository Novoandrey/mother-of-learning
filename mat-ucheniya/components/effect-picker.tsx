'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

type EffectNode = {
  id: string
  title: string
  fields: Record<string, unknown>
}

type Props = {
  value: string[] // array of effect titles
  campaignId: string
  onChange: (effects: string[]) => void
  disabled?: boolean
}

export function EffectPicker({ value, onChange, campaignId, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EffectNode[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  // Search effects in catalog
  const search = useCallback(async (q: string) => {
    if (q.length < 1) { setResults([]); return }
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('nodes')
      .select('id, title, fields, type:node_types!inner(slug)')
      .eq('campaign_id', campaignId)
      .eq('node_types.slug', 'effect')
      .ilike('title', `%${q}%`)
      .limit(8)
    setResults((data as any[]) || [])
    setLoading(false)
  }, [campaignId])

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 200)
    return () => clearTimeout(timeout)
  }, [query, search])

  function toggle(title: string) {
    if (value.includes(title)) {
      onChange(value.filter((t) => t !== title))
    } else {
      onChange([...value, title])
      setQuery('')
      setResults([])
    }
  }

  async function createAndAdd(title: string) {
    const trimmed = title.trim()
    if (!trimmed) return

    // Create new effect node in catalog
    const supabase = createClient()
    const { data: nodeType } = await supabase
      .from('node_types')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('slug', 'effect')
      .single()

    if (nodeType) {
      await supabase.from('nodes').insert({
        campaign_id: campaignId,
        type_id: nodeType.id,
        title: trimmed,
        fields: { description: '' },
      })
    }

    // Add to participant
    if (!value.includes(trimmed)) {
      onChange([...value, trimmed])
    }
    setQuery('')
    setResults([])
  }

  const exactMatch = results.some((r) => r.title.toLowerCase() === query.trim().toLowerCase())
  const showCreate = query.trim().length > 0 && !exactMatch && !value.includes(query.trim())

  return (
    <div ref={ref} className="relative flex flex-wrap items-center gap-1">
      {/* Active effect tags */}
      {value.map((title) => (
        <button
          key={title}
          onClick={() => !disabled && toggle(title)}
          disabled={disabled}
          className={`inline-flex items-center rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 ${
            disabled ? 'opacity-60' : 'hover:bg-violet-200'
          } transition-colors`}
        >
          {title}
          {!disabled && <span className="ml-1 text-violet-400">×</span>}
        </button>
      ))}

      {/* Add button */}
      {!disabled && (
        <button
          onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 50) }}
          className="inline-flex h-5 w-5 items-center justify-center rounded text-xs text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Добавить эффект"
        >
          +
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="p-1.5">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showCreate) {
                  createAndAdd(query)
                } else if (e.key === 'Enter' && results.length > 0 && !showCreate) {
                  toggle(results[0].title)
                } else if (e.key === 'Escape') {
                  setOpen(false)
                  setQuery('')
                }
              }}
              placeholder="Поиск или создать..."
              className="w-full rounded border border-gray-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none"
            />
          </div>

          <div className="max-h-40 overflow-y-auto">
            {results.filter((r) => !value.includes(r.title)).map((effect) => (
              <button
                key={effect.id}
                onClick={() => toggle(effect.title)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-gray-50"
              >
                <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-violet-400" />
                <span className="flex-1">{effect.title}</span>
                {effect.fields?.description ? (
                  <span className="max-w-[100px] truncate text-[10px] text-gray-400">
                    {String(effect.fields.description).slice(0, 40)}
                  </span>
                ) : null}
              </button>
            ))}

            {showCreate && (
              <button
                onClick={() => createAndAdd(query)}
                className="flex w-full items-center gap-2 border-t border-gray-100 px-2.5 py-2 text-left text-xs text-violet-600 hover:bg-violet-50"
              >
                <span>+</span>
                <span>Создать «{query.trim()}»</span>
              </button>
            )}

            {loading && <p className="px-2.5 py-2 text-[10px] text-gray-400">Поиск...</p>}
            {!loading && query.length > 0 && results.length === 0 && !showCreate && (
              <p className="px-2.5 py-2 text-[10px] text-gray-400">Все добавлены</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
