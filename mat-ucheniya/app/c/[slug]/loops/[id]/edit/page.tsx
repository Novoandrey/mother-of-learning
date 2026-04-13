import { getCampaignBySlug } from '@/lib/campaign'
import { getLoopNodeTypeId } from '@/lib/loops'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import LoopForm from '@/components/loop-form'

export default async function EditLoopPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const [loopTypeId, supabase] = await Promise.all([
    getLoopNodeTypeId(campaign.id),
    createClient(),
  ])

  if (!loopTypeId) notFound()

  const { data: node } = await supabase
    .from('nodes')
    .select('id, title, fields, content')
    .eq('id', id)
    .eq('campaign_id', campaign.id)
    .eq('type_id', loopTypeId)
    .single()

  if (!node) notFound()

  const loop = {
    id: node.id,
    number: Number(node.fields?.number ?? 0),
    title: node.title,
    status: (node.fields?.status as string) ?? 'past',
    notes: node.content ?? null,
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Редактировать петлю {loop.number}</h1>
      <LoopForm
        campaignId={campaign.id}
        campaignSlug={slug}
        loopTypeId={loopTypeId}
        loop={loop}
      />
    </div>
  )
}
