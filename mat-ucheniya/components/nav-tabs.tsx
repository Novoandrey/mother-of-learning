'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { key: 'catalog', href: 'catalog', label: 'Каталог', icon: '📚' },
  { key: 'loops', href: 'loops', label: 'Петли', icon: '🔄' },
  { key: 'sessions', href: 'sessions', label: 'Сессии', icon: '📋' },
  { key: 'encounters', href: 'encounters', label: 'Энкаунтеры', icon: '⚔️' },
]

export function NavTabs({ campaignSlug }: { campaignSlug: string }) {
  const pathname = usePathname()

  return (
    <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-2">
      {TABS.map((tab) => {
        const href = `/c/${campaignSlug}/${tab.href}`
        const isActive = pathname.startsWith(href)

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
