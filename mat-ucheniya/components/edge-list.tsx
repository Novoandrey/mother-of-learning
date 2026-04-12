import Link from 'next/link'

type Edge = {
  id: string
  type_label: string
  label: string | null
  direction: 'outgoing' | 'incoming'
  related_id: string
  related_title: string
}

export function EdgeList({ edges, campaignSlug }: { edges: Edge[]; campaignSlug: string }) {
  if (edges.length === 0) return null

  const outgoing = edges.filter((e) => e.direction === 'outgoing')
  const incoming = edges.filter((e) => e.direction === 'incoming')

  return (
    <div className="space-y-4">
      {outgoing.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-500">Исходящие связи</h3>
          <div className="space-y-1">
            {outgoing.map((e) => (
              <EdgeRow key={e.id} edge={e} arrow="→" campaignSlug={campaignSlug} />
            ))}
          </div>
        </div>
      )}
      {incoming.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-gray-500">Входящие связи</h3>
          <div className="space-y-1">
            {incoming.map((e) => (
              <EdgeRow key={e.id} edge={e} arrow="←" campaignSlug={campaignSlug} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function EdgeRow({ edge, arrow, campaignSlug }: { edge: Edge; arrow: string; campaignSlug: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-400">{arrow}</span>
      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{edge.type_label}</span>
      <Link
        href={`/c/${campaignSlug}/catalog/${edge.related_id}`}
        className="text-blue-600 hover:underline"
      >
        {edge.related_title}
      </Link>
      {edge.label && <span className="text-gray-400">({edge.label})</span>}
    </div>
  )
}
