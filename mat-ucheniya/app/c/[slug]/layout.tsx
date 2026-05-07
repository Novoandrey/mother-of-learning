import { getCampaignBySlug } from '@/lib/campaign'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { NavTabs } from '@/components/nav-tabs'
import { CampaignSidebarAside } from '@/components/campaign-sidebar-aside'
import { UserMenu } from '@/components/user-menu'
import { SiteBrand } from '@/components/site-brand'
import { getMembership, requireAuth } from '@/lib/auth'
import { getSidebarData } from '@/lib/sidebar-cache'
import { getPendingCount } from '@/lib/approval-queries'

export default async function CampaignLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  // Fan-out: campaign lookup and auth check are independent, so run them
  // in parallel. requireAuth throws redirect() on failure; Next handles
  // that correctly inside a Promise.all.
  const [campaign] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  // Second wave: membership depends on campaign.id, sidebar data is
  // independent. Run them together. getSidebarData is wrapped in
  // unstable_cache with tag 'sidebar:<campaignId>' and 60s revalidate,
  // so repeat navigations inside the same campaign are essentially free.
  const [membership, sidebar, pendingCount] = await Promise.all([
    getMembership(campaign.id),
    getSidebarData(campaign.id),
    getPendingCount(campaign.id),
  ])
  if (!membership) redirect('/')

  const isDM = membership.role === 'dm' || membership.role === 'owner'

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top bar: site brand + campaign name + create + user menu */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 min-w-0">
            <SiteBrand />
            <span className="text-gray-300" aria-hidden>•</span>
            <Link
              href={`/c/${slug}/catalog`}
              className="font-semibold text-base text-gray-900 hover:text-blue-600 transition-colors truncate"
            >
              {campaign.name}
            </Link>
          </div>
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
      <NavTabs
        campaignSlug={slug}
        accountingPendingCount={pendingCount}
        showAccountingBadge={isDM}
      />

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar (hidden on encounter detail page) */}
        <CampaignSidebarAside
          nodeTypes={sidebar.nodeTypes}
          nodes={sidebar.nodes}
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
