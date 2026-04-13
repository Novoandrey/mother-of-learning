'use client'

import { useState, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'

export type SidebarNode = {
  id: string
  title: string
  type_slug: string
}

export type SidebarNodeType = {
  id: string
  slug: string
  label: string
  icon: string | null
}

export type ContainsEdge = {
  source_id: string
  target_id: string
}

type TreeNode = SidebarNode & {
  children: TreeNode[]
}

type Props = {
  nodeTypes: SidebarNodeType[]
  nodes: SidebarNode[]
  containsEdges: ContainsEdge[]
  campaignSlug: string
}

function buildTree(
  nodes: SidebarNode[],
  containsEdges: ContainsEdge[]
): { roots: TreeNode[]; childIds: Set<string> } {
  const childIds = new Set(containsEdges.map((e) => e.target_id))
  const childrenOf: Record<string, TreeNode[]> = {}

  for (const e of containsEdges) {
    if (!childrenOf[e.source_id]) childrenOf[e.source_id] = []
    const child = nodes.find((n) => n.id === e.target_id)
    if (child) {
      childrenOf[e.source_id].push({ ...child, children: [] })
    }
  }

  // Recursively populate children
  function hydrate(node: TreeNode): TreeNode {
    return {
      ...node,
      children: (childrenOf[node.id] || []).map(hydrate),
    }
  }

  const roots = nodes
    .filter((n) => !childIds.has(n.id))
    .map((n) => hydrate({ ...n, children: [] }))

  return { roots, childIds }
}

function TreeNodeItem({
  node,
  campaignSlug,
  activePath,
  depth = 0,
}: {
  node: TreeNode
  campaignSlug: string
  activePath: string
  depth?: number
}) {
  const href = `/c/${campaignSlug}/catalog/${node.id}`
  const isActive = activePath === href
  const hasChildren = node.children.length > 0
  const [expanded, setExpanded] = useState(true)

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors ${
          isActive
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        {hasChildren ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 w-3 text-xs leading-none"
            tabIndex={-1}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}
        <Link href={href} className="flex-1 truncate leading-5 py-0.5">
          {node.title}
        </Link>
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              campaignSlug={campaignSlug}
              activePath={activePath}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function CatalogSidebar({
  nodeTypes,
  nodes,
  containsEdges,
  campaignSlug,
}: Props) {
  const pathname = usePathname()
  const [query, setQuery] = useState('')
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set())

  const toggleType = (slug: string) => {
    setCollapsedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(slug)) next.delete(slug)
      else next.add(slug)
      return next
    })
  }

  // Filter nodes by search query
  const filteredNodes = useMemo(() => {
    if (!query.trim()) return nodes
    const q = query.toLowerCase()
    return nodes.filter((n) => n.title.toLowerCase().includes(q))
  }, [nodes, query])

  // Build tree only when no search query
  const treeByType = useMemo(() => {
    const result: Record<string, TreeNode[]> = {}
    if (query.trim()) return result
    const { roots } = buildTree(nodes, containsEdges)
    for (const type of nodeTypes) {
      result[type.slug] = roots.filter((n) => n.type_slug === type.slug)
    }
    return result
  }, [nodes, containsEdges, nodeTypes, query])

  // Flat list by type for search results
  const flatByType = useMemo(() => {
    const result: Record<string, SidebarNode[]> = {}
    if (!query.trim()) return result
    for (const type of nodeTypes) {
      result[type.slug] = filteredNodes.filter((n) => n.type_slug === type.slug)
    }
    return result
  }, [filteredNodes, nodeTypes, query])

  const isSearching = !!query.trim()
  const byType = isSearching ? flatByType : treeByType

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pb-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск..."
          className="w-full rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-400 focus:outline-none"
        />
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto space-y-1 pb-4">
        {nodeTypes.map((type) => {
          const items = byType[type.slug] || []
          if (items.length === 0) return null
          const isCollapsed = collapsedTypes.has(type.slug)

          return (
            <div key={type.slug}>
              <button
                onClick={() => toggleType(type.slug)}
                className="flex w-full items-center gap-1.5 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors"
              >
                <span className="text-[10px] leading-none">
                  {isCollapsed ? '▸' : '▾'}
                </span>
                {type.icon && <span>{type.icon}</span>}
                <span>{type.label}</span>
                <span className="ml-auto font-normal normal-case tracking-normal text-gray-300">
                  {items.length}
                </span>
              </button>

              {!isCollapsed && (
                <div>
                  {isSearching
                    ? (items as SidebarNode[]).map((node) => {
                        const href = `/c/${campaignSlug}/catalog/${node.id}`
                        const isActive = pathname === href
                        return (
                          <Link
                            key={node.id}
                            href={href}
                            className={`block truncate rounded-md px-3 py-1 text-sm transition-colors ${
                              isActive
                                ? 'bg-blue-50 text-blue-700 font-medium'
                                : 'text-gray-700 hover:bg-gray-100'
                            }`}
                          >
                            {node.title}
                          </Link>
                        )
                      })
                    : (items as TreeNode[]).map((node) => (
                        <TreeNodeItem
                          key={node.id}
                          node={node}
                          campaignSlug={campaignSlug}
                          activePath={pathname}
                        />
                      ))}
                </div>
              )}
            </div>
          )
        })}

        {filteredNodes.length === 0 && query.trim() && (
          <p className="px-3 py-4 text-sm text-gray-400 text-center">
            Ничего не найдено
          </p>
        )}
      </div>
    </div>
  )
}
