'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'

type CatalogNode = {
  id: string
  title: string
  fields: Record<string, unknown>
  type: { slug: string; label: string } | null
}

type Props = {
  catalogNodes: CatalogNode[]
  onAddFromCatalog: (nodeId: string, displayName: string, maxHp: number, quantity: number) => void
  onAddManual: (displayName: string, maxHp: number) => void
}

export function AddParticipantRow({ catalogNodes, onAddFromCatalog, onAddManual }: Props) {
  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [selectedNode, setSelectedNode] = useState<CatalogNode | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = query.length >= 1
    ? catalogNodes.filter((n) => n.title.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : []

  // Reset the highlight when the query changes. Done in a handler to avoid
  // a setState-in-effect cascade (react-hooks/set-state-in-effect).
  function updateQuery(q: string) {
    setQuery(q)
    setHighlightIdx(0)
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectNode(node: CatalogNode) {
    setSelectedNode(node)
    updateQuery(node.title)
    setShowSuggestions(false)
    setQuantity('1')
  }

  function submit() {
    const qty = Math.max(1, parseInt(quantity) || 1)
    if (selectedNode) {
      // SRD seed stores starting HP under "hp"; homebrew uses "max_hp". Accept both.
      const maxHp =
        Number(selectedNode.fields?.max_hp) ||
        Number(selectedNode.fields?.hp) ||
        0
      onAddFromCatalog(selectedNode.id, selectedNode.title, maxHp, qty)
    } else if (query.trim()) {
      onAddManual(query.trim(), 0)
    } else {
      return
    }
    updateQuery('')
    setSelectedNode(null)
    setQuantity('1')
    inputRef.current?.focus()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (showSuggestions && filtered.length > 0 && highlightIdx < filtered.length) {
        selectNode(filtered[highlightIdx])
      } else {
        submit()
      }
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
    if (e.key === 'ArrowDown' && filtered.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    }
    if (e.key === 'ArrowUp' && filtered.length > 0) {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    }
  }

  return (
    <div ref={containerRef} className="relative flex items-center gap-2 px-4 py-2.5">
      {/* Name input with autocomplete */}
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            updateQuery(e.target.value)
            setSelectedNode(null)
            setShowSuggestions(true)
          }}
          onFocus={() => { if (query.length >= 1) setShowSuggestions(true) }}
          onKeyDown={handleKeyDown}
          placeholder="Добавить участника..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />

        {showSuggestions && filtered.length > 0 && (
          <div className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            {filtered.map((node, i) => (
              <button
                key={node.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); selectNode(node) }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === highlightIdx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium">{node.title}</span>
                {node.type && (
                  <span className="text-xs text-gray-400">{node.type.label}</span>
                )}
                {Number(node.fields?.max_hp ?? node.fields?.hp) > 0 && (
                  <span className="ml-auto text-xs text-gray-400">
                    HP {String(node.fields?.max_hp ?? node.fields?.hp)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quantity */}
      {selectedNode && (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-400">×</span>
          <input
            type="text"
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            className="w-10 rounded border border-gray-200 px-1.5 py-1.5 text-center text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {/* Add button */}
      <button
        onClick={submit}
        disabled={!query.trim()}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
      >
        +
      </button>
    </div>
  )
}
