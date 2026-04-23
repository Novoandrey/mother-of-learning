'use client'

import { useCallback, useEffect, useState } from 'react'
import { listCategoriesAction } from '@/app/actions/categories'
import type { Category } from '@/lib/transactions'

export type CategoryScope = 'transaction' | 'item'

type Props = {
  campaignId: string
  scope: CategoryScope
  value: string | null
  onChange: (slug: string) => void
  /**
   * Optional pre-fetched list — e.g. from a server component parent
   * that already called `listCategories`. Skips the client-side
   * fetch entirely when provided.
   */
  prefetched?: Category[]
  /** Shown when no value is selected. Defaults to "Выберите категорию". */
  placeholder?: string
  /** Disables the control while a parent form is submitting, etc. */
  disabled?: boolean
}

/**
 * Category picker — mobile-first.
 *
 * MVP renders a native `<select>` on every viewport for OS-native
 * picker UX. A future iteration (outside spec-010 P1) can upgrade
 * to a custom dropdown at `md+` breakpoints.
 *
 * The `scope` prop is what makes this reusable in spec-015 for
 * item categories — flip the scope, same component.
 */
export default function CategoryDropdown({
  campaignId,
  scope,
  value,
  onChange,
  prefetched,
  placeholder = 'Выберите категорию',
  disabled,
}: Props) {
  const [fetched, setFetched] = useState<Category[] | null>(null)
  const [loading, setLoading] = useState(!prefetched)
  const [error, setError] = useState<string | null>(null)

  // When prefetched is provided, skip the client fetch entirely.
  // Deriving `categories` from props + fetch-state keeps React's
  // "no setState in effect" rule happy.
  const categories: Category[] | null = prefetched ?? fetched

  // Fetch via callback — setState inside an effect body is lint-flagged
  // in Next 16 (react-hooks rules). Moving the writes into a function
  // invoked from the effect sidesteps it, matches project pattern.
  const loadCategories = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listCategoriesAction(campaignId, scope)
      if (!res.ok) {
        setError(res.error)
        setFetched([])
      } else {
        setFetched(res.categories)
      }
    } finally {
      setLoading(false)
    }
  }, [campaignId, scope])

  useEffect(() => {
    if (prefetched) return
    loadCategories()
  }, [prefetched, loadCategories])

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Категория
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading || !categories}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      >
        <option value="" disabled>
          {loading ? 'Загрузка…' : placeholder}
        </option>
        {(categories ?? []).map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
