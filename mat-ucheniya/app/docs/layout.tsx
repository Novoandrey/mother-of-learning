import Link from 'next/link'
import { cookies } from 'next/headers'
import type { Metadata } from 'next'
import { getDocsTree } from '@/lib/docs'
import { DocsTreeNav } from '@/components/docs-tree-nav'
import { UserMenu } from '@/components/user-menu'
import { SiteBrand } from '@/components/site-brand'
import { APP_NAME } from '@/lib/branding'
import { NavTabs } from '@/components/nav-tabs'
import { getCampaignBySlug } from '@/lib/campaign'
import { getCurrentUserAndProfile, getMembership } from '@/lib/auth'
import { getPendingCount } from '@/lib/approval-queries'

export const metadata: Metadata = {
  title: 'Документация — Мать Учения',
  description: 'Документация проекта',
}

type CampaignContext = {
  slug: string
  name: string
  isDM: boolean
  pendingCount: number
}

/**
 * Resolve the user's "current campaign" for the docs chrome.
 *
 * The middleware (`proxy.ts`) sets the `current_campaign_slug` cookie
 * on every `/c/<slug>/*` request, so by the time anyone reaches /docs
 * we know which campaign they were last looking at. We then re-check
 * membership server-side — the cookie is a hint, not an authority.
 *
 * Returns null if:
 *   - no cookie set (anonymous visitor or never opened a campaign),
 *   - user not authenticated,
 *   - user not a member of that campaign anymore (cookie stale).
 */
async function resolveCampaignContext(): Promise<CampaignContext | null> {
  const cookieStore = await cookies()
  const slug = cookieStore.get('current_campaign_slug')?.value
  if (!slug) return null

  const auth = await getCurrentUserAndProfile()
  if (!auth?.user) return null

  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return null

  const membership = await getMembership(campaign.id)
  if (!membership) return null

  const isDM = membership.role === 'dm' || membership.role === 'owner'
  const pendingCount = isDM ? await getPendingCount(campaign.id) : 0

  return { slug: campaign.slug, name: campaign.name, isDM, pendingCount }
}

/**
 * Top-level /docs layout. Public — no auth required.
 *
 * When the visitor has a campaign context (cookie set by middleware
 * + still a member), the docs chrome mirrors the campaign chrome
 * exactly: same top bar (campaign name → catalog, "+ Создать",
 * UserMenu) and the same NavTabs strip with `Документация` active.
 * That way the docs feel like part of the app, not a separate site.
 *
 * When there's no context (anonymous or freshly-logged-in user
 * who never opened a campaign), we fall back to a minimal header
 * with just the title and a "К кампаниям" link.
 */
export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [docsTree, ctx] = await Promise.all([
    getDocsTree(),
    resolveCampaignContext(),
  ])
  const { rootIndex, topLevel } = docsTree

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {ctx ? (
        <>
          <header className="flex-shrink-0 border-b border-gray-200 bg-white">
            <div className="px-4 py-2 flex items-center justify-between gap-4">
              <div className="flex items-center gap-5 min-w-0">
                <SiteBrand />
                {ctx.name !== APP_NAME && (
                  <>
                    <span className="text-gray-300" aria-hidden>•</span>
                    <Link
                      href={`/c/${ctx.slug}/catalog`}
                      className="font-semibold text-base text-gray-900 hover:text-blue-600 transition-colors truncate"
                    >
                      {ctx.name}
                    </Link>
                  </>
                )}
              </div>
              <div className="flex items-center gap-4">
                <Link
                  href={`/c/${ctx.slug}/catalog/new`}
                  className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  <span className="text-lg leading-none">+</span> Создать
                </Link>
                <UserMenu />
              </div>
            </div>
          </header>
          <NavTabs
            campaignSlug={ctx.slug}
            accountingPendingCount={ctx.pendingCount}
            showAccountingBadge={ctx.isDM}
          />
        </>
      ) : (
        <header className="flex-shrink-0 border-b border-gray-200 bg-white">
          <div className="px-4 py-2 flex items-center justify-between gap-4">
            <Link href="/docs" className="hover:opacity-80 transition-opacity">
              <SiteBrand />
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm text-gray-600 hover:text-blue-600 transition-colors"
              >
                Войти
              </Link>
              <UserMenu />
            </div>
          </div>
        </header>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-80 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto py-3 px-2">
          <DocsTreeNav rootIndex={rootIndex} topLevel={topLevel} />
        </aside>

        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-3xl mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
