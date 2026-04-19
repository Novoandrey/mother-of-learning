export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ElectivesClient, type ElectiveRow, type PcRow, type EdgeRow } from './electives-client'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? `Факультативы — ${campaign.name}` : 'Факультативы' }
}

export default async function ElectivesPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  // All campaign members can view; owner/dm can edit (enforced inside actions + UI).
  await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership) notFound()
  const canManage = membership.role === 'owner' || membership.role === 'dm'

  const supabase = await createClient()

  // Resolve node_type ids we need.
  const { data: nodeTypes } = await supabase
    .from('node_types')
    .select('id, slug')
    .eq('campaign_id', campaign.id)
    .in('slug', ['elective', 'character'])

  const electiveTypeId = nodeTypes?.find((t) => t.slug === 'elective')?.id
  const characterTypeId = nodeTypes?.find((t) => t.slug === 'character')?.id

  if (!electiveTypeId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <h1 className="mb-2 text-xl font-semibold">Факультативы</h1>
        <p className="text-gray-500">
          В кампании нет типа сущности «elective». Примени миграцию{' '}
          <code className="rounded bg-gray-100 px-1">029_electives.sql</code>.
        </p>
      </div>
    )
  }

  // Electives
  const { data: electiveRows } = await supabase
    .from('nodes')
    .select('id, title, fields')
    .eq('campaign_id', campaign.id)
    .eq('type_id', electiveTypeId)
    .order('title')

  const electives: ElectiveRow[] = (electiveRows ?? []).map((n) => {
    const f = (n.fields ?? {}) as Record<string, unknown>
    return {
      id: n.id,
      title: n.title,
      kind: (f.kind as string) ?? '',
      link: (f.link as string) ?? '',
      comment: (f.comment as string) ?? '',
    }
  })

  // PCs
  const pcs: PcRow[] = []
  if (characterTypeId) {
    const { data: pcRows } = await supabase
      .from('nodes')
      .select('id, title')
      .eq('campaign_id', campaign.id)
      .eq('type_id', characterTypeId)
      .order('title')
    for (const p of pcRows ?? []) pcs.push({ id: p.id, title: p.title })
  }

  // has_elective edge_type
  const { data: edgeType } = await supabase
    .from('edge_types')
    .select('id')
    .eq('campaign_id', campaign.id)
    .eq('slug', 'has_elective')
    .maybeSingle()

  // Edges PC → elective
  let edges: EdgeRow[] = []
  if (edgeType) {
    const { data: edgeRows } = await supabase
      .from('edges')
      .select('source_id, target_id, meta')
      .eq('campaign_id', campaign.id)
      .eq('type_id', edgeType.id)
    edges = (edgeRows ?? []).map((e) => {
      const meta = (e.meta ?? {}) as Record<string, unknown>
      return {
        pcId: e.source_id,
        electiveId: e.target_id,
        note: (meta.note as string) ?? null,
      }
    })
  }

  return (
    <ElectivesClient
      slug={slug}
      canManage={canManage}
      electives={electives}
      pcs={pcs}
      edges={edges}
    />
  )
}
