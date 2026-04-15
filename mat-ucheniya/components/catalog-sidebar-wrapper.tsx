'use client'

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { UniversalSidebar, type SidebarNode } from './universal-sidebar'

type NodeType = {
  id: string
  slug: string
  label: string
  icon: string | null
}

type InputNode = {
  id: string
  title: string
  type_slug: string
}

type Props = {
  nodeTypes: NodeType[]
  nodes: InputNode[]
  campaignSlug: string
}

export function CatalogSidebarWrapper({ nodeTypes, nodes, campaignSlug }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  // Convert flat nodes to SidebarNode format
  const sidebarNodes: SidebarNode[] = nodes.map((n) => {
    const t = nodeTypes.find((t) => t.slug === n.type_slug)
    return {
      id: n.id,
      title: n.title,
      fields: {},
      type: t ? { slug: t.slug, label: t.label } : null,
    }
  })

  // Group labels from nodeTypes
  const groupLabels: Record<string, string> = {}
  const groupOrder: string[] = []
  for (const t of nodeTypes) {
    groupLabels[t.slug] = `${t.icon || ''} ${t.label}`.trim()
    groupOrder.push(t.slug)
  }

  // Active node ID from pathname
  const activeNodeId = pathname.match(/\/catalog\/([a-f0-9-]+)/)?.[1] || null

  const getHref = useCallback((node: SidebarNode) => {
    return `/c/${campaignSlug}/catalog/${node.id}`
  }, [campaignSlug])

  const onSearchSubmit = useCallback((query: string) => {
    router.push(`/c/${campaignSlug}/catalog?q=${encodeURIComponent(query)}`)
  }, [campaignSlug, router])

  return (
    <UniversalSidebar
      nodes={sidebarNodes}
      groupLabels={groupLabels}
      groupOrder={groupOrder}
      getHref={getHref}
      activeNodeId={activeNodeId}
      onSearchSubmit={onSearchSubmit}
      showHeader={false}
      className="h-full"
    />
  )
}
