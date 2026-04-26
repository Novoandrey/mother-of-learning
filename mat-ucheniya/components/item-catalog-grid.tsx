'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'

import { groupItems, sortItems } from '@/lib/items-grouping'
import type {
  GroupBy,
  ItemNode,
  Rarity,
  SortDir,
  SortKey,
} from '@/lib/items-types'

type SlugLabels = {
  category: Record<string, string>
  slot: Record<string, string>
  source: Record<string, string>
  availability: Record<string, string>
}

type Props = {
  items: ItemNode[]
  slugLabels: SlugLabels
  campaignSlug: string
  canEdit: boolean
}

const GROUP_BY_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'category', label: 'Категория' },
  { value: 'rarity', label: 'Редкость' },
  { value: 'slot', label: 'Слот' },
  { value: 'priceBand', label: 'Цена' },
  { value: 'source', label: 'Источник' },
  { value: 'availability', label: 'Доступность' },
]

const SORT_KEY_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Название' },
  { value: 'price', label: 'Цена' },
  { value: 'weight', label: 'Вес' },
  { value: 'rarity', label: 'Редкость' },
]

const RARITY_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
}

const RARITY_TONE: Record<Rarity, string> = {
  common: 'border-gray-300 text-gray-700',
  uncommon: 'border-green-500 bg-green-50 text-green-800',
  rare: 'border-blue-500 bg-blue-50 text-blue-800',
  'very-rare': 'border-purple-500 bg-purple-50 text-purple-800',
  legendary: 'border-amber-700 text-blue-700',
  artifact: 'border-rose-500 bg-rose-50 text-rose-800',
}

/**
 * Catalog grid — client island. Group-by toggle and sort are
 * client-side re-folds (no refetch). The full filtered list comes
 * from the server (FR-008/010).
 *
 * Empty-state per FR-011.
 */
export default function ItemCatalogGrid({
  items,
  slugLabels,
  campaignSlug,
  canEdit,
}: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>('category')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const groups = useMemo(() => {
    const sorted = sortItems(items, sortKey, sortDir)
    return groupItems(sorted, groupBy, {
      category: slugLabels.category,
      slot: slugLabels.slot,
      source: slugLabels.source,
      availability: slugLabels.availability,
    })
  }, [items, sortKey, sortDir, groupBy, slugLabels])

  const toggleGroup = (key: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (items.length === 0) {
    return (
      <section className="rounded border border-dashed border-gray-300 bg-gray-50 px-4 py-12 text-center">
        <p className="text-sm text-gray-500">
          Каталог пуст{canEdit ? ' — добавьте первый предмет.' : '.'}
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      {/* Group-by + sort controls */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-500">Группа:</span>
        <div className="flex flex-wrap gap-1">
          {GROUP_BY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setGroupBy(o.value)}
              className={`rounded border px-2 py-0.5 text-xs ${
                groupBy === o.value
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-700 hover:border-gray-400'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <span className="ml-3 text-gray-500">Сортировка:</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-900"
        >
          {SORT_KEY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-700 hover:border-gray-400"
          aria-label="Направление сортировки"
          title={sortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>

        <span className="ml-auto text-xs text-gray-400">
          {items.length} {pluralizeRu(items.length, 'предмет', 'предмета', 'предметов')}
        </span>
      </div>

      {/* Groups */}
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key)
        return (
          <div key={g.key} className="rounded border border-gray-200">
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <span>
                <span aria-hidden className="mr-1 text-gray-400">
                  {isCollapsed ? '▸' : '▾'}
                </span>
                {g.label}
                <span className="ml-2 text-xs text-gray-400">({g.items.length})</span>
              </span>
            </button>
            {!isCollapsed && (
              <div className="overflow-x-auto border-t border-gray-200">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-400">
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-1.5 text-left font-normal">Название</th>
                      <th className="px-3 py-1.5 text-left font-normal">Категория</th>
                      <th className="px-3 py-1.5 text-left font-normal">Редкость</th>
                      <th className="px-3 py-1.5 text-left font-normal">Слот</th>
                      <th className="px-3 py-1.5 text-right font-normal">Цена, gp</th>
                      <th className="px-3 py-1.5 text-right font-normal">Вес, lb</th>
                      <th className="px-3 py-1.5 text-left font-normal">Источник</th>
                      <th className="px-3 py-1.5 text-left font-normal">Доступность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        slugLabels={slugLabels}
                        campaignSlug={campaignSlug}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}

function ItemRow({
  item,
  slugLabels,
  campaignSlug,
}: {
  item: ItemNode
  slugLabels: SlugLabels
  campaignSlug: string
}) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="px-3 py-1.5">
        <Link
          href={`/c/${campaignSlug}/items/${item.id}`}
          className="text-gray-900 hover:text-blue-700"
        >
          {item.title}
        </Link>
      </td>
      <td className="px-3 py-1.5 text-gray-500">
        {slugLabels.category[item.categorySlug] ?? item.categorySlug}
      </td>
      <td className="px-3 py-1.5">
        {item.rarity ? (
          <span className={`rounded border px-1.5 py-0 text-xs ${RARITY_TONE[item.rarity]}`}>
            {RARITY_LABEL[item.rarity]}
          </span>
        ) : (
          <span className="text-gray-300">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-gray-500">
        {item.slotSlug ? slugLabels.slot[item.slotSlug] ?? item.slotSlug : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-gray-700">
        {item.priceGp !== null ? formatGp(item.priceGp) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-gray-700">
        {item.weightLb !== null ? item.weightLb : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-1.5 text-gray-500">
        {item.sourceSlug ? slugLabels.source[item.sourceSlug] ?? item.sourceSlug : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-1.5 text-gray-500">
        {item.availabilitySlug
          ? slugLabels.availability[item.availabilitySlug] ?? item.availabilitySlug
          : <span className="text-gray-300">—</span>}
      </td>
    </tr>
  )
}

function formatGp(price: number): string {
  if (price === Math.floor(price)) return price.toLocaleString('ru-RU')
  return price.toFixed(2)
}

function pluralizeRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few
  return many
}
