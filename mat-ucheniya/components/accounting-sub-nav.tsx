'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Props = {
  campaignSlug: string
  /** DM/owner role unlocks the Стартовый сетап link + the queue badge. */
  isDM: boolean
  /** Whether the campaign has a stash node — gates the "Общак" link. */
  hasStash: boolean
  /** Number of pending rows for the queue badge. */
  pendingCount: number
}

/**
 * Spec-014 T024 — sub-navigation strip for the accounting surface.
 *
 * Two primary tabs: Лента (default `/accounting`) and Очередь
 * (`/accounting/queue`). Очередь shows a count badge when there are
 * pending rows. Secondary action links live on the right (Стартовый
 * сетап for DM, Категории, Общак).
 *
 * Renders client-side so `usePathname()` can highlight the active
 * tab without a server round-trip on navigation.
 */
export default function AccountingSubNav({
  campaignSlug,
  isDM,
  hasStash,
  pendingCount,
}: Props) {
  const pathname = usePathname()
  const base = `/c/${campaignSlug}/accounting`

  const onLedger = pathname === base
  const onQueue = pathname === `${base}/queue`

  // Linkbuttons share styling; isActive flips border + background.
  const tabClass = (active: boolean) =>
    active
      ? 'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 shadow-sm'
      : 'inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 transition-colors'

  const linkClass =
    'rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors'

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
      <div className="flex items-center gap-1">
        <Link href={base} className={tabClass(onLedger)} aria-current={onLedger ? 'page' : undefined}>
          Лента
        </Link>
        <Link
          href={`${base}/queue`}
          className={tabClass(onQueue)}
          aria-current={onQueue ? 'page' : undefined}
        >
          Очередь
          {pendingCount > 0 && (
            <span
              className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800"
              aria-label={`${pendingCount} ожидающих`}
            >
              {pendingCount}
            </span>
          )}
        </Link>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {hasStash && (
          <Link href={`${base}/stash`} className={linkClass}>
            Общак →
          </Link>
        )}
        {isDM && (
          <Link href={`${base}/starter-setup`} className={linkClass}>
            Стартовый сетап
          </Link>
        )}
        <Link href={`${base}/settings/categories`} className={linkClass}>
          Категории
        </Link>
      </div>
    </div>
  )
}
