import { NodeCard } from './node-card'
import Link from 'next/link'

type Node = {
  id: string
  title: string
  fields: Record<string, unknown>
  type: { slug: string; label: string; icon: string | null }
}

export function NodeList({ nodes, campaignSlug }: { nodes: Node[]; campaignSlug: string }) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 p-8 text-center">
        <p className="text-gray-500">Ничего не найдено</p>
        <Link
          href={`/c/${campaignSlug}/catalog/new`}
          className="mt-2 inline-block text-sm text-blue-600 hover:underline"
        >
          Создать новую сущность
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {nodes.map((node) => (
        <NodeCard
          key={node.id}
          id={node.id}
          title={node.title}
          description={node.fields?.description as string}
          player={node.fields?.player as string}
          typeLabel={node.type.label}
          typeIcon={node.type.icon ?? undefined}
          campaignSlug={campaignSlug}
        />
      ))}
    </div>
  )
}
