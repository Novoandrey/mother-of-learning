import { getCampaignBySlug } from '@/lib/campaign'
import { getLoops, getLoopNodeTypeId } from '@/lib/loops'
import { notFound } from 'next/navigation'
import LoopForm from '@/components/loop-form'

export default async function NewLoopPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const [loops, loopTypeId] = await Promise.all([
    getLoops(campaign.id),
    getLoopNodeTypeId(campaign.id),
  ])

  if (!loopTypeId) notFound()

  const nextNumber = loops.length > 0
    ? Math.max(...loops.map((l) => l.number)) + 1
    : 1

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Новая петля</h1>
      <LoopForm
        campaignId={campaign.id}
        campaignSlug={slug}
        loopTypeId={loopTypeId}
        nextNumber={nextNumber}
      />
    </div>
  )
}
