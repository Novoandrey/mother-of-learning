export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
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
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  // Load node types for type filter (still needed for slug→id resolution)
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

  const heading = type
    ? (nodeTypes?.find((t) => t.slug === type)?.label ?? type)
    : q
    ? `Поиск: «${q}»`
    : 'Все сущности'

  return (
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
        <NodeList nodes={(nodes as any[]) || []} campaignSlug={slug} />
      )}
    </div>
  )
}
