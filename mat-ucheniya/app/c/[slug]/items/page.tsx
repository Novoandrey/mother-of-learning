export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { listCategories } from '@/lib/categories'
import { getCatalogItems } from '@/lib/items'
import { parseItemFiltersFromSearchParams } from '@/lib/items-filters'

import ItemCatalogGrid from '@/components/item-catalog-grid'
import ItemFilterBar from '@/components/item-filter-bar'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign ? `Предметы — ${campaign.name}` : 'Не найдено',
  }
}

export default async function ItemsCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const resolvedSearch = await searchParams

  await requireAuth()
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const filters = parseItemFiltersFromSearchParams(resolvedSearch)

  // Pull catalog + the four value lists in parallel — the filter bar
  // needs them to render label dropdowns, the grid needs them for
  // group-by labels.
  const [items, categories, slots, sources, availabilities] = await Promise.all([
    getCatalogItems(campaign.id, filters),
    listCategories(campaign.id, 'item'),
    listCategories(campaign.id, 'item-slot'),
    listCategories(campaign.id, 'item-source'),
    listCategories(campaign.id, 'item-availability'),
  ])

  const isDm = membership.role === 'owner' || membership.role === 'dm'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Предметы</h1>
          <p className="text-sm text-gray-500">
            Каталог образцов: оружие, доспехи, расходники, магия и прочее.
            {isDm
              ? ' Транзакции игроков могут привязываться к этим записям.'
              : ' Список общий для всей кампании.'}
          </p>
        </div>
        {isDm && (
          <div className="flex items-center gap-2">
            <a
              href={`/c/${slug}/items/settings`}
              className="rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:border-gray-400 hover:text-gray-900"
            >
              Настройки
            </a>
            {/* «+ Предмет» CTA — wired in T018 (<ItemCreateDialog>). */}
            <a
              href={`/c/${slug}/items/new`}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Предмет
            </a>
          </div>
        )}
      </header>

      <ItemFilterBar
        basePath={`/c/${slug}/items`}
        filters={filters}
        categories={categories}
        slots={slots}
        sources={sources}
        availabilities={availabilities}
      />

      <ItemCatalogGrid
        items={items}
        slugLabels={{
          category: Object.fromEntries(categories.map((c) => [c.slug, c.label])),
          slot: Object.fromEntries(slots.map((c) => [c.slug, c.label])),
          source: Object.fromEntries(sources.map((c) => [c.slug, c.label])),
          availability: Object.fromEntries(
            availabilities.map((c) => [c.slug, c.label]),
          ),
        }}
        campaignSlug={slug}
        canEdit={isDm}
      />
    </div>
  )
}
