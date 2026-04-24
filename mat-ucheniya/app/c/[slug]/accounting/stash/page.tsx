export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCurrentLoop } from '@/lib/loops'
import { getStashNode, getStashContents } from '@/lib/stash'
import WalletBlock from '@/components/wallet-block'
import { InventoryGrid } from '@/components/inventory-grid'

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
 * Stash (Общак) page — spec-011 T031.
 *
 * Three main sections:
 *   1. Header (icon + title + current loop context)
 *   2. Wallet block (balance + recent 10 transactions + "+ Транзакция")
 *   3. Inventory grid (aggregated items with expand-row instances)
 *
 * Guarded by campaign membership. If the migration hasn't run yet and
 * the stash node is missing, renders a dashed empty state pointing at
 * the migration — the DM knows what to do.
 */
export default async function StashPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const [campaign] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const [stash, currentLoop] = await Promise.all([
    getStashNode(campaign.id),
    getCurrentLoop(campaign.id),
  ])

  if (!stash) {
    return (
      <div className="mx-auto max-w-5xl">
        <Header slug={slug} title="Общак" loopCaption={null} />
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-400">
            Нода общака не найдена. Проверьте, что миграция 035 применена.
          </p>
        </div>
      </div>
    )
  }

  // Wipeable per-loop (FR-015). When no loop is current, we fall back
  // to the PC-page behaviour — lifetime aggregate.
  const loopNumber = currentLoop?.number ?? null

  // Items + recent live in getStashContents; wallet block owns its own
  // fetch for the balance column and the "recent" list — we reuse
  // WalletBlock as-is (now generic via actorNodeId) to avoid
  // duplicating the "+ Транзакция" CTA.
  const items = loopNumber !== null
    ? (await getStashContents(campaign.id, loopNumber)).items
    : []

  const loopCaption = currentLoop
    ? `Петля ${currentLoop.number} · день ${currentLoop.length_days ?? '–'}`
    : 'Нет текущей петли'

  return (
    <div className="mx-auto max-w-5xl">
      <Header slug={slug} title={`${stash.icon} ${stash.title}`} loopCaption={loopCaption} />

      {/* Wallet + recent transactions block — reuses the PC component. */}
      <div className="mb-6">
        <WalletBlock
          actorNodeId={stash.nodeId}
          campaignId={campaign.id}
          campaignSlug={slug}
        />
      </div>

      {/* Items inventory. Per-loop aggregate; empty when no current loop. */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Предметы в общаке
          </div>
          <Link
            href={`/c/${slug}/accounting?pc=${stash.nodeId}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Лента транзакций →
          </Link>
        </div>
        <InventoryGrid
          items={items}
          emptyMessage={
            currentLoop
              ? 'В этой петле в общаке пока нет предметов'
              : 'Нет текущей петли — предметы не отображаются'
          }
        />
      </section>
    </div>
  )
}

function Header({
  slug,
  title,
  loopCaption,
}: {
  slug: string
  title: string
  loopCaption: string | null
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {loopCaption && (
          <p className="text-sm text-gray-500">{loopCaption}</p>
        )}
      </div>
      <Link
        href={`/c/${slug}/accounting`}
        className="flex-shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        ← Бухгалтерия
      </Link>
    </div>
  )
}
