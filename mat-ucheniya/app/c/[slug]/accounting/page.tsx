export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCurrentLoop } from '@/lib/loops'
import { listCategories } from '@/lib/categories'
import { computeDefaultDayForTx } from '@/lib/transactions'
import {
  getPendingCount,
  getRecentDMActionSummary,
  markDMActionsSeen,
} from '@/lib/approval-queries'
import { getCampaignPCs } from '@/app/actions/characters'
import { getStashNode } from '@/lib/stash'
import { createAdminClient } from '@/lib/supabase/admin'
import LedgerList from '@/components/ledger-list'
import LedgerActorBar from '@/components/ledger-actor-bar'
import AccountingSubNav from '@/components/accounting-sub-nav'
import DMActionToast from '@/components/dm-action-toast'

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
  // Also prefetch categories + current loop + stash node so the form
  // sheet doesn't re-query them on open.
  const [allPcs, categories, currentLoop, stashNode, pendingCount] = await Promise.all([
    getCampaignPCs(campaign.id),
    listCategories(campaign.id, 'transaction'),
    getCurrentLoop(campaign.id),
    getStashNode(campaign.id),
    getPendingCount(campaign.id),
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

  // Spec-014 FR-027 — player only: surface "DM acted on your batches"
  // since last visit. Fired once per cutoff (we mark-as-seen below);
  // hidden for DM (no self-toast).
  let dmActionSummary: { approved: number; rejected: number } | null = null
  if (membership.role === 'player') {
    const summary = await getRecentDMActionSummary(user.id, campaign.id)
    if (summary) {
      dmActionSummary = { approved: summary.approved, rejected: summary.rejected }
      // Idempotent — safe to call even if the player refreshes; the
      // next call returns null because cutoff has advanced.
      await markDMActionsSeen(user.id, campaign.id, summary.cutoff)
    }
  }

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
      {dmActionSummary && (
        <DMActionToast
          approved={dmActionSummary.approved}
          rejected={dmActionSummary.rejected}
          campaignSlug={slug}
        />
      )}
      <div className="mb-4 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Бухгалтерия</h1>
          <p className="text-sm text-gray-500">
            Транзакции кампании: монеты, предметы, переводы.
          </p>
        </div>

        <AccountingSubNav
          campaignSlug={slug}
          isDM={membership.role === 'dm' || membership.role === 'owner'}
          hasStash={!!stashNode}
          pendingCount={pendingCount}
        />

        {availablePcs.length > 0 && (
          <LedgerActorBar
            campaignId={campaign.id}
            availablePcs={availablePcs}
            stashNode={stashNode}
            categories={categories}
            defaultLoopNumber={defaultLoopNumber}
            defaultDayByPcId={defaultDayByPcId}
            currentLoopNumber={currentLoop?.number ?? null}
          />
        )}
      </div>

      <LedgerList
        campaignId={campaign.id}
        campaignSlug={slug}
        searchParams={resolvedSearch}
        currentLoopNumber={currentLoop?.number ?? null}
      />
    </div>
  )
}
