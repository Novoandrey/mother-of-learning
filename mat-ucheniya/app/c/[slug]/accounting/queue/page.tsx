export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getStashNode } from '@/lib/stash'
import {
  getPendingBatches,
  getPendingCount,
} from '@/lib/approval-queries'
import AccountingSubNav from '@/components/accounting-sub-nav'
import QueueList from '@/components/queue-list'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign ? `Очередь — ${campaign.name}` : 'Не найдено',
  }
}

export default async function QueuePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const [campaign, { user }] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const isDM = membership.role === 'dm' || membership.role === 'owner'

  const [batches, pendingCount, stashNode] = await Promise.all([
    getPendingBatches(campaign.id, membership.role, user.id),
    getPendingCount(campaign.id),
    getStashNode(campaign.id),
  ])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Очередь</h1>
          <p className="text-sm text-gray-500">
            {isDM
              ? 'Заявки игроков на одобрение. Pending не учитываются в балансах.'
              : 'Ваши заявки в очереди. После одобрения мастером они попадут в ленту.'}
          </p>
        </div>

        <AccountingSubNav
          campaignSlug={slug}
          isDM={isDM}
          hasStash={!!stashNode}
          pendingCount={pendingCount}
        />
      </div>

      <QueueList
        batches={batches}
        campaignSlug={slug}
        isDM={isDM}
        currentUserId={user.id}
      />
    </div>
  )
}
