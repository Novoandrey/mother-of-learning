'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Tab = { key: string; href: string; label: string; icon: string }

// Spec-006 increment 3: all tabs are visible to all campaign members
// (owner / dm / player). Players see /members and /settings read-only;
// write-gates live inside each page. Hard manager-only gating + RLS
// comes back in increment 4.
const TABS: Tab[] = [
  { key: 'catalog', href: 'catalog', label: 'Каталог', icon: '📚' },
  { key: 'loops', href: 'loops', label: 'Петли', icon: '🔄' },
  { key: 'sessions', href: 'sessions', label: 'Сессии', icon: '📋' },
  { key: 'encounters', href: 'encounters', label: 'Энкаунтеры', icon: '⚔️' },
  { key: 'electives', href: 'electives', label: 'Факультативы', icon: '🎓' },
  { key: 'accounting', href: 'accounting', label: 'Бухгалтерия', icon: '💰' },
  { key: 'members', href: 'members', label: 'Участники', icon: '👥' },
  { key: 'settings', href: 'settings', label: 'Настройки', icon: '⚙️' },
]

type Props = {
  campaignSlug: string
  /**
   * Spec-014 T031 — pending-row count for the queue badge on the
   * Бухгалтерия tab. Only shown when `showAccountingBadge` is true
   * (DM/owner) and the value is > 0.
   */
  accountingPendingCount?: number
  /** Whether to render the queue badge on the Бухгалтерия tab. */
  showAccountingBadge?: boolean
}

export function NavTabs({
  campaignSlug,
  accountingPendingCount = 0,
  showAccountingBadge = false,
}: Props) {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-2">
      {TABS.map((tab) => {
        const href = `/c/${campaignSlug}/${tab.href}`
        const isActive = pathname.startsWith(href)
        const showBadge =
          tab.key === 'accounting' && showAccountingBadge && accountingPendingCount > 0

        return (
          <Link
            key={tab.key}
            href={href}
            className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'text-blue-700'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <span className="text-xs">{tab.icon}</span>
            {tab.label}
            {showBadge && (
              <span
                className="ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-800"
                aria-label={`${accountingPendingCount} ожидающих заявок`}
              >
                {accountingPendingCount}
              </span>
            )}
            {/* Active indicator — tab underline */}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-blue-600" />
            )}
          </Link>
        )
      })}
    </div>
  )
}
