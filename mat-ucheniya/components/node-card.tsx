import Link from 'next/link'

type NodeCardProps = {
  id: string
  title: string
  description?: string
  player?: string
  typeLabel: string
  typeIcon?: string
  campaignSlug: string
}

export function NodeCard({ id, title, description, player, typeLabel, typeIcon, campaignSlug }: NodeCardProps) {
  return (
    <Link
      href={`/c/${campaignSlug}/catalog/${id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300"
    >
      <div className="mb-1 flex items-center gap-2">
        {typeIcon && <span className="text-sm">{typeIcon}</span>}
        <span className="text-xs font-medium text-gray-500">{typeLabel}</span>
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {player && <p className="mt-0.5 text-sm text-blue-600">{player}</p>}
      {description && (
        <p className="mt-1 text-sm text-gray-500 line-clamp-2">{description}</p>
      )}
    </Link>
  )
}
