'use client'

import { usePathname } from 'next/navigation'
import { CatalogSidebarWrapper } from './catalog-sidebar-wrapper'

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

// Paths where the global left sidebar should be hidden.
// Currently: encounter detail page only (UUID after /encounters/).
const UUID_RE = /\/c\/[^/]+\/encounters\/[0-9a-f-]{36}$/i

export function CampaignSidebarAside(props: Props) {
  const pathname = usePathname()
  if (UUID_RE.test(pathname)) return null

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
      <CatalogSidebarWrapper {...props} />
    </aside>
  )
}
