import { getCampaignBySlug } from '@/lib/campaign'
import { createClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { NavTabs } from '@/components/nav-tabs'
import { CampaignSidebarAside } from '@/components/campaign-sidebar-aside'
import { UserMenu } from '@/components/user-menu'
import { getMembership, requireAuth } from '@/lib/auth'

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

  // Auth: require a signed-in, onboarded user who is a member of this campaign.
  await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

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

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top bar: campaign name + create + user menu */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          <Link
            href={`/c/${slug}/catalog`}
            className="font-semibold text-base hover:text-blue-600 transition-colors"
          >
            {campaign.name}
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href={`/c/${slug}/catalog/new`}
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <span className="text-lg leading-none">+</span> Создать
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Tabs */}
      <NavTabs campaignSlug={slug} />

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar (hidden on encounter detail page) */}
        <CampaignSidebarAside
          nodeTypes={nodeTypes || []}
          nodes={nodes}
          campaignSlug={slug}
        />

        {/* Main */}
        <main className="flex-1 overflow-y-auto min-w-0 px-4 py-4">
          {children}
        </main>
      </div>
    </div>
  )
}
