export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import LedgerList from '@/components/ledger-list'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign ? `Бухгалтерия — ${campaign.name}` : 'Не найдено',
  }
}

export default async function AccountingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const resolvedSearch = await searchParams

  const [campaign] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Бухгалтерия</h1>
          <p className="text-sm text-gray-500">
            Транзакции кампании: монеты, предметы, переводы.
          </p>
        </div>
        <Link
          href={`/c/${slug}/accounting/settings/categories`}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Категории
        </Link>
      </div>

      <LedgerList
        campaignId={campaign.id}
        campaignSlug={slug}
        searchParams={resolvedSearch}
      />
    </div>
  )
}
