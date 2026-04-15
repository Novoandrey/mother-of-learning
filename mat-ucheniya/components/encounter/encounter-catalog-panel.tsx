'use client'

import { useState, useMemo } from 'react'
import type { CatalogNode } from './encounter-grid'

type Props = {
  nodes: CatalogNode[]
  onAdd: (nodeId: string, displayName: string, maxHp: number, qty: number) => void
  disabled?: boolean
}

// Group label overrides
const TYPE_LABEL: Record<string, string> = {
  creature: 'Монстры',
  npc: 'НПС',
  character: 'Персонажи',
}

const TYPE_ORDER = ['creature', 'npc', 'character']

export function EncounterCatalogPanel({ nodes, onAdd, disabled = false }: Props) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    if (!search.trim()) return nodes
    const q = search.toLowerCase()
    return nodes.filter((n) => n.title.toLowerCase().includes(q))
  }, [nodes, search])

  // Group by type slug
  const groups = useMemo(() => {
    const map = new Map<string, CatalogNode[]>()
    for (const n of filtered) {
      const slug = n.type?.slug || 'other'
      if (!map.has(slug)) map.set(slug, [])
      map.get(slug)!.push(n)
    }
    // Sort groups by TYPE_ORDER
    const sorted = [...map.entries()].sort((a, b) => {
      const ia = TYPE_ORDER.indexOf(a[0])
      const ib = TYPE_ORDER.indexOf(b[0])
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    return sorted
  }, [filtered])

  function toggleGroup(slug: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function handleAdd(node: CatalogNode) {
    if (disabled) return
    const maxHp = typeof node.fields?.max_hp === 'number' ? node.fields.max_hp : 0
    onAdd(node.id, node.title, maxHp as number, 1)
  }

  return (
    <div className="border border-gray-200 bg-white h-fit w-[260px] flex-shrink-0">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Каталог
        </span>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-gray-100">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Groups */}
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        {groups.length === 0 && (
          <p className="p-3 text-center text-xs text-gray-300">Ничего не найдено</p>
        )}
        {groups.map(([slug, items]) => {
          const isCollapsed = collapsed.has(slug)
          const label = TYPE_LABEL[slug] || slug
          return (
            <div key={slug}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(slug)}
                className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:bg-gray-50"
              >
                <span className={`transition-transform text-[8px] ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                {label}
                <span className="ml-auto text-gray-300 font-normal">{items.length}</span>
              </button>

              {/* Items */}
              {!isCollapsed && (
                <div className="pb-1">
                  {items.map((node) => {
                    const maxHp = typeof node.fields?.max_hp === 'number' ? node.fields.max_hp : null
                    const statblock = node.fields?.statblock_url as string | undefined
                    return (
                      <div
                        key={node.id}
                        className={`group flex items-center gap-1.5 px-2 py-0.5 text-xs ${disabled ? 'opacity-50' : 'hover:bg-blue-50 cursor-pointer'}`}
                        onClick={() => handleAdd(node)}
                        title={`Добавить ${node.title} в энкаунтер`}
                      >
                        <span className="flex-1 truncate text-gray-700">{node.title}</span>
                        {maxHp != null && (
                          <span className="flex-shrink-0 text-[10px] text-gray-400 font-mono">{maxHp}hp</span>
                        )}
                        {statblock && (
                          <a
                            href={statblock}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex-shrink-0 text-[10px] text-blue-400 hover:text-blue-600"
                            title="Статблок"
                          >📋</a>
                        )}
                        {!disabled && (
                          <span className="flex-shrink-0 text-[10px] text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity">+</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
