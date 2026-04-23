export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCurrentLoop } from '@/lib/loops'
import { notFound, redirect } from 'next/navigation'
import { NodeDetail } from '@/components/node-detail'
import { CharacterFrontierCard } from '@/components/character-frontier-card'
import type { OwnerContext } from '@/components/node-owner-section'
import Link from 'next/link'
import type { Metadata } from 'next'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  // Previously this fired an extra supabase query for the node title,
  // duplicating the fetch in the page component. Keeping metadata tied
  // to the campaign alone is enough for tab titles and skips a roundtrip.
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return { title: campaign ? campaign.name : 'Не найдено' }
}

export default async function NodePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params

  // Fan out: auth and campaign lookup are independent. Supabase auth +
  // campaign SELECT run in parallel instead of sequentially.
  const [campaign, authResult] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()
  const { user } = authResult

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const supabase = await createClient()

  // Parallel fetch: node + edges (both directions in one .or() query) + chronicles.
  // The merged edges query includes type joins for children, so we don't need a
  // second "fetch node_types for child ids" roundtrip afterward.
  const [nodeRes, edgeRes, chroniclesRes] = await Promise.all([
    supabase
      .from('nodes')
      .select('id, title, fields, content, type:node_types(slug, label, icon)')
      .eq('id', id)
      .single(),
    supabase
      .from('edges')
      .select(
        'id, label, source_id, target_id, ' +
          'source:nodes!source_id(id, title, type:node_types(icon, label)), ' +
          'target:nodes!target_id(id, title, type:node_types(icon, label)), ' +
          'edge_type:edge_types(slug, label)',
      )
      .or(`source_id.eq.${id},target_id.eq.${id}`),
    supabase
      .from('chronicles')
      .select('id, title, content, loop_number, game_date, created_at, updated_at')
      .eq('node_id', id)
      .order('loop_number', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
  ])

  const node = nodeRes.data
  if (!node) notFound()

  // Sessions have a dedicated, session-specific view at /sessions/[id]
  // with day-range chips, participants row, and prev/next nav. Redirect
  // catalog access so there's exactly one canonical URL per session and
  // no duplicate-view confusion. (Edit links still point at
  // /catalog/[id]/edit — the generic form handles session editing too.)
  {
    const typeRaw = (node as { type?: unknown }).type
    const earlyTypeSlug = Array.isArray(typeRaw)
      ? (typeRaw[0] as { slug?: string } | undefined)?.slug
      : (typeRaw as { slug?: string } | null)?.slug
    if (earlyTypeSlug === 'session') {
      redirect(`/c/${slug}/sessions/${id}`)
    }
  }

  // Split merged edges into (outgoing vs incoming) by comparing source_id.
  type EdgeRow = {
    id: string
    label: string | null
    source_id: string
    target_id: string
    source: { id: string; title: string; type: { icon?: string; label?: string } | null } | null
    target: { id: string; title: string; type: { icon?: string; label?: string } | null } | null
    edge_type: { slug: string; label: string } | null
  }
  const allEdges = (edgeRes.data ?? []) as unknown as EdgeRow[]
  const outgoing = allEdges.filter((e) => e.source_id === id)
  const incoming = allEdges.filter((e) => e.target_id === id)

  // Separate contains-edges (parent/child) from regular edges.
  const childrenWithTypes = outgoing
    .filter((e) => e.edge_type?.slug === 'contains' && e.target)
    .map((e) => ({
      id: e.target!.id,
      title: e.target!.title,
      typeIcon: e.target!.type?.icon,
      typeLabel: e.target!.type?.label,
    }))
    .sort((a, b) => a.title.localeCompare(b.title))

  const parent =
    incoming
      .filter((e) => e.edge_type?.slug === 'contains' && e.source)
      .map((e) => ({ id: e.source!.id, title: e.source!.title }))[0] ?? null

  // Normalize non-contains edges into flat structure for the UI.
  const edges = [
    ...outgoing
      .filter((e) => e.edge_type?.slug !== 'contains')
      .map((e) => ({
        id: e.id,
        type_label: e.edge_type?.label || '?',
        label: e.label,
        direction: 'outgoing' as const,
        related_id: e.target?.id ?? '',
        related_title: e.target?.title || '?',
      })),
    ...incoming
      .filter((e) => e.edge_type?.slug !== 'contains')
      .map((e) => ({
        id: e.id,
        type_label: e.edge_type?.label || '?',
        label: e.label,
        direction: 'incoming' as const,
        related_id: e.source?.id ?? '',
        related_title: e.source?.title || '?',
      })),
  ]

  const chronicles = chroniclesRes.data

  // Owner context for character-nodes. Admin client is used so we can read
  // profiles / player list even for viewers whose RLS might tighten in the
  // next increment — keeps the section resilient.
  const typeRaw = (node as { type?: unknown }).type
  const typeSlug = Array.isArray(typeRaw)
    ? (typeRaw[0] as { slug?: string } | undefined)?.slug
    : (typeRaw as { slug?: string } | null)?.slug
  let ownerContext: OwnerContext | undefined

  if (typeSlug === 'character') {
    const admin = createAdminClient()

    // Parallel fetch: owners of this PC (many-to-many) + player-members of campaign.
    const [ownersRes, playersRes] = await Promise.all([
      admin.from('node_pc_owners').select('user_id').eq('node_id', id),
      admin
        .from('campaign_members')
        .select('user_id')
        .eq('campaign_id', campaign.id)
        .eq('role', 'player'),
    ])

    const ownerIds = (ownersRes.data ?? []).map((r) => r.user_id)
    const playerIds = (playersRes.data ?? []).map((r) => r.user_id)

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

  // canEdit decides which write-UI renders in the detail view
  // (edit/delete buttons, tag editor, add-edge form). Mirror of migration 031:
  //   - owner/dm → always true
  //   - member   → true for any non-character node
  //   - player   → true for a character only if they're in node_pc_owners
  // RLS on the server-side is the hard boundary; this just mirrors it
  // so the UI doesn't show buttons that would 403.
  const isManager = membership.role === 'owner' || membership.role === 'dm'
  let canEdit: boolean
  if (isManager) {
    canEdit = true
  } else if (typeSlug !== 'character') {
    canEdit = true
  } else if (ownerContext) {
    canEdit = ownerContext.owners.some((o) => o.user_id === user.id)
  } else {
    canEdit = false
  }

  // Spec-009 US3: for PCs, show a "current loop progress" card when a
  // loop with status='current' exists. Silent no-op otherwise.
  let frontierCard: React.ReactNode = null
  if (typeSlug === 'character') {
    const currentLoop = await getCurrentLoop(campaign.id)
    if (currentLoop) {
      frontierCard = (
        <CharacterFrontierCard
          characterId={node.id}
          loopId={currentLoop.id}
          loopNumber={currentLoop.number}
          campaignSlug={slug}
        />
      )
    }
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
        node={{
          id: node.id,
          title: node.title,
          fields: (node.fields ?? {}) as Record<string, unknown>,
          content: (node as { content?: string }).content ?? '',
          type: {
            slug: typeSlug ?? '',
            label:
              (Array.isArray(typeRaw)
                ? (typeRaw[0] as { label?: string } | undefined)?.label
                : (typeRaw as { label?: string } | null)?.label) ?? '',
            icon:
              (Array.isArray(typeRaw)
                ? (typeRaw[0] as { icon?: string | null } | undefined)?.icon
                : (typeRaw as { icon?: string | null } | null)?.icon) ?? null,
          },
        }}
        edges={edges}
        childNodes={childrenWithTypes}
        chronicles={chronicles || []}
        campaignSlug={slug}
        campaignId={campaign.id}
        ownerContext={ownerContext}
        frontierCard={frontierCard}
        canEdit={canEdit}
      />
    </div>
  )
}
