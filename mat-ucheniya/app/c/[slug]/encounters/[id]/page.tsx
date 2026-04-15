export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import { EncounterPageClient } from '@/components/encounter/encounter-page-client'
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
    .eq('campaign_id', campaign.id)
    .single()

  if (!encounter) notFound()

  const { data: participants } = await supabase
    .from('encounter_participants')
    .select('*, node:nodes(id, title, fields, type:node_types(slug))')
    .eq('encounter_id', id)
    .order('initiative', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })

  // Catalog nodes for adding participants
  const { data: catalogNodes } = await supabase
    .from('nodes')
    .select('id, title, fields, type:node_types(slug, label)')
    .eq('campaign_id', campaign.id)
    .order('title')

  const filteredCatalog = (catalogNodes || []).filter((n: any) =>
    n.type && ['character', 'npc', 'creature'].includes(n.type.slug)
  )

  const conditionNames = (catalogNodes || [])
    .filter((n: any) => n.type?.slug === 'condition')
    .map((n: any) => n.title)

  const effectNames = (catalogNodes || [])
    .filter((n: any) => n.type?.slug === 'effect')
    .map((n: any) => n.title)

  // Action log entries
  const { data: logEntries } = await supabase
    .from('encounter_log')
    .select('*')
    .eq('encounter_id', id)
    .order('created_at', { ascending: true })

  // Structured events
  const { data: eventEntries } = await supabase
    .from('encounter_events')
    .select('*')
    .eq('encounter_id', id)
    .order('created_at', { ascending: true })

  return (
    <div className="space-y-3">
      <Link
        href={`/c/${slug}/encounters`}
        className="inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← Энкаунтеры
      </Link>

      <EncounterPageClient
        encounter={{
          id: encounter.id,
          title: encounter.title,
          status: encounter.status,
          current_round: encounter.current_round,
          current_turn_id: encounter.current_turn_id,
          details: encounter.details || {},
        }}
        initialParticipants={(participants as any[]) || []}
        catalogNodes={filteredCatalog as any[]}
        campaignId={campaign.id}
        campaignSlug={slug}
        conditionNames={conditionNames}
        effectNames={effectNames}
        initialLogEntries={(logEntries as any[]) || []}
        initialEvents={(eventEntries as any[]) || []}
      />
    </div>
  )
}
