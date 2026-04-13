export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getCampaignBySlug } from '@/lib/campaign'
import { notFound } from 'next/navigation'
import { NodeDetail } from '@/components/node-detail'
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
  const { data: node } = await supabase
    .from('nodes')
    .select('title')
    .eq('id', id)
    .single()

  return { title: node ? `${node.title} — ${campaign.name}` : 'Не найдено' }
}

export default async function NodePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const supabase = await createClient()

  // Fetch node
  const { data: node } = await supabase
    .from('nodes')
    .select('id, title, fields, content, type:node_types(slug, label, icon)')
    .eq('id', id)
    .single()

  if (!node) notFound()

  // Fetch edges (outgoing + incoming) with related node titles and edge type labels
  const { data: outgoing } = await supabase
    .from('edges')
    .select('id, label, target:nodes!target_id(id, title), edge_type:edge_types(label)')
    .eq('source_id', id)

  const { data: incoming } = await supabase
    .from('edges')
    .select('id, label, source:nodes!source_id(id, title), edge_type:edge_types(label)')
    .eq('target_id', id)

  // Normalize edges into a flat structure
  const edges = [
    ...(outgoing || []).map((e: any) => ({
      id: e.id,
      type_label: e.edge_type?.label || '?',
      label: e.label,
      direction: 'outgoing' as const,
      related_id: e.target?.id,
      related_title: e.target?.title || '?',
    })),
    ...(incoming || []).map((e: any) => ({
      id: e.id,
      type_label: e.edge_type?.label || '?',
      label: e.label,
      direction: 'incoming' as const,
      related_id: e.source?.id,
      related_title: e.source?.title || '?',
    })),
  ]

  // Fetch chronicles for this node
  const { data: chronicles } = await supabase
    .from('chronicles')
    .select('id, title, content, loop_number, game_date, created_at, updated_at')
    .eq('node_id', id)
    .order('loop_number', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  return (
    <div>
      <Link
        href={`/c/${slug}/catalog`}
        className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
      >
        ← Каталог
      </Link>
      <NodeDetail
        node={node as any}
        edges={edges}
        chronicles={chronicles || []}
        campaignSlug={slug}
        campaignId={campaign.id}
      />
    </div>
  )
}
