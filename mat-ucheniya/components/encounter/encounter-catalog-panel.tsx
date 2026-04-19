'use client'

import { useCallback } from 'react'
import { UniversalSidebar, type SidebarNode } from '@/components/universal-sidebar'
import type { CatalogNode } from './encounter-grid'

type Props = {
  nodes: CatalogNode[]
  onAdd: (nodeId: string, displayName: string, maxHp: number, qty: number) => void
  disabled?: boolean
}

const GROUP_LABELS: Record<string, string> = {
  creature: 'Монстры',
  npc: 'НПС',
  character: 'Персонажи',
}
const GROUP_ORDER = ['creature', 'npc', 'character']

const COLUMNS = [
  {
    field: 'max_hp',
    label: 'HP',
    width: 40,
    // SRD seed stores starting HP under `hp`; homebrew under `max_hp`.
    render: (_v: unknown, node: SidebarNode) => {
      const hp = node.fields?.max_hp ?? node.fields?.hp
      const n = typeof hp === 'number' ? hp : Number(hp)
      return Number.isFinite(n) && n > 0 ? n : ''
    },
  },
  { field: 'statblock_url', label: '📋', width: 28 },
]

export function EncounterCatalogPanel({ nodes, onAdd, disabled = false }: Props) {
  const handleClick = useCallback((node: SidebarNode) => {
    // SRD seed uses "hp"; homebrew uses "max_hp". Accept both.
    const rawHp = node.fields?.max_hp ?? node.fields?.hp
    const maxHp = typeof rawHp === 'number' ? rawHp : Number(rawHp) || 0
    onAdd(node.id, node.title, maxHp, 1)
  }, [onAdd])

  const renderAction = useCallback(() => (
    <span className="text-[10px] text-blue-400">+</span>
  ), [])

  return (
    <UniversalSidebar
      nodes={nodes as SidebarNode[]}
      visibleTypes={['creature', 'npc', 'character']}
      groupLabels={GROUP_LABELS}
      groupOrder={GROUP_ORDER}
      columns={COLUMNS}
      title="Каталог"
      onNodeClick={handleClick}
      renderAction={renderAction}
      disabled={disabled}
      width={260}
    />
  )
}
