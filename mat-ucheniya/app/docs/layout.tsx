import Link from 'next/link'
import type { Metadata } from 'next'
import { getDocsTree } from '@/lib/docs'
import { DocsTreeNav } from '@/components/docs-tree-nav'
import { UserMenu } from '@/components/user-menu'

export const metadata: Metadata = {
  title: 'Документация — Мать Учения',
  description: 'Документация проекта',
}

/**
 * Top-level /docs layout. Public — no auth required.
 *
 * Layout: top bar with home link + UserMenu (if logged in), tree
 * sidebar on the left (git-style), markdown content on the right.
 *
 * The tree is rendered server-side (filesystem read at request time);
 * the active-link highlight is driven by usePathname() in the
 * client component DocsTreeNav.
 */
export default async function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { rootIndex, topLevel } = await getDocsTree()

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="px-4 py-2 flex items-center justify-between gap-4">
          <Link
            href="/docs"
            className="font-semibold text-base hover:text-blue-600 transition-colors"
          >
            📖 Документация
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-blue-600 transition-colors"
            >
              К кампаниям
            </Link>
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-80 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto py-3 px-2">
          <DocsTreeNav rootIndex={rootIndex} topLevel={topLevel} />
        </aside>

        <main className="flex-1 overflow-y-auto min-w-0">
          <div className="max-w-3xl mx-auto px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  )
}
