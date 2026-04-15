'use client'

import { useState, useMemo, type KeyboardEvent } from 'react'
import Link from 'next/link'

// ── Column config ──────────────────────────────────

export type SidebarColumn = {
  /** Key to read from node.fields (e.g. 'max_hp', 'statblock_url') */
  field: string
  /** Header label */
  label: string
  /** Width in px (rendered as min-width) */
  width?: number
  /** Render function. Defaults to plain text. */
  render?: (value: unknown, node: SidebarNode) => React.ReactNode
}

// ── Node type ──────────────────────────────────────

export type SidebarNode = {
  id: string
  title: string
  fields: Record<string, unknown>
  type: { slug: string; label: string } | null
}

// ── Props ──────────────────────────────────────────

export type UniversalSidebarProps = {
  /** All nodes to display */
  nodes: SidebarNode[]
  /** Which type slugs to show (omit = all) */
  visibleTypes?: string[]
  /** Custom group order and labels. Key = slug, value = label */
  groupLabels?: Record<string, string>
  /** Group ordering (slugs). Groups not listed go at the end */
  groupOrder?: string[]
  /** Columns to render after the name */
  columns?: SidebarColumn[]
  /** Title shown in the header */
  title?: string
  /** Called when a node row is clicked */
  onNodeClick?: (node: SidebarNode) => void
  /** Generate href for each node (makes it a link instead of clickable div) */
  getHref?: (node: SidebarNode) => string
  /** Currently active node ID (highlights the row) */
  activeNodeId?: string | null
  /** Extra action rendered on hover (e.g. "+" button) */
  renderAction?: (node: SidebarNode) => React.ReactNode
  /** Disabled state (grays out, no clicks) */
  disabled?: boolean
  /** Sidebar width. Default 280 */
  width?: number
  /** Called when Enter is pressed in search (e.g. for full-text redirect) */
  onSearchSubmit?: (query: string) => void
  /** Show header bar (default true) */
  showHeader?: boolean
  /** CSS class for outer container */
  className?: string
}

// ── Default renderers ──────────────────────────────

function defaultRender(value: unknown): React.ReactNode {
  if (value == null) return null
  if (typeof value === 'number') return <span className="font-mono">{value}</span>
  if (typeof value === 'string' && value.startsWith('http')) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-blue-400 hover:text-blue-600 truncate"
        title={value}
      >📋</a>
    )
  }
  return <span className="truncate">{String(value)}</span>
}

// ── Component ──────────────────────────────────────

export function UniversalSidebar({
  nodes,
  visibleTypes,
  groupLabels = {},
  groupOrder = [],
  columns = [],
  title = 'Каталог',
  onNodeClick,
  getHref,
  activeNodeId,
  renderAction,
  disabled = false,
  width = 280,
  onSearchSubmit,
  showHeader = true,
  className,
}: UniversalSidebarProps) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Filter by visible types + search
  const filtered = useMemo(() => {
    let list = nodes
    if (visibleTypes?.length) {
      list = list.filter((n) => n.type && visibleTypes.includes(n.type.slug))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((n) => n.title.toLowerCase().includes(q))
    }
    return list
  }, [nodes, visibleTypes, search])

  // Group by type slug
  const groups = useMemo(() => {
    const map = new Map<string, SidebarNode[]>()
    for (const n of filtered) {
      const slug = n.type?.slug || 'other'
      if (!map.has(slug)) map.set(slug, [])
      map.get(slug)!.push(n)
    }
    // Sort by groupOrder
    const sorted = [...map.entries()].sort((a, b) => {
      const ia = groupOrder.indexOf(a[0])
      const ib = groupOrder.indexOf(b[0])
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
    return sorted
  }, [filtered, groupOrder])

  function toggleGroup(slug: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && search.trim() && onSearchSubmit) {
      onSearchSubmit(search.trim())
      setSearch('')
    }
  }

  function renderRow(node: SidebarNode) {
    const isActive = activeNodeId === node.id
    const rowClass = `group flex items-center border-b border-gray-50 text-xs transition-colors ${
      isActive
        ? 'bg-blue-50 text-blue-700'
        : disabled
          ? 'opacity-50'
          : 'hover:bg-blue-50/50 cursor-pointer text-gray-700'
    }`

    const inner = (
      <>
        {/* Name cell */}
        <span className={`flex-1 truncate px-2 py-1 min-w-0 ${isActive ? 'font-medium' : ''}`}>
          {node.title}
        </span>

        {/* Data columns */}
        {columns.map((col) => {
          const value = node.fields[col.field]
          const rendered = col.render ? col.render(value, node) : defaultRender(value)
          return (
            <span
              key={col.field}
              className="flex-shrink-0 px-1.5 py-1 text-[10px] text-gray-400 text-right border-l border-gray-50"
              style={col.width ? { minWidth: col.width } : undefined}
            >
              {rendered}
            </span>
          )
        })}

        {/* Action (hover) */}
        {renderAction && !disabled && (
          <span className="flex-shrink-0 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {renderAction(node)}
          </span>
        )}
      </>
    )

    // If getHref is provided, render as Link
    if (getHref) {
      return (
        <Link key={node.id} href={getHref(node)} className={rowClass} title={node.title}>
          {inner}
        </Link>
      )
    }

    return (
      <div
        key={node.id}
        className={rowClass}
        onClick={() => !disabled && onNodeClick?.(node)}
        title={node.title}
      >
        {inner}
      </div>
    )
  }

  return (
    <div
      className={`bg-white flex flex-col ${className || 'border border-gray-200 h-fit flex-shrink-0'}`}
      style={className ? undefined : { width }}
    >
      {/* Header */}
      {showHeader && (
        <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 flex-shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </span>
        </div>
      )}

      {/* Search */}
      <div className="px-2 py-1.5 border-b border-gray-100 flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={onSearchSubmit ? 'Поиск… (Enter для полного)' : 'Поиск...'}
          className="w-full rounded border border-gray-200 px-2 py-1 text-xs placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Groups */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <p className="p-3 text-center text-xs text-gray-300">Ничего не найдено</p>
        )}
        {groups.map(([slug, items]) => {
          const isCollapsed = collapsed.has(slug)
          const label = groupLabels[slug] || items[0]?.type?.label || slug
          return (
            <div key={slug}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(slug)}
                className="flex w-full items-center gap-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 hover:bg-gray-50 border-b border-gray-50"
              >
                <span className={`transition-transform text-[8px] ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                {label}
                <span className="ml-auto text-gray-300 font-normal">{items.length}</span>
              </button>

              {/* Table rows */}
              {!isCollapsed && <div>{items.map(renderRow)}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
