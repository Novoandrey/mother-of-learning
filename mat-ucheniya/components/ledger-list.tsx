import { getCurrentUser, getMembership } from '@/lib/auth'
import { getLedgerPage, type LedgerFilters as LF } from '@/lib/transactions'
import { listCategories } from '@/lib/categories'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TransactionKind } from '@/lib/transactions'
import LedgerFilters from './ledger-filters'
import LedgerListClient from './ledger-list-client'

type Props = {
  campaignId: string
  campaignSlug: string
  /** URL search params as a plain object — Next.js 16 page convention. */
  searchParams: Record<string, string | string[] | undefined>
  /**
   * When set, the feed is pinned to this actor — the `pc` URL filter
   * is overridden, the actor chip group in the filter bar is hidden,
   * and the "N персонажей" summary stat (always 1) is suppressed.
   *
   * Used by the stash page tab to show only stash-leg transactions
   * without offering a way to broaden the selection — the tab view
   * is intentionally scoped.
   */
  fixedActorNodeId?: string
  /**
   * Number of the loop with `status='current'`, if any — forwarded to
   * `<LedgerFilters>` so the matching loop chip can be tagged "(текущая)".
   * Caller (page) already has this fetched, so we avoid a duplicate query.
   */
  currentLoopNumber?: number | null
}

const PAGE_SIZE = 30

function asArray(v: string | string[] | undefined): string[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): LF {
  const dayFromStr = typeof sp.dayFrom === 'string' ? sp.dayFrom : undefined
  const dayToStr = typeof sp.dayTo === 'string' ? sp.dayTo : undefined
  return {
    pc: asArray(sp.pc),
    loop: asArray(sp.loop)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n)),
    dayFrom: dayFromStr && Number.isFinite(Number(dayFromStr))
      ? Number(dayFromStr)
      : undefined,
    dayTo: dayToStr && Number.isFinite(Number(dayToStr))
      ? Number(dayToStr)
      : undefined,
    category: asArray(sp.category),
    kind: asArray(sp.kind).filter(
      (k): k is TransactionKind => k === 'money' || k === 'item' || k === 'transfer',
    ),
    autogen:
      sp.autogen === 'only' ? 'only' : sp.autogen === 'none' ? 'none' : undefined,
  }
}

/**
 * Ledger feed — server shell.
 *
 * Reads URL-synced filters, fetches the first page + taxonomy +
 * campaign PCs, then hands everything to the client list which
 * owns "load more", edit/delete wiring, and the form sheet.
 *
 * The top-of-page summary comes from the same filter predicate as
 * the rows (via `getLedgerPage` totals) — numbers are always in
 * sync with what the user sees.
 */
export default async function LedgerList({
  campaignId,
  campaignSlug,
  searchParams,
  fixedActorNodeId,
  currentLoopNumber = null,
}: Props) {
  const user = await getCurrentUser()
  if (!user) return null
  const membership = await getMembership(campaignId)
  if (!membership) return null

  const canManage = membership.role === 'owner' || membership.role === 'dm'
  const filters = parseFilters(searchParams)
  if (fixedActorNodeId) {
    // Hard override — URL ?pc=… is ignored inside a pinned feed.
    filters.pc = [fixedActorNodeId]
  }
  const cursor = typeof searchParams.cursor === 'string' ? searchParams.cursor : null

  const admin = createAdminClient()

  // Fetch in parallel: ledger page, categories, PC list (for filter chips),
  // loop numbers (also filter chips).
  const [page, categories, pcsRes, loopsRes] =
    await Promise.all([
      getLedgerPage(campaignId, filters, cursor, PAGE_SIZE),
      listCategories(campaignId, 'transaction'),
      admin
        .from('node_types')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('slug', 'character')
        .maybeSingle(),
      admin
        .from('node_types')
        .select('id')
        .eq('campaign_id', campaignId)
        .eq('slug', 'loop')
        .maybeSingle(),
    ])

  // Hydrate PCs + loop numbers via the fetched type ids.
  const [pcs, loopsData] = await Promise.all([
    pcsRes.data
      ? admin
          .from('nodes')
          .select('id, title')
          .eq('campaign_id', campaignId)
          .eq('type_id', (pcsRes.data as { id: string }).id)
          .order('title')
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    loopsRes.data
      ? admin
          .from('nodes')
          .select('fields')
          .eq('campaign_id', campaignId)
          .eq('type_id', (loopsRes.data as { id: string }).id)
      : Promise.resolve({ data: [] as { fields: Record<string, unknown> | null }[] }),
  ])

  const loopNumbers = ((loopsData.data ?? []) as {
    fields: Record<string, unknown> | null
  }[])
    .map((r) => {
      const raw = r.fields?.number
      if (raw == null || raw === '') return NaN
      return Number(raw)
    })
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)

  const summary = page.totals
  const itemOnlyFilter =
    filters.kind && filters.kind.length === 1 && filters.kind[0] === 'item'
  const netSign = summary.netAggregateGp < 0 ? '\u2212' : '+'
  const netAbs = Math.abs(summary.netAggregateGp).toFixed(2)
  const netDisplay =
    summary.count === 0 || itemOnlyFilter ? '—' : `${netSign}${netAbs} GP`

  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="flex flex-wrap items-baseline gap-4 text-sm text-gray-600">
        <span>
          <strong className="text-gray-900">{summary.count}</strong> транзакций
        </span>
        {!fixedActorNodeId && (
          <span>
            <strong className="text-gray-900">{summary.distinctPcs}</strong> персонажей
          </span>
        )}
        <span>
          нетто:{' '}
          <strong className="text-gray-900">{netDisplay}</strong>
        </span>
      </div>

      <LedgerFilters
        pcs={(pcs.data ?? []) as { id: string; title: string }[]}
        loops={loopNumbers}
        categories={categories}
        hideActorFilter={!!fixedActorNodeId}
        currentLoopNumber={currentLoopNumber}
      />

      <LedgerListClient
        key={JSON.stringify(filters)}
        campaignId={campaignId}
        campaignSlug={campaignSlug}
        currentUserId={user.id}
        canManage={canManage}
        categories={categories}
        initialRows={page.rows}
        initialNextCursor={page.nextCursor}
        filters={filters}
        pageSize={PAGE_SIZE}
      />
    </div>
  )
}
