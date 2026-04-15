import { getCampaignBySlug } from '@/lib/campaign'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { NavTabs } from '@/components/nav-tabs'
import { CatalogSidebar } from '@/components/catalog-sidebar'

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  const { data: nodeTypes } = await supabase
    .from('node_types')
    .select('id, slug, label, icon')
    .eq('campaign_id', campaign.id)
    .order('sort_order')

  const { data: nodeRows } = await supabase
    .from('nodes')
    .select('id, title, type:node_types(slug)')
    .eq('campaign_id', campaign.id)
    .order('title')
    .limit(500)

  const nodes = (nodeRows || []).map((n: any) => ({
    id: n.id,
    title: n.title,
    type_slug: n.type?.slug ?? '',
  }))

  const { data: containsEdgeRows } = await supabase
    .from('edges')
    .select('source_id, target_id, edge_type:edge_types(slug)')
    .eq('campaign_id', campaign.id)

  const containsEdges = (containsEdgeRows || [])
    .filter((e: any) => e.edge_type?.slug === 'contains')
    .map((e: any) => ({ source_id: e.source_id, target_id: e.target_id }))

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top bar: campaign name + create */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="px-4 py-2 flex items-center justify-between">
          <Link
            href={`/c/${slug}/catalog`}
            className="font-semibold text-base hover:text-blue-600 transition-colors"
          >
            {campaign.name}
          </Link>
          <Link
            href={`/c/${slug}/catalog/new`}
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <span className="text-lg leading-none">+</span> Создать
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <NavTabs campaignSlug={slug} />

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="w-56 flex-shrink-0 flex flex-col border-r border-gray-200 bg-white overflow-hidden">
          <CatalogSidebar
            nodeTypes={nodeTypes || []}
            nodes={nodes}
            containsEdges={containsEdges}
            campaignSlug={slug}
          />
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-y-auto min-w-0 px-4 py-4">
          {children}
        </main>
      </div>
    </div>
  )
}
