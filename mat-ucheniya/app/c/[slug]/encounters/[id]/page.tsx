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

  type CatalogNode = {
    id: string
    title: string
    fields: Record<string, unknown>
    type: { slug: string; label: string } | { slug: string; label: string }[] | null
  }
  const catalogList: CatalogNode[] = catalogNodes ?? []
  const nodeTypeSlug = (n: CatalogNode): string | undefined => {
    const t = n.type
    if (!t) return undefined
    return Array.isArray(t) ? t[0]?.slug : t.slug
  }

  const filteredCatalog = catalogList.filter((n) => {
    const slug = nodeTypeSlug(n)
    return slug !== undefined && ['character', 'npc', 'creature'].includes(slug)
  })

  const rawConditions = catalogList
    .filter((n) => nodeTypeSlug(n) === 'condition')
    .map((n) => n.title)

  // Rank conditions by real usage across the whole campaign.
  // encounter_participants.conditions is jsonb array of {name, round}.
  // We unroll it into (name, count) and sort suggestions accordingly.
  // Rationale: a DM typing in the "Состояния" cell sees the most-often-used
  // conditions first. Exhaustion 1..6 is pushed into a separate bottom bucket
  // because it's both noisy (6 entries) and situational.
  const { data: usageRows } = await supabase
    .rpc('condition_usage_counts', { p_campaign_id: campaign.id })
    .returns<Array<{ name: string; count: number }>>()

  const usageMap = new Map<string, number>()
  if (Array.isArray(usageRows)) {
    for (const r of usageRows) usageMap.set(r.name, Number(r.count) || 0)
  }

  const EXHAUSTION_RE = /^истощени[ея]\s*\d/i
  const conditionNames = rawConditions.slice().sort((a, b) => {
    const aExh = EXHAUSTION_RE.test(a) ? 1 : 0
    const bExh = EXHAUSTION_RE.test(b) ? 1 : 0
    if (aExh !== bExh) return aExh - bExh // non-exhaustion first
    const aUse = usageMap.get(a) ?? 0
    const bUse = usageMap.get(b) ?? 0
    if (aUse !== bUse) return bUse - aUse // more-used first
    return a.localeCompare(b, 'ru')
  })

  const effectNames = catalogList
    .filter((n) => nodeTypeSlug(n) === 'effect')
    .map((n) => n.title)

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
        initialParticipants={(participants ?? []) as unknown as import('@/components/encounter/encounter-grid').Participant[]}
        catalogNodes={(filteredCatalog ?? []) as unknown as import('@/components/encounter/encounter-grid').CatalogNode[]}
        campaignId={campaign.id}
        campaignSlug={slug}
        hpMethod={campaign.settings.hp_method}
        conditionNames={conditionNames}
        effectNames={effectNames}
        initialLogEntries={(logEntries ?? []) as unknown as import('@/lib/log-actions').LogEntry[]}
        initialEvents={(eventEntries ?? []) as unknown as import('@/lib/event-actions').EncounterEvent[]}
      />
    </div>
  )
}
