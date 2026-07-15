export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getCampaignMapData } from '@/lib/queries/maps'
import { MapWorkbench } from '@/components/map-workbench'

export default async function MapsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()
  const supabase = await createClient()
  const membership = await getMembership(campaign.id)
  if (!membership) notFound()
  const { maps, characters } = await getCampaignMapData(supabase, campaign.id)
  return <MapWorkbench campaignId={campaign.id} campaignSlug={slug} canManage={membership.role === 'owner' || membership.role === 'dm'} maps={maps} characters={characters} />
}
