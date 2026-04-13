import { getCampaignBySlug } from '@/lib/campaign'
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

  const supabase = await createClient()
  const { data: loop } = await supabase
    .from('loops')
    .select('*')
    .eq('id', id)
    .eq('campaign_id', campaign.id)
    .single()

  if (!loop) notFound()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Редактировать петлю {loop.number}</h1>
      <LoopForm campaignId={campaign.id} campaignSlug={slug} loop={loop} />
    </div>
  )
}
