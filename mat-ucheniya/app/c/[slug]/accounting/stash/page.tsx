export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCurrentLoop, getLoops } from '@/lib/loops'
import { getStashNode, getStashContents } from '@/lib/stash'
import BalanceHero from '@/components/balance-hero'
import StashPageTabs from '@/components/stash-page-tabs'
import LedgerList from '@/components/ledger-list'
import InventoryTab from '@/components/inventory-tab'
import type { InventoryTabLoop } from '@/components/inventory-tab-controls'
import type { GroupBy } from '@/lib/items-types'

const VALID_GROUP_BY: ReadonlyArray<GroupBy> = [
  'category',
  'rarity',
  'slot',
  'priceBand',
  'source',
  'availability',
]

function pickStr(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw
}

function parseGroupBy(raw: string | string[] | undefined): GroupBy | null {
  const v = pickStr(raw)
  if (!v) return null
  return VALID_GROUP_BY.includes(v as GroupBy) ? (v as GroupBy) : null
}

function parseInt1to30(raw: string | string[] | undefined): number | null {
  const v = pickStr(raw)
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const t = Math.trunc(n)
  if (t < 1 || t > 30) return null
  return t
}

function parsePositiveInt(raw: string | string[] | undefined): number | null {
  const v = pickStr(raw)
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
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign ? `Общак — ${campaign.name}` : 'Не найдено',
  }
}

/**
 * Stash (Общак) page — spec-011 polish Slice B.
 *
 * Three main sections:
 *   1. Header (icon + title + current loop context)
 *   2. `<BalanceHero>` — balance + "+ Транзакция" button only (no inline
 *      recent list; the ledger tab below is the full history).
 *   3. `<StashPageTabs>` — "Предметы" (existing InventoryGrid) /
 *      "Лента транзакций" (`<LedgerList fixedActorNodeId={stash}>`
 *      — inherits filter bar + pagination + Slice A row redesign).
 *
 * Guarded by campaign membership. If the migration hasn't run yet and
 * the stash node is missing, renders a dashed empty state pointing at
 * the migration — the DM knows what to do.
 */
export default async function StashPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])

  const [campaign] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const [stash, currentLoop, allLoops] = await Promise.all([
    getStashNode(campaign.id),
    getCurrentLoop(campaign.id),
    getLoops(campaign.id),
  ])

  if (!stash) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Header slug={slug} icon="💰" title="Общак" loopCaption={null} />
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-500">
            Нода общака не найдена. Проверьте, что миграция 035 применена.
          </p>
        </div>
      </div>
    )
  }

  // Wipeable per-loop (FR-015). When no loop is current, we fall back
  // to the PC-page behaviour — lifetime aggregate.
  const loopNumber = currentLoop?.number ?? null

  // Item-count badge in the «Предметы» tab heading: count distinct
  // items in the *current* loop only. The InventoryTab below renders
  // its own slice (which the user can scrub via day picker), but the
  // badge tracks "where things currently are".
  const items = loopNumber !== null
    ? (await getStashContents(campaign.id, loopNumber)).items
    : []

  // ── InventoryTab inputs (T029): same URL params as PC page. ──
  const visibleLoops = allLoops.filter((l) => l.status !== 'future')
  const tabLoops: InventoryTabLoop[] = visibleLoops.map((l) => ({
    number: l.number,
    title: l.title,
    isCurrent: l.status === 'current',
  }))
  const requestedLoop = parsePositiveInt(sp.loop)
  const fallbackLoopNumber =
    currentLoop?.number ?? visibleLoops[visibleLoops.length - 1]?.number ?? 1
  const selectedLoopNumber =
    requestedLoop && visibleLoops.some((l) => l.number === requestedLoop)
      ? requestedLoop
      : fallbackLoopNumber

  // Stash has no "frontier day" — the общак doesn't participate in
  // sessions. Default to day 30 (end-of-loop view) so the slice shows
  // the loop's accumulated state at a glance.
  const requestedDay = parseInt1to30(sp.day)
  const dayInLoop = requestedDay ?? 30

  const groupBy = parseGroupBy(sp.group)

  const loopCaption = currentLoop
    ? `Петля ${currentLoop.number}`
    : 'Нет текущей петли'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Header
        slug={slug}
        icon={stash.icon}
        title={stash.title}
        loopCaption={loopCaption}
      />

      {/* Hero: balance + "+ Транзакция" only — full history lives in the
          ledger tab below, so we drop the inline recent list to avoid UX
          duplication. */}
      <BalanceHero
        actorNodeId={stash.nodeId}
        campaignId={campaign.id}
        campaignSlug={slug}
        heading="Баланс общака"
      />

      <StashPageTabs
        itemCount={items.length}
        defaultTab="items"
        itemsContent={
          <InventoryTab
            actorNodeId={stash.nodeId}
            campaignId={campaign.id}
            loops={tabLoops}
            loopNumber={selectedLoopNumber}
            dayInLoop={dayInLoop}
            groupBy={groupBy}
            emptyMessage={
              currentLoop
                ? 'В этой петле в общаке пока нет предметов. Любой персонаж может положить — кнопка «Положить в Общак» на его странице или в шапке бухгалтерии.'
                : 'Нет текущей петли — предметы не отображаются'
            }
          />
        }
        ledgerContent={
          <LedgerList
            campaignId={campaign.id}
            campaignSlug={slug}
            searchParams={sp}
            fixedActorNodeId={stash.nodeId}
            currentLoopNumber={currentLoop?.number ?? null}
          />
        }
      />
    </div>
  )
}

function Header({
  slug,
  icon,
  title,
  loopCaption,
}: {
  slug: string
  icon: string
  title: string
  loopCaption: string | null
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none" aria-hidden="true">
          {icon}
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {loopCaption && (
            <p className="text-sm text-gray-600">{loopCaption}</p>
          )}
        </div>
      </div>
      <Link
        href={`/c/${slug}/accounting`}
        className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
      >
        ← Бухгалтерия
      </Link>
    </div>
  )
}
