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
  common: 'border-zinc-600 text-zinc-300',
  uncommon: 'border-green-700 text-green-300',
  rare: 'border-blue-700 text-blue-300',
  'very-rare': 'border-purple-700 text-purple-300',
  legendary: 'border-amber-700 text-amber-300',
  artifact: 'border-rose-700 text-rose-300',
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
      <section className="rounded border border-dashed border-zinc-700 bg-zinc-900/30 px-4 py-12 text-center">
        <p className="text-sm text-zinc-400">
          Каталог пуст{canEdit ? ' — добавьте первый предмет.' : '.'}
        </p>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      {/* Group-by + sort controls */}
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-zinc-400">Группа:</span>
        <div className="flex flex-wrap gap-1">
          {GROUP_BY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setGroupBy(o.value)}
              className={`rounded border px-2 py-0.5 text-xs ${
                groupBy === o.value
                  ? 'border-amber-600 bg-amber-600/10 text-amber-300'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <span className="ml-3 text-zinc-400">Сортировка:</span>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-xs text-zinc-100"
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
          className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-500"
          aria-label="Направление сортировки"
          title={sortDir === 'asc' ? 'По возрастанию' : 'По убыванию'}
        >
          {sortDir === 'asc' ? '↑' : '↓'}
        </button>

        <span className="ml-auto text-xs text-zinc-500">
          {items.length} {pluralizeRu(items.length, 'предмет', 'предмета', 'предметов')}
        </span>
      </div>

      {/* Groups */}
      {groups.map((g) => {
        const isCollapsed = collapsed.has(g.key)
        return (
          <div key={g.key} className="rounded border border-zinc-800">
            <button
              type="button"
              onClick={() => toggleGroup(g.key)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-900/40"
            >
              <span>
                <span aria-hidden className="mr-1 text-zinc-500">
                  {isCollapsed ? '▸' : '▾'}
                </span>
                {g.label}
                <span className="ml-2 text-xs text-zinc-500">({g.items.length})</span>
              </span>
            </button>
            {!isCollapsed && (
              <div className="overflow-x-auto border-t border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="text-xs text-zinc-500">
                    <tr className="border-b border-zinc-800">
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
    <tr className="border-b border-zinc-900 hover:bg-zinc-900/30">
      <td className="px-3 py-1.5">
        <Link
          href={`/c/${campaignSlug}/items/${item.id}`}
          className="text-zinc-100 hover:text-amber-300"
        >
          {item.title}
        </Link>
      </td>
      <td className="px-3 py-1.5 text-zinc-400">
        {slugLabels.category[item.categorySlug] ?? item.categorySlug}
      </td>
      <td className="px-3 py-1.5">
        {item.rarity ? (
          <span className={`rounded border px-1.5 py-0 text-xs ${RARITY_TONE[item.rarity]}`}>
            {RARITY_LABEL[item.rarity]}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-3 py-1.5 text-zinc-400">
        {item.slotSlug ? slugLabels.slot[item.slotSlug] ?? item.slotSlug : <span className="text-zinc-600">—</span>}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
        {item.priceGp !== null ? formatGp(item.priceGp) : <span className="text-zinc-600">—</span>}
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-zinc-300">
        {item.weightLb !== null ? item.weightLb : <span className="text-zinc-600">—</span>}
      </td>
      <td className="px-3 py-1.5 text-zinc-400">
        {item.sourceSlug ? slugLabels.source[item.sourceSlug] ?? item.sourceSlug : <span className="text-zinc-600">—</span>}
      </td>
      <td className="px-3 py-1.5 text-zinc-400">
        {item.availabilitySlug
          ? slugLabels.availability[item.availabilitySlug] ?? item.availabilitySlug
          : <span className="text-zinc-600">—</span>}
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
