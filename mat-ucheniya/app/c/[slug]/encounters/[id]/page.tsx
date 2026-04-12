import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import { CombatTracker } from '@/components/combat-tracker'
import Link from 'next/link'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}): Promise<Metadata> {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) return { title: 'Не найдено' }

  const supabase = await createClient()
  const { data: encounter } = await supabase
    .from('encounters')
    .select('title')
    .eq('id', id)
    .single()

  return { title: encounter ? `${encounter.title} — ${campaign.name}` : 'Не найдено' }
}

export default async function EncounterPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  const { data: encounter } = await supabase
    .from('encounters')
    .select('*')
    .eq('id', id)
    .single()

  if (!encounter || encounter.campaign_id !== campaign.id) notFound()

  const { data: participants } = await supabase
    .from('encounter_participants')
    .select('*, node:nodes(id, title, type:node_types(slug))')
    .eq('encounter_id', id)
    .order('initiative', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })

  return (
    <div>
      <Link
        href={`/c/${slug}/encounters`}
        className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600"
      >
        ← Энкаунтеры
      </Link>
      <CombatTracker
        encounter={encounter as any}
        initialParticipants={(participants as any[]) || []}
        campaignId={campaign.id}
        campaignSlug={slug}
      />
    </div>
  )
}
