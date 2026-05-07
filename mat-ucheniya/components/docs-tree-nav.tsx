'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { DocFile, DocFolder, DocNode } from '@/lib/docs'

type Props = {
  rootIndex: DocFile | null
  topLevel: DocNode[]
}

/**
 * Git-style file tree for /docs. Always expanded — there are only
 * five top-level folders, no need for collapse interactions yet.
 * Active link highlight is driven by `usePathname()`.
 */
export function DocsTreeNav({ rootIndex, topLevel }: Props) {
  const pathname = usePathname()
  const activeSlug = pathnameToSlug(pathname)

  return (
    <nav className="flex flex-col gap-px text-sm">
      {rootIndex && (
        <TreeFile
          file={rootIndex}
          activeSlug={activeSlug}
          depth={0}
          forceLabel="Главная"
        />
      )}
      {topLevel.map((node) => (
        <TreeNodeView key={nodeKey(node)} node={node} activeSlug={activeSlug} depth={0} />
      ))}
    </nav>
  )
}

function TreeNodeView({
  node,
  activeSlug,
  depth,
}: {
  node: DocNode
  activeSlug: string[] | null
  depth: number
}) {
  if (node.type === 'folder') {
    return <TreeFolder folder={node} activeSlug={activeSlug} depth={depth} />
  }
  return <TreeFile file={node} activeSlug={activeSlug} depth={depth} />
}

function TreeFolder({
  folder,
  activeSlug,
  depth,
}: {
  folder: DocFolder
  activeSlug: string[] | null
  depth: number
}) {
  // Folder name itself links to the folder index (README.md) if there is one.
  const indexHref = folder.index ? slugToHref(folder.slug) : null
  const isActive = indexHref ? slugsEqual(activeSlug, folder.slug) : false

  return (
    <div className="flex flex-col gap-px">
      {indexHref ? (
        <Link
          href={indexHref}
          className={rowClasses(depth, isActive, true)}
          prefetch={false}
        >
          <span className="text-gray-400 mr-1.5">▸</span>
          <span className="font-medium">{folderLabel(folder)}</span>
        </Link>
      ) : (
        <div className={rowClasses(depth, false, true)}>
          <span className="text-gray-400 mr-1.5">▸</span>
          <span className="font-medium">{folderLabel(folder)}</span>
        </div>
      )}
      <div className="flex flex-col gap-px">
        {folder.children.map((child) => (
          <TreeNodeView
            key={nodeKey(child)}
            node={child}
            activeSlug={activeSlug}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  )
}

function TreeFile({
  file,
  activeSlug,
  depth,
  forceLabel,
}: {
  file: DocFile
  activeSlug: string[] | null
  depth: number
  forceLabel?: string
}) {
  const href = slugToHref(file.slug)
  const isActive = slugsEqual(activeSlug, file.slug)

  return (
    <Link
      href={href}
      className={rowClasses(depth, isActive, false)}
      prefetch={false}
    >
      <span className="text-gray-400 mr-1.5">·</span>
      <span className="truncate">{forceLabel ?? file.title}</span>
    </Link>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────

function rowClasses(depth: number, isActive: boolean, isFolder: boolean): string {
  const padLeft =
    depth === 0 ? 'pl-2' : depth === 1 ? 'pl-6' : depth === 2 ? 'pl-10' : 'pl-14'
  const colors = isActive
    ? 'bg-blue-50 text-blue-700'
    : isFolder
      ? 'text-gray-700 hover:bg-gray-100'
      : 'text-gray-600 hover:bg-gray-100'
  return `flex items-center ${padLeft} pr-2 py-1 rounded-md ${colors}`
}

function folderLabel(folder: DocFolder): string {
  if (folder.index) return folder.index.title
  return folder.name
}

function slugToHref(slug: string[]): string {
  return slug.length === 0 ? '/docs' : '/docs/' + slug.map(encodeURIComponent).join('/')
}

function pathnameToSlug(pathname: string | null): string[] | null {
  if (!pathname) return null
  if (!pathname.startsWith('/docs')) return null
  const trimmed = pathname.replace(/^\/docs\/?/, '').replace(/\/$/, '')
  if (!trimmed) return []
  return trimmed.split('/').map(decodeURIComponent)
}

function slugsEqual(a: string[] | null, b: string[]): boolean {
  if (a === null) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function nodeKey(node: DocNode): string {
  return node.slug.join('/') + (node.type === 'folder' ? '/' : '')
}
