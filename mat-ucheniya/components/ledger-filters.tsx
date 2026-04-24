'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { Category, TransactionKind } from '@/lib/transactions'

type Props = {
  /** Campaign PCs for the PC multi-select. */
  pcs: { id: string; title: string }[]
  /** All loop numbers in the campaign, ascending. */
  loops: number[]
  categories: Category[]
  /**
   * When `true`, the "Персонажи" chip group is hidden — used on feeds
   * pinned to a single actor (e.g. the stash page tab) where letting
   * the user broaden selection would contradict the page scope.
   */
  hideActorFilter?: boolean
  /**
   * Number of the loop currently marked `status='current'`, if any.
   * Used to tag the matching loop chip as "(текущая)" so the user
   * doesn't have to remember which number that is.
   */
  currentLoopNumber?: number | null
}

const KIND_OPTIONS: { value: TransactionKind; label: string }[] = [
  { value: 'money', label: 'Монеты' },
  { value: 'item', label: 'Предмет' },
  { value: 'transfer', label: 'Перевод' },
]

/**
 * Ledger filter bar — URL-synced.
 *
 * Design: a single-line collapsed header that shows only a
 * "Фильтры (N)" toggle plus currently-active filters as removable
 * chips. The full multi-group picker panel expands underneath on
 * demand. Rationale: the earlier always-open design dominated the
 * page even when no filter was set. Now the ledger breathes.
 *
 * URL is still the single source of truth — the `expanded` flag is
 * local UI state, nothing else is.
 */
export default function LedgerFilters({
  pcs,
  loops,
  categories,
  hideActorFilter = false,
  currentLoopNumber = null,
}: Props) {
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
      // Spec-012 T038 — autogen filter. Three states: 'all' (default,
      // absent from URL), 'only' (only autogen rows), 'none' (only
      // manual rows). URL value 'only' | 'none'; anything else → 'all'.
      autogen:
        (params.get('autogen') === 'only' && 'only') ||
        (params.get('autogen') === 'none' && 'none') ||
        'all',
    }),
    [params],
  )

  const [expanded, setExpanded] = useState(false)

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

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      updateParam((next) => {
        const all = next.getAll(key)
        next.delete(key)
        const already = all.includes(value)
        const out = already ? all.filter((v) => v !== value) : [...all, value]
        for (const v of out) next.append(key, v)
      })
    },
    [updateParam],
  )

  const setScalar = useCallback(
    (key: string, value: string) => {
      updateParam((next) => {
        if (value === '') next.delete(key)
        else next.set(key, value)
      })
    },
    [updateParam],
  )

  const clearAll = useCallback(() => {
    router.push(pathname)
  }, [pathname, router])

  // ----- Active chips (for the collapsed header) -----
  //
  // Each chip resolves its id to a human label via the lookup arrays.
  // When a lookup returns nothing (orphan id lingering in the URL), we
  // fall back to the raw id so the user can still dismiss it.
  const activeChips = useMemo(() => {
    const out: { key: string; label: string; onRemove: () => void }[] = []
    if (!hideActorFilter) {
      for (const pcId of state.pc) {
        const pc = pcs.find((p) => p.id === pcId)
        out.push({
          key: `pc:${pcId}`,
          label: pc?.title ?? pcId,
          onRemove: () => toggleMulti('pc', pcId),
        })
      }
    }
    for (const n of state.loop) {
      const suffix = n === currentLoopNumber ? ' · текущая' : ''
      out.push({
        key: `loop:${n}`,
        label: `Петля №${n}${suffix}`,
        onRemove: () => toggleMulti('loop', String(n)),
      })
    }
    if (state.dayFrom !== '') {
      out.push({
        key: 'dayFrom',
        label: `день от ${state.dayFrom}`,
        onRemove: () => setScalar('dayFrom', ''),
      })
    }
    if (state.dayTo !== '') {
      out.push({
        key: 'dayTo',
        label: `день до ${state.dayTo}`,
        onRemove: () => setScalar('dayTo', ''),
      })
    }
    for (const slug of state.category) {
      const cat = categories.find((c) => c.slug === slug)
      out.push({
        key: `cat:${slug}`,
        label: cat?.label ?? slug,
        onRemove: () => toggleMulti('category', slug),
      })
    }
    for (const kind of state.kind) {
      const opt = KIND_OPTIONS.find((o) => o.value === kind)
      out.push({
        key: `kind:${kind}`,
        label: opt?.label ?? kind,
        onRemove: () => toggleMulti('kind', kind),
      })
    }
    if (state.autogen !== 'all') {
      out.push({
        key: 'autogen',
        label:
          state.autogen === 'only'
            ? 'только автоген'
            : 'без автогена',
        onRemove: () => setScalar('autogen', ''),
      })
    }
    return out
  }, [
    hideActorFilter,
    state.pc,
    state.loop,
    state.dayFrom,
    state.dayTo,
    state.category,
    state.kind,
    state.autogen,
    pcs,
    categories,
    currentLoopNumber,
    toggleMulti,
    setScalar,
  ])

  const hasAny = activeChips.length > 0

  // ----- Expanded picker panel -----
  const panel = (
    <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
      {!hideActorFilter && (
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
      )}

      <FilterGroup label="Петля">
        <ChipRow>
          {loops.map((n) => (
            <Chip
              key={n}
              active={state.loop.includes(n)}
              onClick={() => toggleMulti('loop', String(n))}
            >
              №{n}
              {n === currentLoopNumber && (
                <span
                  className="ml-1 text-[10px] opacity-70"
                  aria-label="текущая петля"
                  title="Текущая петля"
                >
                  ●
                </span>
              )}
            </Chip>
          ))}
        </ChipRow>
      </FilterGroup>

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

      <FilterGroup label="Автоген">
        <ChipRow>
          <Chip
            active={state.autogen === 'only'}
            onClick={() =>
              setScalar('autogen', state.autogen === 'only' ? '' : 'only')
            }
          >
            Только автоген
          </Chip>
          <Chip
            active={state.autogen === 'none'}
            onClick={() =>
              setScalar('autogen', state.autogen === 'none' ? '' : 'none')
            }
          >
            Без автогена
          </Chip>
        </ChipRow>
      </FilterGroup>
    </div>
  )

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      {/* Collapsed header: toggle + active-filter chips + clear-all */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors"
        >
          <span className="text-gray-500">{expanded ? '▾' : '▸'}</span>
          <span>Фильтры</span>
          {hasAny && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800">
              {activeChips.length}
            </span>
          )}
        </button>

        {activeChips.map((chip) => (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-800"
          >
            {chip.label}
            <button
              type="button"
              onClick={chip.onRemove}
              aria-label={`Убрать фильтр: ${chip.label}`}
              className="ml-0.5 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              <span className="inline-block h-4 w-4 text-center leading-4">×</span>
            </button>
          </span>
        ))}

        {hasAny && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-blue-700 hover:underline"
          >
            Сбросить всё
          </button>
        )}
      </div>

      {expanded && <div className="mt-3">{panel}</div>}
    </div>
  )
}

// ─────────── local presentation helpers ───────────

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 md:flex-row md:items-center md:gap-3">
      <span className="min-w-[9rem] text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </span>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function ChipRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {children}
    </button>
  )
}
