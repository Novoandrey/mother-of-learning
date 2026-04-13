export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import { EncounterListPage } from '@/components/encounter-list-page'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Энкаунтеры — ${campaign.name}` : 'Энкаунтеры' }
}

export default async function EncountersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  const { data: encounters } = await supabase
    .from('encounters')
    .select('id, title, status, current_round, updated_at, encounter_participants(id)')
    .eq('campaign_id', campaign.id)
    .order('updated_at', { ascending: false })

  const items = (encounters || []).map((e: any) => ({
    id: e.id,
    title: e.title,
    status: e.status as 'active' | 'completed',
    current_round: e.current_round,
    participant_count: e.encounter_participants?.length || 0,
  }))

  return (
    <EncounterListPage
      encounters={items}
      campaignId={campaign.id}
      campaignSlug={slug}
    />
  )
}
