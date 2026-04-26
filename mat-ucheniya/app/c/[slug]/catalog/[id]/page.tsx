export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCurrentLoop, getLoops } from '@/lib/loops'
import { notFound, redirect } from 'next/navigation'
import { NodeDetail } from '@/components/node-detail'
import { CharacterFrontierCard } from '@/components/character-frontier-card'
import WalletBlock from '@/components/wallet-block'
import {
  PcStarterConfigBlock,
  type PcStarterConfigBlockMode,
} from '@/components/pc-starter-config-block'
import StashButtons from '@/components/stash-buttons'
import { computeDefaultDayForTx } from '@/lib/transactions'
import { getStashNode } from '@/lib/stash'
import InventoryTab from '@/components/inventory-tab'
import type { InventoryTabLoop } from '@/components/inventory-tab-controls'
import type { GroupBy } from '@/lib/items-types'
import type { OwnerContext } from '@/components/node-owner-section'
import Link from 'next/link'
import type { Metadata } from 'next'

const VALID_GROUP_BY: ReadonlyArray<GroupBy> = [
  'category',
  'rarity',
  'slot',
  'priceBand',
  'source',
  'availability',
]

function parseGroupBy(raw: string | string[] | undefined): GroupBy | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return null
  return VALID_GROUP_BY.includes(v as GroupBy) ? (v as GroupBy) : null
}

function parseInt1to30(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const t = Math.trunc(n)
  if (t < 1 || t > 30) return null
  return t
}

function parsePositiveInt(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

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
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug, id } = await params
  const sp = searchParams ? await searchParams : {}
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab
  const activeTab: 'wallet' | 'inventory' =
    tabParam === 'inventory' ? 'inventory' : 'wallet'

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
  //
  // Stash (spec-011) has the same pattern: a purpose-built page under
  // /accounting/stash renders wallet + inventory; the catalog route
  // is kept as a discoverable URL but redirects to the canonical view.
  //
  // Items (spec-015 T046): same again — `/items/[id]` is the dedicated
  // item permalink (with attributes table, history, edit affordance).
  // Sidebar already short-circuits this for item nodes (T043), but
  // legacy bookmarks and edge-relations land here and get redirected.
  {
    const typeRaw = (node as { type?: unknown }).type
    const earlyTypeSlug = Array.isArray(typeRaw)
      ? (typeRaw[0] as { slug?: string } | undefined)?.slug
      : (typeRaw as { slug?: string } | null)?.slug
    if (earlyTypeSlug === 'session') {
      redirect(`/c/${slug}/sessions/${id}`)
    }
    if (earlyTypeSlug === 'stash') {
      redirect(`/c/${slug}/accounting/stash`)
    }
    if (earlyTypeSlug === 'item') {
      redirect(`/c/${slug}/items/${id}`)
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
  // Spec-010 US2: for PCs, show the wallet block above the frontier
  // card — balance + recent activity + "+ Transaction" CTA.
  // Spec-011 T032: for PCs, also show the stash put/take buttons next
  // to the wallet block — one tap into / out of Общак without picking
  // a recipient.
  // Spec-015 T028: PCs also get an "Инвентарь" tab — read-only
  // `(loop, day)` slice. Default tab is Wallet (preserves the prior
  // single-pane behaviour); ?tab=inventory swaps the right pane to
  // <InventoryTab>.
  let frontierCard: React.ReactNode = null
  if (typeSlug === 'character') {
    // Wallet-tab data: currentLoop + stashNode + defaultDay are needed
    // by both tabs; fetch unconditionally to keep the Promise.all fan-out.
    const [currentLoop, stashNode, allLoops] = await Promise.all([
      getCurrentLoop(campaign.id),
      getStashNode(campaign.id),
      activeTab === 'inventory' ? getLoops(campaign.id) : Promise.resolve([]),
    ])
    const defaultDay = currentLoop
      ? await computeDefaultDayForTx(node.id, currentLoop.number, currentLoop.id)
      : 1

    // Spec-012 T033: PC starter config block mode.
    //   DM/owner → full editor
    //   PC owner (player) → interactive loan flag + read-only summary
    //   anyone else → hidden
    const userOwnsPc =
      !!ownerContext &&
      ownerContext.owners.some((o) => o.user_id === user.id)
    const starterMode: PcStarterConfigBlockMode =
      membership.role === 'owner' || membership.role === 'dm'
        ? 'dm'
        : userOwnsPc
          ? 'player'
          : 'read-only'

    const tabsNav = (
      <div className="flex gap-0 border-b border-gray-200">
        <Link
          href={`/c/${slug}/catalog/${id}`}
          scroll={false}
          aria-selected={activeTab === 'wallet'}
          className={`-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'wallet'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Кошелёк
        </Link>
        <Link
          href={`/c/${slug}/catalog/${id}?tab=inventory`}
          scroll={false}
          aria-selected={activeTab === 'inventory'}
          className={`-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'inventory'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-600 hover:text-gray-900'
          }`}
        >
          Инвентарь
        </Link>
      </div>
    )

    if (activeTab === 'inventory') {
      // Past + current loops only (FR-023b — viewing a future loop's
      // inventory makes no sense; the loop hasn't happened yet).
      const visibleLoops = allLoops.filter((l) => l.status !== 'future')
      const tabLoops: InventoryTabLoop[] = visibleLoops.map((l) => ({
        number: l.number,
        title: l.title,
        isCurrent: l.status === 'current',
      }))

      // Resolve loop selection: URL → current → newest visible → 1.
      const requestedLoop = parsePositiveInt(sp.loop)
      const fallbackLoopNumber =
        currentLoop?.number ?? visibleLoops[visibleLoops.length - 1]?.number ?? 1
      const selectedLoopNumber =
        requestedLoop && visibleLoops.some((l) => l.number === requestedLoop)
          ? requestedLoop
          : fallbackLoopNumber

      // Day default per SC-008: latest tx day in the chosen loop, then
      // the actor's session frontier, then 1. computeDefaultDayForTx
      // is already loop-aware — use the selected loop's id.
      const selectedLoop = visibleLoops.find((l) => l.number === selectedLoopNumber)
      const defaultDayForSelected = selectedLoop
        ? await computeDefaultDayForTx(node.id, selectedLoop.number, selectedLoop.id)
        : 1
      const requestedDay = parseInt1to30(sp.day)
      const dayInLoop = requestedDay ?? defaultDayForSelected

      const groupBy = parseGroupBy(sp.group)

      frontierCard = (
        <>
          {tabsNav}
          <InventoryTab
            actorNodeId={node.id}
            campaignId={campaign.id}
            loops={tabLoops}
            loopNumber={selectedLoopNumber}
            dayInLoop={dayInLoop}
            groupBy={groupBy}
          />
        </>
      )
    } else {
      frontierCard = (
        <>
          {tabsNav}
          <WalletBlock
            actorNodeId={node.id}
            campaignId={campaign.id}
            campaignSlug={slug}
          />
          {stashNode && (
            <StashButtons
              campaignId={campaign.id}
              campaignSlug={slug}
              canEditCatalog={membership.role === 'owner' || membership.role === 'dm'}
              actorPcId={node.id}
              currentLoopNumber={currentLoop?.number ?? null}
              defaultDay={defaultDay}
              defaultSessionId={null}
            />
          )}
          {currentLoop && (
            <CharacterFrontierCard
              characterId={node.id}
              loopId={currentLoop.id}
              loopNumber={currentLoop.number}
              campaignSlug={slug}
            />
          )}
          <PcStarterConfigBlock pcId={node.id} mode={starterMode} />
        </>
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
