import { getCampaignBySlug } from '@/lib/campaign'
import { createClient } from '@/lib/supabase/server'
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

  const supabase = await createClient()
  const { data: loops } = await supabase
    .from('loops')
    .select('number')
    .eq('campaign_id', campaign.id)
    .order('number', { ascending: false })
    .limit(1)

  const nextNumber = (loops?.[0]?.number ?? 0) + 1

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Новая петля</h1>
      <LoopForm campaignId={campaign.id} campaignSlug={slug} nextNumber={nextNumber} />
    </div>
  )
}
