'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type NodeType = { id: string; slug: string; label: string; icon: string | null }

export function TypeFilter({ types, active }: { types: NodeType[]; active?: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setType(slug?: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (slug) params.set('type', slug)
    else params.delete('type')
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => setType()}
        className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
          !active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Все
      </button>
      {types.map((t) => (
        <button
          key={t.slug}
          onClick={() => setType(t.slug)}
          className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            active === t.slug ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {t.icon && <span className="mr-1">{t.icon}</span>}
          {t.label}
        </button>
      ))}
    </div>
  )
}
