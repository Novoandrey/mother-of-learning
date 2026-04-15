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
    .select('id, label, target:nodes!target_id(id, title), edge_type:edge_types(slug, label)')
    .eq('source_id', id)

  const { data: incoming } = await supabase
    .from('edges')
    .select('id, label, source:nodes!source_id(id, title), edge_type:edge_types(slug, label)')
    .eq('target_id', id)

  // Separate contains edges from regular edges
  const children = (outgoing || [])
    .filter((e: any) => e.edge_type?.slug === 'contains')
    .map((e: any) => ({
      id: e.target?.id,
      title: e.target?.title || '?',
    }))

  const parent = (incoming || [])
    .filter((e: any) => e.edge_type?.slug === 'contains')
    .map((e: any) => ({
      id: e.source?.id,
      title: e.source?.title || '?',
    }))[0] || null

  // Normalize non-contains edges into a flat structure
  const edges = [
    ...(outgoing || [])
      .filter((e: any) => e.edge_type?.slug !== 'contains')
      .map((e: any) => ({
        id: e.id,
        type_label: e.edge_type?.label || '?',
        label: e.label,
        direction: 'outgoing' as const,
        related_id: e.target?.id,
        related_title: e.target?.title || '?',
      })),
    ...(incoming || [])
      .filter((e: any) => e.edge_type?.slug !== 'contains')
      .map((e: any) => ({
        id: e.id,
        type_label: e.edge_type?.label || '?',
        label: e.label,
        direction: 'incoming' as const,
        related_id: e.source?.id,
        related_title: e.source?.title || '?',
      })),
  ]

  // Fetch node types for children display
  const childNodeIds = children.map((c: any) => c.id).filter(Boolean)
  let childrenWithTypes: { id: string; title: string; typeIcon?: string; typeLabel?: string }[] = []
  if (childNodeIds.length > 0) {
    const { data: childNodes } = await supabase
      .from('nodes')
      .select('id, title, type:node_types(icon, label)')
      .in('id', childNodeIds)
      .order('title')
    childrenWithTypes = (childNodes || []).map((n: any) => ({
      id: n.id,
      title: n.title,
      typeIcon: n.type?.icon,
      typeLabel: n.type?.label,
    }))
  }

  // Fetch chronicles for this node
  const { data: chronicles } = await supabase
    .from('chronicles')
    .select('id, title, content, loop_number, game_date, created_at, updated_at')
    .eq('node_id', id)
    .order('loop_number', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-5xl">
      {parent ? (
        <Link
          href={`/c/${slug}/catalog/${parent.id}`}
          className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <span className="text-lg leading-none">←</span>
          <span>{parent.title}</span>
        </Link>
      ) : (
        <Link
          href={`/c/${slug}/catalog`}
          className="mb-4 inline-block text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Каталог
        </Link>
      )}
      <NodeDetail
        node={node as any}
        edges={edges}
        childNodes={childrenWithTypes}
        chronicles={chronicles || []}
        campaignSlug={slug}
        campaignId={campaign.id}
      />
    </div>
  )
}
