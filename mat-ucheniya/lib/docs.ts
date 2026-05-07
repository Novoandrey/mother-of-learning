/**
 * Filesystem reader for /docs route.
 *
 * Reads markdown files from `mat-ucheniya/docs/` (relative to project root)
 * and builds a tree for the sidebar + reads a single file by slug.
 *
 * Conventions:
 * - Folders are sorted by FOLDER_ORDER first, then alphabetically.
 * - Inside a folder: README.md first, then other files alphabetically.
 * - File titles are extracted from the first `# ...` line of the markdown.
 * - URL slug for /docs/foo/bar.md is `['foo', 'bar']`.
 * - URL slug for /docs/foo/README.md is `['foo']` (folder index).
 * - URL slug for /docs/README.md is `[]` (docs root).
 */

import { promises as fs } from 'fs'
import path from 'path'

const DOCS_ROOT = path.join(process.cwd(), 'docs')

const FOLDER_ORDER = [
  'concepts',
  'features',
  'architecture',
  'process',
  'roadmap',
]

export type DocFile = {
  type: 'file'
  name: string
  /** Path segments without the .md extension. README.md → folder slug. */
  slug: string[]
  title: string
}

export type DocFolder = {
  type: 'folder'
  name: string
  slug: string[]
  /** Index file (README.md) of this folder, if present. */
  index: DocFile | null
  /** Non-index file children + sub-folders. */
  children: DocNode[]
}

export type DocNode = DocFile | DocFolder

/**
 * Extract the first H1 from markdown. Returns the line text after `# `.
 * Falls back to the filename (without extension) if no H1 is found.
 */
function extractTitle(content: string, fallback: string): string {
  const match = content.match(/^#\s+(.+?)\s*$/m)
  return match ? match[1].trim() : fallback
}

async function readFolder(
  absDir: string,
  relSegments: string[],
): Promise<DocFolder> {
  const entries = await fs.readdir(absDir, { withFileTypes: true })

  const childFolders: DocFolder[] = []
  const childFiles: DocFile[] = []
  let index: DocFile | null = null

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absPath = path.join(absDir, entry.name)

    if (entry.isDirectory()) {
      const folder = await readFolder(absPath, [...relSegments, entry.name])
      childFolders.push(folder)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const baseName = entry.name.slice(0, -3) // strip .md
      const content = await fs.readFile(absPath, 'utf8')
      const title = extractTitle(content, baseName)

      if (entry.name === 'README.md') {
        index = {
          type: 'file',
          name: 'README.md',
          slug: relSegments, // folder slug, no README appended
          title,
        }
      } else {
        childFiles.push({
          type: 'file',
          name: entry.name,
          slug: [...relSegments, baseName],
          title,
        })
      }
    }
  }

  // Sort folders: known order first, then alphabetical.
  childFolders.sort((a, b) => {
    const ai = FOLDER_ORDER.indexOf(a.name)
    const bi = FOLDER_ORDER.indexOf(b.name)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    return a.name.localeCompare(b.name)
  })

  // Files alphabetical (README is separate via `index`).
  childFiles.sort((a, b) => a.name.localeCompare(b.name))

  // Folders rendered before files inside a folder, matching common
  // file-tree conventions.
  const children: DocNode[] = [...childFolders, ...childFiles]

  return {
    type: 'folder',
    name: relSegments[relSegments.length - 1] ?? '',
    slug: relSegments,
    index,
    children,
  }
}

/**
 * Build the full docs tree. Returns the children of the root folder
 * (top-level folders + top-level files), not the root folder itself.
 * Plus the root README as a separate field.
 */
export async function getDocsTree(): Promise<{
  rootIndex: DocFile | null
  topLevel: DocNode[]
}> {
  try {
    const root = await readFolder(DOCS_ROOT, [])
    return { rootIndex: root.index, topLevel: root.children }
  } catch {
    return { rootIndex: null, topLevel: [] }
  }
}

/**
 * Resolve a URL slug to an absolute file path.
 * Tries `<slug>.md` first, then `<slug>/README.md`.
 * Empty slug → `README.md` at docs root.
 */
function resolveSlug(slug: string[]): string {
  if (slug.length === 0) {
    return path.join(DOCS_ROOT, 'README.md')
  }
  return path.join(DOCS_ROOT, ...slug) + '.md'
}

function resolveSlugAsFolderIndex(slug: string[]): string {
  return path.join(DOCS_ROOT, ...slug, 'README.md')
}

export type DocContent = {
  title: string
  /** Raw markdown source. */
  content: string
  /** Slug as resolved (may differ from input if folder-index fallback). */
  slug: string[]
  /** Whether this is a folder README. */
  isFolderIndex: boolean
}

/**
 * Read a doc by URL slug. Returns null if not found.
 * - `[]` → `docs/README.md`
 * - `['foo']` → `docs/foo.md` or `docs/foo/README.md`
 * - `['foo', 'bar']` → `docs/foo/bar.md` or `docs/foo/bar/README.md`
 */
export async function readDoc(slug: string[]): Promise<DocContent | null> {
  const candidates: { path: string; isFolderIndex: boolean }[] = []
  if (slug.length === 0) {
    candidates.push({ path: resolveSlug([]), isFolderIndex: true })
  } else {
    candidates.push({ path: resolveSlug(slug), isFolderIndex: false })
    candidates.push({
      path: resolveSlugAsFolderIndex(slug),
      isFolderIndex: true,
    })
  }

  for (const cand of candidates) {
    try {
      const content = await fs.readFile(cand.path, 'utf8')
      const baseName = path.basename(cand.path, '.md')
      const title = extractTitle(
        content,
        cand.isFolderIndex ? slug[slug.length - 1] ?? 'Документация' : baseName,
      )
      return { title, content, slug, isFolderIndex: cand.isFolderIndex }
    } catch {
      // try next candidate
    }
  }

  return null
}
