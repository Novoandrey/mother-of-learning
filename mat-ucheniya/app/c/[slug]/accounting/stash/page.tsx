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
      <div className="mx-auto max-w-4xl space-y-4">
        <Header slug={slug} icon="💰" title="Общак" loopCaption={null} />
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

      {/* Hero: balance + "+ Транзакция" + recent list, stacked vertically.
          Uses the shared WalletBlock with a stash-appropriate heading so
          the card doesn't read as a PC-specific "Кошелёк". */}
      <WalletBlock
        actorNodeId={stash.nodeId}
        campaignId={campaign.id}
        campaignSlug={slug}
        heading="Баланс общака"
      />

      {/* Inventory — the stash's primary purpose. Given its own card with
          a title row and item count badge so the UX tells you at a glance
          how much stuff is stored. */}
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-semibold text-gray-900">
              Предметы в общаке
            </h2>
            {items.length > 0 && (
              <span className="text-xs text-gray-400">
                {items.length} {plural(items.length, 'позиция', 'позиции', 'позиций')}
              </span>
            )}
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
              ? 'В этой петле в общаке пока нет предметов. Любой персонаж может положить — кнопка «Положить в Общак» на его странице или в шапке бухгалтерии.'
              : 'Нет текущей петли — предметы не отображаются'
          }
        />
      </section>
    </div>
  )
}

/**
 * Russian plural form (1 / 2-4 / 5+). Used for the "N позиций" chip so
 * it reads naturally without unconditionally defaulting to a 5+ form.
 */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
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
            <p className="text-sm text-gray-500">{loopCaption}</p>
          )}
        </div>
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
