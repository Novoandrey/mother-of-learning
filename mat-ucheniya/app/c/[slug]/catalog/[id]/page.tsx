export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { notFound, redirect } from 'next/navigation'
import { NodeDetail } from '@/components/node-detail'
import type { OwnerContext } from '@/components/node-owner-section'
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

  // Auth gate: authenticated + member of this campaign.
  const { user } = await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const supabase = await createClient()

  // Fetch node (type resolved for the owner-section branch below).
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

  // Owner context for character-nodes. Admin client is used so we can read
  // profiles / player list even for viewers whose RLS might tighten in the
  // next increment — keeps the section resilient.
  const typeRaw = (node as any).type
  const typeSlug = Array.isArray(typeRaw) ? typeRaw[0]?.slug : typeRaw?.slug
  let ownerContext: OwnerContext | undefined

  if (typeSlug === 'character') {
    const admin = createAdminClient()

    // Load all current owners of this PC (many-to-many).
    const { data: ownerRows } = await admin
      .from('node_pc_owners')
      .select('user_id')
      .eq('node_id', id)

    const ownerIds = (ownerRows ?? []).map((r) => r.user_id)

    // Load candidate players (campaign members with role='player').
    const { data: playerRows } = await admin
      .from('campaign_members')
      .select('user_id')
      .eq('campaign_id', campaign.id)
      .eq('role', 'player')

    const playerIds = (playerRows ?? []).map((r) => r.user_id)

    // One profile lookup for the union of owner + player ids.
    const profileIds = Array.from(new Set([...ownerIds, ...playerIds]))

    let profileMap = new Map<
      string,
      { user_id: string; login: string; display_name: string | null }
    >()
    if (profileIds.length > 0) {
      const { data: profiles } = await admin
        .from('user_profiles')
        .select('user_id, login, display_name')
        .in('user_id', profileIds)
      profileMap = new Map(
        (profiles ?? []).map((p) => [
          p.user_id,
          {
            user_id: p.user_id,
            login: p.login,
            display_name: p.display_name,
          },
        ]),
      )
    }

    const owners = ownerIds
      .map((uid) => profileMap.get(uid))
      .filter(
        (x): x is { user_id: string; login: string; display_name: string | null } =>
          !!x,
      )
      .sort((a, b) => a.login.localeCompare(b.login))

    const players = playerIds
      .map((uid) => profileMap.get(uid))
      .filter(
        (x): x is { user_id: string; login: string; display_name: string | null } =>
          !!x,
      )
      .sort((a, b) => a.login.localeCompare(b.login))

    ownerContext = {
      viewerRole: membership.role,
      viewerUserId: user.id,
      owners,
      players,
    }
  }

  // Spec-006 increment 4: canEdit decides which write-UI renders in the
  // detail view (edit/delete buttons, tag editor, add-edge form).
  // - owner/dm → always true
  // - player  → true only on their own PC (character + viewer in owners)
  // RLS on the server-side is the hard boundary; this just mirrors it
  // so the UI doesn't show buttons that would 403.
  const isManager = membership.role === 'owner' || membership.role === 'dm'
  let canEdit = isManager
  if (!isManager && membership.role === 'player' && typeSlug === 'character' && ownerContext) {
    canEdit = ownerContext.owners.some((o) => o.user_id === user.id)
  }

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
        ownerContext={ownerContext}
        canEdit={canEdit}
      />
    </div>
  )
}
