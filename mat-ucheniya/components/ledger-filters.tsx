'use client'

import { useCallback, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Category, TransactionKind } from '@/lib/transactions'

type Props = {
  /** Campaign PCs for the PC multi-select. */
  pcs: { id: string; title: string }[]
  /** All loop numbers in the campaign, ascending. */
  loops: number[]
  categories: Category[]
}

const KIND_OPTIONS: { value: TransactionKind; label: string }[] = [
  { value: 'money', label: 'Монеты' },
  { value: 'item', label: 'Предмет' },
  { value: 'transfer', label: 'Перевод' },
]

/**
 * Ledger filter bar — URL-synced.
 *
 * Desktop-primary: inline controls in a responsive flex row.
 * On mobile, the whole bar collapses behind a "Фильтры" button to
 * avoid swallowing the feed below.
 *
 * Every filter change pushes through `router.push` with a rebuilt
 * `?pc=…&loop=…` query — shareable links and browser history
 * work out of the box.
 */
export default function LedgerFilters({ pcs, loops, categories }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Parsed current state — everything derives from URL, no local source of
  // truth that could drift.
  const state = useMemo(
    () => ({
      pc: params.getAll('pc'),
      loop: params.getAll('loop').map((n) => Number(n)).filter(Number.isFinite),
      dayFrom: params.get('dayFrom') ?? '',
      dayTo: params.get('dayTo') ?? '',
      category: params.getAll('category'),
      kind: params.getAll('kind') as TransactionKind[],
    }),
    [params],
  )

  const [mobileOpen, setMobileOpen] = useState(false)

  const updateParam = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString())
      mutate(next)
      // Reset any prior cursor when filters change — pagination is bound
      // to a particular filter predicate.
      next.delete('cursor')
      const qs = next.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    },
    [params, pathname, router],
  )

  const toggleMulti = (key: string, value: string) => {
    updateParam((next) => {
      const all = next.getAll(key)
      next.delete(key)
      const already = all.includes(value)
      const out = already ? all.filter((v) => v !== value) : [...all, value]
      for (const v of out) next.append(key, v)
    })
  }

  const setScalar = (key: string, value: string) => {
    updateParam((next) => {
      if (value === '') next.delete(key)
      else next.set(key, value)
    })
  }

  const clearAll = useCallback(() => {
    router.push(pathname)
  }, [pathname, router])

  const hasAny =
    state.pc.length > 0 ||
    state.loop.length > 0 ||
    state.dayFrom !== '' ||
    state.dayTo !== '' ||
    state.category.length > 0 ||
    state.kind.length > 0

  const content = (
    <div className="flex flex-col gap-3">
      {/* PCs */}
      <FilterGroup label="Персонажи">
        <ChipRow>
          {pcs.map((pc) => (
            <Chip
              key={pc.id}
              active={state.pc.includes(pc.id)}
              onClick={() => toggleMulti('pc', pc.id)}
            >
              {pc.title}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      {/* Loops */}
      <FilterGroup label="Петля">
        <ChipRow>
          {loops.map((n) => (
            <Chip
              key={n}
              active={state.loop.includes(n)}
              onClick={() => toggleMulti('loop', String(n))}
            >
              №{n}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      {/* Day range */}
      <FilterGroup label="День в петле">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={state.dayFrom}
            onChange={(e) => setScalar('dayFrom', e.target.value)}
            placeholder="от"
            className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
          <span className="text-xs text-gray-400">—</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            value={state.dayTo}
            onChange={(e) => setScalar('dayTo', e.target.value)}
            placeholder="до"
            className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </FilterGroup>

      {/* Categories */}
      <FilterGroup label="Категория">
        <ChipRow>
          {categories.map((c) => (
            <Chip
              key={c.slug}
              active={state.category.includes(c.slug)}
              onClick={() => toggleMulti('category', c.slug)}
            >
              {c.label}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      {/* Kind */}
      <FilterGroup label="Тип">
        <ChipRow>
          {KIND_OPTIONS.map((k) => (
            <Chip
              key={k.value}
              active={state.kind.includes(k.value)}
              onClick={() => toggleMulti('kind', k.value)}
            >
              {k.label}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

      {hasAny && (
        <button
          type="button"
          onClick={clearAll}
          className="self-start text-sm text-blue-600 hover:underline"
        >
          Сбросить фильтры
        </button>
      )}
    </div>
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* Mobile-collapsed trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        className="flex w-full items-center justify-between text-sm font-medium text-gray-700 md:hidden"
      >
        <span>Фильтры{hasAny && ' •'}</span>
        <span className="text-gray-400">{mobileOpen ? '▾' : '▸'}</span>
      </button>

      <div
        className={`${
          mobileOpen ? 'block' : 'hidden'
        } pt-3 md:block md:pt-0`}
      >
        {content}
      </div>
    </div>
  )
}

// ─────────── local presentation helpers ───────────

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
      <span className="min-w-[9rem] text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}
