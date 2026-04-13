'use client'

import { useState, useMemo } from 'react'
import type { CatalogNode } from './combat-tracker'

type Props = {
  nodes: CatalogNode[]
  onAdd: (nodeId: string, displayName: string, maxHp: number, quantity: number) => void
}

// Show PC first, then NPC, then creatures, then everything else
const TYPE_ORDER: Record<string, number> = {
  character: 0,
  npc: 1,
  creature: 2,
}

export function CatalogPanel({ nodes, onAdd }: Props) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(true)

  // Group by type, filter by search
  const groups = useMemo(() => {
    const q = search.toLowerCase()
    const filtered = q
      ? nodes.filter((n) => n.title.toLowerCase().includes(q))
      : nodes

    const map = new Map<string, { label: string; slug: string; nodes: CatalogNode[] }>()
    for (const node of filtered) {
      const slug = node.type?.slug || 'other'
      const label = node.type?.label || 'Другое'
      if (!map.has(slug)) map.set(slug, { label, slug, nodes: [] })
      map.get(slug)!.nodes.push(node)
    }

    return [...map.values()].sort((a, b) => {
      const oa = TYPE_ORDER[a.slug] ?? 99
      const ob = TYPE_ORDER[b.slug] ?? 99
      return oa - ob
    })
  }, [nodes, search])

  function handleAdd(node: CatalogNode) {
    const hp = parseInt(String(node.fields?.max_hp ?? node.fields?.hp ?? '0'))
    onAdd(node.id, node.title, isNaN(hp) ? 0 : hp, 1)
  }

  return (
    <div className="border-t border-gray-100 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▸</span>
        Каталог
      </button>

      {expanded && (
        <div className="space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Найти в каталоге..."
            className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />

          {groups.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400">
              {search ? 'Ничего не найдено' : 'Каталог пуст'}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.slug}>
              <div className="mb-1 text-xs font-medium text-gray-400">
                {group.label} ({group.nodes.length})
              </div>
              <div className="space-y-0.5">
                {group.nodes.map((node) => {
                  const hp = parseInt(String(node.fields?.max_hp ?? node.fields?.hp ?? '0'))
                  const hasStatblock = !!node.fields?.statblock_url
                  return (
                    <button
                      key={node.id}
                      onClick={() => handleAdd(node)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-blue-50 transition-colors"
                    >
                      <span className="font-medium text-gray-700">{node.title}</span>
                      {hasStatblock && (
                        <span className="text-xs text-gray-300" title="Есть статблок">📋</span>
                      )}
                      {!isNaN(hp) && hp > 0 && (
                        <span className="text-xs text-gray-400">{hp} HP</span>
                      )}
                      <span className="ml-auto text-xs text-gray-300">+ добавить</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
