export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { notFound, redirect } from 'next/navigation'
import { NodeList } from '@/components/node-list'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Каталог — ${campaign.name}` : 'Каталог' }
}

export default async function CatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ q?: string; type?: string }>
}) {
  const { slug } = await params
  const { q, type } = await searchParams

  // Spec-015 (T045): item nodes have a dedicated route under /items
  // with its own filter bar, group-by toggle, and grid. Redirect any
  // legacy ?type=item link there, preserving the search query.
  if (type === 'item') {
    const target = q
      ? `/c/${slug}/items?q=${encodeURIComponent(q)}`
      : `/c/${slug}/items`
    redirect(target)
  }

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  // Load node types for type filter
  const { data: nodeTypesRaw } = await supabase
    .from('node_types')
    .select('id, slug, label, icon')
    .eq('campaign_id', campaign.id)
    .order('sort_order')

  // Spec-013: drop encounter mirror type from the catalog filter
  // chips. Mirrors exist for autogen-source linkage but the encounter
  // itself is reached via /encounters, not the catalog.
  const nodeTypes = (nodeTypesRaw ?? []).filter(
    (t) => t.slug !== 'encounter',
  )

  // Build nodes query
  let nodesQuery = supabase
    .from('nodes')
    .select('id, title, fields, type:node_types(slug, label, icon)')
    .eq('campaign_id', campaign.id)
    .order('title')
    .limit(200)

  // Apply type filter (driven from sidebar clicks via ?type=)
  if (type && nodeTypes) {
    const matchedType = nodeTypes.find((t) => t.slug === type)
    if (matchedType) {
      nodesQuery = nodesQuery.eq('type_id', matchedType.id)
    }
  }

  // Apply text search
  if (q) {
    nodesQuery = nodesQuery.ilike('title', `%${q}%`)
  }

  const { data: nodes } = await nodesQuery
  const count = nodes?.length ?? 0

  // Normalize join shape: `type:node_types(...)` may come back as array.
  type RawNode = {
    id: string
    title: string
    fields: Record<string, unknown>
    type:
      | { slug: string; label: string; icon: string | null }
      | { slug: string; label: string; icon: string | null }[]
      | null
  }
  const normalizedNodes = (nodes as RawNode[] | null ?? []).flatMap((n) => {
    const t = Array.isArray(n.type) ? n.type[0] : n.type
    if (!t) return []
    // Spec-013: encounter mirror nodes exist for autogen-source linkage
    // but should never show in the catalog grid — the encounter is
    // navigated to via /encounters list.
    if (t.slug === 'encounter') return []
    return [{ id: n.id, title: n.title, fields: n.fields, type: t }]
  })

  const isSearching = !!q || !!type

  const heading = type
    ? (nodeTypes?.find((t) => t.slug === type)?.label ?? type)
    : q
    ? `Поиск: «${q}»`
    : null

  // Count nodes per type for the home view
  const typeCounts: Record<string, number> = {}
  if (!isSearching && nodeTypes) {
    const { data: allNodes } = await supabase
      .from('nodes')
      .select('type_id')
      .eq('campaign_id', campaign.id)
    if (allNodes) {
      for (const n of allNodes) {
        typeCounts[n.type_id] = (typeCounts[n.type_id] || 0) + 1
      }
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Hero search */}
      <div className={isSearching ? '' : 'pt-8 pb-4'}>
        <form action={`/c/${slug}/catalog`} method="get">
          <div className="relative mx-auto max-w-xl">
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              name="q"
              defaultValue={q || ''}
              placeholder="Найти персонажа, локацию, предмет..."
              className={`w-full rounded-xl border border-gray-200 bg-white pl-12 pr-4 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all ${
                isSearching ? 'py-2.5 text-sm' : 'py-3.5 text-base shadow-sm'
              }`}
              autoFocus={!isSearching}
            />
            {type && <input type="hidden" name="type" value={type} />}
          </div>
        </form>
      </div>

      {/* Results or type grid */}
      {isSearching ? (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-800">{heading}</h2>
            <span className="text-sm text-gray-400">{count}</span>
          </div>
          {count === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
              <p className="text-gray-400">Ничего не найдено</p>
            </div>
          ) : (
            <NodeList nodes={normalizedNodes} campaignSlug={slug} />
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(nodeTypes || []).map((t) => {
            const cnt = typeCounts[t.id] || 0
            if (cnt === 0) return null
            return (
              <a
                key={t.slug}
                href={`/c/${slug}/catalog?type=${t.slug}`}
                className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <span className="text-xl">{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900">{t.label}</span>
                </div>
                <span className="text-sm text-gray-400">{cnt}</span>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
