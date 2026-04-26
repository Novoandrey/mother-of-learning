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
import {
  EditablePriceCell,
  EditableSourceCell,
  EditableTitleCell,
} from './item-catalog-edit-cells'

type SlugLabels = {
  category: Record<string, string>
  slot: Record<string, string>
  source: Record<string, string>
  availability: Record<string, string>
}

type Props = {
  items: ItemNode[]
  slugLabels: SlugLabels
  campaignId: string
  campaignSlug: string
  canEdit: boolean
  /** Источники как опции для inline-edit dropdown'а. */
  sourceOptions: Array<{ slug: string; label: string }>
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
  campaignId,
  campaignSlug,
  canEdit,
  sourceOptions,
}: Props) {
  const [groupBy, setGroupBy] = useState<GroupBy>('category')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // Per-row expanded description state. Click on a row toggles
  // a panel beneath it showing the full description from the seed
  // / DM-edited Образец. Independent of group collapse.
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set())

  const toggleItemExpand = (id: string) => {
    setExpandedItemIds((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
                <table className="w-full table-fixed text-sm">
                  {/*
                    table-fixed + colgroup: columns sized identically
                    across every group's table, so a category-only group
                    («Прочее») doesn't shift columns vs a richly-populated
                    group («Чудесные»). Total = 100%, percentages tuned
                    for ru labels.
                  */}
                  <colgroup>
                    <col style={{ width: '23%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '9%' }} />
                    <col style={{ width: '7%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '5%' }} />
                  </colgroup>
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
                      <th
                        className="px-3 py-1.5 text-center font-normal"
                        title="Настройка — галочка «Не использовать стандартную цену»"
                      >
                        Н
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((item) => (
                      <ItemRow
                        key={item.id}
                        item={item}
                        slugLabels={slugLabels}
                        campaignId={campaignId}
                        campaignSlug={campaignSlug}
                        canEdit={canEdit}
                        sourceOptions={sourceOptions}
                        expanded={expandedItemIds.has(item.id)}
                        onToggleExpand={() => toggleItemExpand(item.id)}
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
  campaignId,
  campaignSlug,
  canEdit,
  sourceOptions,
  expanded,
  onToggleExpand,
}: {
  item: ItemNode
  slugLabels: SlugLabels
  campaignId: string
  campaignSlug: string
  canEdit: boolean
  sourceOptions: Array<{ slug: string; label: string }>
  expanded: boolean
  onToggleExpand: () => void
}) {
  // Какая ячейка сейчас редактируется. Только одна за раз.
  type EditMode = 'title' | 'price' | 'source' | null
  const [editing, setEditing] = useState<EditMode>(null)

  // Optimistic overrides: после save показываем новое значение
  // мгновенно. Display ниже сравнивает override с props — если
  // равны (RSC refresh догнал), фолбэчимся на prop. Никакого
  // cleanup-effect: stale-no-op override остаётся в state, но не
  // влияет на render (display уже совпадает с prop'ом).
  type Optimistic = {
    title?: string
    priceGp?: number | null
    sourceSlug?: string | null
  }
  const [optimistic, setOptimistic] = useState<Optimistic>({})

  // Effective values: optimistic if набрано и НЕ равно prop'у.
  const displayTitle =
    optimistic.title !== undefined && optimistic.title !== item.title
      ? optimistic.title
      : item.title
  const displayPrice =
    optimistic.priceGp !== undefined && optimistic.priceGp !== item.priceGp
      ? optimistic.priceGp
      : item.priceGp
  const displaySourceSlug =
    optimistic.sourceSlug !== undefined &&
    optimistic.sourceSlug !== item.sourceSlug
      ? optimistic.sourceSlug
      : item.sourceSlug

  function startEdit(mode: EditMode, e: React.MouseEvent) {
    if (!canEdit) return
    e.stopPropagation()
    setEditing(mode)
  }

  // Whole row toggles expansion. The title link uses
  // stopPropagation so clicking the name navigates to the
  // permalink without also toggling the description below.
  return (
    <>
      <tr
        onClick={editing ? undefined : onToggleExpand}
        className={`border-b border-gray-200 ${editing ? '' : 'cursor-pointer hover:bg-gray-50'}`}
        aria-expanded={expanded}
      >
        <td className="px-3 py-1.5">
          <span aria-hidden className="mr-1 inline-block w-3 text-center text-gray-300">
            {expanded ? '▾' : '▸'}
          </span>
          {editing === 'title' ? (
            <EditableTitleCell
              campaignId={campaignId}
              itemId={item.id}
              value={displayTitle}
              onCancel={() => setEditing(null)}
              onOptimisticSave={(next) =>
                setOptimistic((p) => ({ ...p, title: next }))
              }
            />
          ) : (
            <Link
              href={`/c/${campaignSlug}/items/${item.id}`}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => startEdit('title', e)}
              title={canEdit ? 'Двойной клик — переименовать' : undefined}
              className="text-gray-900 hover:text-blue-700 hover:underline"
            >
              {displayTitle}
            </Link>
          )}
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
        <td
          className={`px-3 py-1.5 text-right font-mono text-gray-700 ${canEdit && !editing ? 'hover:bg-blue-50' : ''}`}
          onClick={canEdit && !editing ? (e) => startEdit('price', e) : undefined}
          title={canEdit ? 'Клик — изменить цену' : undefined}
        >
          {editing === 'price' ? (
            <EditablePriceCell
              campaignId={campaignId}
              itemId={item.id}
              value={displayPrice}
              onCancel={() => setEditing(null)}
              onOptimisticSave={(next) =>
                setOptimistic((p) => ({ ...p, priceGp: next }))
              }
            />
          ) : displayPrice !== null ? (
            formatGp(displayPrice)
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-right font-mono text-gray-700">
          {item.weightLb !== null ? item.weightLb : <span className="text-gray-300">—</span>}
        </td>
        <td
          className={`px-3 py-1.5 text-gray-500 ${canEdit && !editing ? 'hover:bg-blue-50' : ''}`}
          onClick={canEdit && !editing ? (e) => startEdit('source', e) : undefined}
          title={canEdit ? 'Клик — изменить источник' : undefined}
        >
          {editing === 'source' ? (
            <EditableSourceCell
              campaignId={campaignId}
              itemId={item.id}
              value={displaySourceSlug}
              options={sourceOptions}
              onCancel={() => setEditing(null)}
              onOptimisticSave={(next) =>
                setOptimistic((p) => ({ ...p, sourceSlug: next }))
              }
            />
          ) : displaySourceSlug ? (
            slugLabels.source[displaySourceSlug] ?? displaySourceSlug
          ) : (
            <span className="text-gray-300">—</span>
          )}
        </td>
        <td className="px-3 py-1.5 text-gray-500">
          {item.availabilitySlug
            ? slugLabels.availability[item.availabilitySlug] ?? item.availabilitySlug
            : <span className="text-gray-300">—</span>}
        </td>
        <td
          className="px-3 py-1.5 text-center"
          title={
            !item.useDefaultPrice
              ? 'Галочка «Не использовать стандартную цену» стоит — цена защищена от bulk apply.'
              : 'Стандартная цена — bulk apply будет перезаписывать.'
          }
        >
          {!item.useDefaultPrice && (
            <span aria-label="custom price" className="text-emerald-600">
              ✓
            </span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-200 bg-gray-50">
          <td colSpan={9} className="px-6 py-2 text-sm text-gray-700">
            {item.description ? (
              <div className="whitespace-pre-wrap">{item.description}</div>
            ) : (
              <span className="italic text-gray-400">Описание не заполнено.</span>
            )}
          </td>
        </tr>
      )}
    </>
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
