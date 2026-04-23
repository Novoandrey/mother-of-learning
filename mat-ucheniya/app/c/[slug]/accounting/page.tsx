export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCurrentLoop } from '@/lib/loops'
import { listCategories } from '@/lib/categories'
import { computeDefaultDayForTx } from '@/lib/transactions'
import { getCampaignPCs } from '@/app/actions/characters'
import { createAdminClient } from '@/lib/supabase/admin'
import LedgerList from '@/components/ledger-list'
import LedgerActorBar from '@/components/ledger-actor-bar'

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

  const [campaign, { user }] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  // Prep for the create-transaction CTA:
  //   • DM/owner — any PC.
  //   • Player — only PCs they own (node_pc_owners).
  // Also prefetch categories + current loop so the form sheet doesn't
  // re-query them on open.
  const [allPcs, categories, currentLoop] = await Promise.all([
    getCampaignPCs(campaign.id),
    listCategories(campaign.id, 'transaction'),
    getCurrentLoop(campaign.id),
  ])

  let availablePcs = allPcs
  if (membership.role === 'player') {
    const admin = createAdminClient()
    const { data: owned } = await admin
      .from('node_pc_owners')
      .select('node_id')
      .eq('user_id', user.id)
    const ownedSet = new Set(
      (owned ?? []).map((r) => (r as { node_id: string }).node_id),
    )
    availablePcs = allPcs.filter((pc) => ownedSet.has(pc.id))
  }

  const defaultLoopNumber = currentLoop?.number ?? 1

  // Prefetch default day per available PC so `LedgerActorBar` has a
  // sensible pre-fill the moment the user picks an actor. Without this
  // every switch of the actor dropdown would have to round-trip to the
  // server. Parallelised because each call is an independent read.
  const defaultDayByPcId: Record<string, number> = {}
  if (currentLoop && availablePcs.length > 0) {
    const entries = await Promise.all(
      availablePcs.map(async (pc) => {
        const day = await computeDefaultDayForTx(
          pc.id,
          currentLoop.number,
          currentLoop.id,
        )
        return [pc.id, day] as const
      }),
    )
    for (const [id, day] of entries) defaultDayByPcId[id] = day
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Бухгалтерия</h1>
            <p className="text-sm text-gray-500">
              Транзакции кампании: монеты, предметы, переводы.
            </p>
          </div>
          <Link
            href={`/c/${slug}/accounting/settings/categories`}
            className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Категории
          </Link>
        </div>

        {availablePcs.length > 0 && (
          <LedgerActorBar
            campaignId={campaign.id}
            availablePcs={availablePcs}
            categories={categories}
            defaultLoopNumber={defaultLoopNumber}
            defaultDayByPcId={defaultDayByPcId}
          />
        )}
      </div>

      <LedgerList
        campaignId={campaign.id}
        campaignSlug={slug}
        searchParams={resolvedSearch}
      />
    </div>
  )
}
