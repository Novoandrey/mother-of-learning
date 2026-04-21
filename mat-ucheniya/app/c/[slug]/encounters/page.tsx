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

  const { data: encounters, error } = await supabase
    .from('encounters')
    .select('id, title, status, current_round, updated_at')
    .eq('campaign_id', campaign.id)
    .order('updated_at', { ascending: false })

  if (error) console.error('encounters fetch error:', error)

  type EncounterRow = {
    id: string
    title: string
    status: string
    current_round: number
    updated_at: string
  }
  const encounterRows: EncounterRow[] = encounters ?? []

  const encounterIds = encounterRows.map((e) => e.id)
  const { data: participantRows } = encounterIds.length > 0
    ? await supabase
        .from('encounter_participants')
        .select('encounter_id')
        .in('encounter_id', encounterIds)
    : { data: [] }

  const countMap: Record<string, number> = {}
  for (const row of participantRows || []) {
    countMap[row.encounter_id] = (countMap[row.encounter_id] || 0) + 1
  }

  const items = encounterRows.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status as 'active' | 'completed',
    current_round: e.current_round,
    participant_count: countMap[e.id] || 0,
  }))

  return (
    <div className="mx-auto max-w-5xl">
      <EncounterListPage
        encounters={items}
        campaignId={campaign.id}
        campaignSlug={slug}
      />
    </div>
  )
}
