export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import { SearchInput } from '@/components/search-input'
import { TypeFilter } from '@/components/type-filter'
import { NodeList } from '@/components/node-list'
import { Suspense } from 'react'
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
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  // Load node types for filter
  const { data: nodeTypes } = await supabase
    .from('node_types')
    .select('id, slug, label, icon')
    .eq('campaign_id', campaign.id)
    .order('sort_order')

  // Build nodes query
  let nodesQuery = supabase
    .from('nodes')
    .select('id, title, fields, type:node_types(slug, label, icon)')
    .eq('campaign_id', campaign.id)
    .order('title')
    .limit(100)

  // Apply type filter
  if (type && nodeTypes) {
    const matchedType = nodeTypes.find((t) => t.slug === type)
    if (matchedType) {
      nodesQuery = nodesQuery.eq('type_id', matchedType.id)
    }
  }

  // Apply text search (ilike for partial matching)
  if (q) {
    nodesQuery = nodesQuery.ilike('title', `%${q}%`)
  }

  const { data: nodes } = await nodesQuery

  return (
    <div className="space-y-4">
      <Suspense>
        <SearchInput />
      </Suspense>
      <Suspense>
        <TypeFilter types={nodeTypes || []} active={type} />
      </Suspense>
      <p className="text-sm text-gray-400">{nodes?.length ?? 0} сущностей</p>
      <NodeList nodes={(nodes as any[]) || []} campaignSlug={slug} />
    </div>
  )
}
