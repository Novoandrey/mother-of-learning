'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  buildItemFiltersUrl,
  summarizeActiveFilters,
} from '@/lib/items-filters'
import type { ItemFilters, PriceBand, Rarity } from '@/lib/items-types'
import type { Category } from '@/lib/transactions'

type Props = {
  basePath: string
  filters: ItemFilters
  categories: Category[]
  slots: Category[]
  sources: Category[]
  availabilities: Category[]
}

const RARITY_OPTIONS: { value: Rarity; label: string }[] = [
  { value: 'common', label: 'Common' },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare', label: 'Rare' },
  { value: 'very-rare', label: 'Very Rare' },
  { value: 'legendary', label: 'Legendary' },
  { value: 'artifact', label: 'Artifact' },
]

const PRICE_BAND_OPTIONS: { value: PriceBand; label: string }[] = [
  { value: 'free', label: 'Бесплатно' },
  { value: 'cheap', label: 'Дёшево (≤ 50 gp)' },
  { value: 'mid', label: 'Средне (51–500 gp)' },
  { value: 'expensive', label: 'Дорого (> 500 gp)' },
  { value: 'priceless', label: 'Без цены' },
]

/**
 * Catalog filter bar — URL-synced.
 *
 * Mirrors `<LedgerFilters>` (chat 43): collapsed by default, shows
 * active-filter chips with × removal, "Сбросить всё". Filter groups:
 * name search, category, rarity (closed enum), slot, price band,
 * source, availability.
 *
 * URL is the single source of truth. The expanded/collapsed state is
 * the only piece of local UI state.
 */
export default function ItemFilterBar({
  basePath,
  filters,
  categories,
  slots,
  sources,
  availabilities,
}: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [searchDraft, setSearchDraft] = useState(filters.q ?? '')

  const activeFilters = useMemo(
    () => summarizeActiveFilters(basePath, filters),
    [basePath, filters],
  )
  const activeCount = activeFilters.length

  const labelFor = useCallback(
    (key: keyof ItemFilters, value: string): string => {
      switch (key) {
        case 'category':
          return categories.find((c) => c.slug === value)?.label ?? value
        case 'slot':
          return slots.find((c) => c.slug === value)?.label ?? value
        case 'source':
          return sources.find((c) => c.slug === value)?.label ?? value
        case 'availability':
          return availabilities.find((c) => c.slug === value)?.label ?? value
        case 'priceBand':
          return PRICE_BAND_OPTIONS.find((o) => o.value === value)?.label ?? value
        case 'rarity':
          return RARITY_OPTIONS.find((o) => o.value === value)?.label ?? value
        case 'q':
          return `«${value}»`
        default:
          return value
      }
    },
    [categories, slots, sources, availabilities],
  )

  const setFilter = useCallback(
    (k: keyof ItemFilters, v: string | undefined) => {
      const next: ItemFilters = { ...filters }
      if (v === undefined || v === '') {
        delete next[k]
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(next as any)[k] = v
      }
      router.push(buildItemFiltersUrl(basePath, next))
    },
    [filters, basePath, router],
  )

  const submitSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = searchDraft.trim()
      setFilter('q', trimmed.length > 0 ? trimmed : undefined)
    },
    [searchDraft, setFilter],
  )

  const resetAll = useCallback(() => {
    setSearchDraft('')
    router.push(basePath)
  }, [basePath, router])

  return (
    <section className="rounded border border-zinc-800 bg-zinc-900/40">
      <header className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-sm text-zinc-200 hover:text-zinc-50"
        >
          Фильтры{activeCount > 0 ? ` (${activeCount})` : ''}{' '}
          <span aria-hidden className="text-zinc-500">{expanded ? '▾' : '▸'}</span>
        </button>

        {/* Active-filter chips with × removal. */}
        {activeFilters.map((af) => (
          <a
            key={`${af.key}:${af.value}`}
            href={af.removeUrl}
            className="flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-200 hover:border-zinc-500"
          >
            <span>{labelFor(af.key, af.value)}</span>
            <span aria-hidden className="text-zinc-500">×</span>
          </a>
        ))}

        {activeCount > 0 && (
          <button
            type="button"
            onClick={resetAll}
            className="ml-auto text-xs text-zinc-400 hover:text-zinc-200"
          >
            Сбросить всё
          </button>
        )}
      </header>

      {expanded && (
        <div className="grid gap-3 border-t border-zinc-800 px-3 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Name search */}
          <form onSubmit={submitSearch} className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400">Поиск по названию</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="меч"
                className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded border border-zinc-700 px-2 py-1 text-sm text-zinc-200 hover:border-zinc-500"
              >
                ↵
              </button>
            </div>
          </form>

          {/* Category */}
          <FilterSelect
            label="Категория"
            value={filters.category}
            options={categories.map((c) => ({ value: c.slug, label: c.label }))}
            onChange={(v) => setFilter('category', v)}
          />

          {/* Rarity */}
          <FilterSelect
            label="Редкость"
            value={filters.rarity}
            options={RARITY_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
            onChange={(v) => setFilter('rarity', v)}
          />

          {/* Slot */}
          <FilterSelect
            label="Слот"
            value={filters.slot}
            options={slots.map((s) => ({ value: s.slug, label: s.label }))}
            onChange={(v) => setFilter('slot', v)}
          />

          {/* Price band */}
          <FilterSelect
            label="Цена"
            value={filters.priceBand}
            options={PRICE_BAND_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
            onChange={(v) => setFilter('priceBand', v)}
          />

          {/* Source */}
          <FilterSelect
            label="Источник"
            value={filters.source}
            options={sources.map((s) => ({ value: s.slug, label: s.label }))}
            onChange={(v) => setFilter('source', v)}
          />

          {/* Availability */}
          <FilterSelect
            label="Доступность"
            value={filters.availability}
            options={availabilities.map((a) => ({ value: a.slug, label: a.label }))}
            onChange={(v) => setFilter('availability', v)}
          />
        </div>
      )}
    </section>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | undefined
  options: { value: string; label: string }[]
  onChange: (v: string | undefined) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-400">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
      >
        <option value="">— любое —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}
