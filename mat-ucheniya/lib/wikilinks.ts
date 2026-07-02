/**
 * Wikilinks (spec-021): `[[Точное название ноды]]` in a markdown body becomes a
 * click/tap link to that node. Shared by the desktop reader (MarkdownContent)
 * and the /tg reader (Article) — both feed the same remark plugin to
 * react-markdown, then override the `a` renderer for their surface.
 *
 * Zero new deps: `unist-util-visit` is a *direct* dependency of react-markdown
 * (see its package.json), so it's always installed alongside it.
 *
 * How resolution works:
 *   - We build a Map from a normalised title → node id (see `buildTitleIndex`).
 *   - The remark plugin walks text nodes, splits out `[[...]]` spans, and for a
 *     name that resolves emits a `link` node carrying `data-wikilink-id` (the
 *     node id) via mdast `data.hProperties`. Unresolved names stay plain text
 *     `[[Name]]` — a dangling link renders as muted text, never a broken href.
 *   - The `a` component override keys off `data-wikilink-id`: desktop wraps it
 *     in a Next <Link> to the catalog page; /tg turns it into an in-app button.
 *
 * Code blocks / inline code: `visit` only ever hands us `text` nodes, and
 * fenced/inline code parse into `code` / `inlineCode` nodes whose value is NOT
 * a `text` child — so `[[x]]` inside code is left untouched automatically. (A
 * `[[x]]` typed inside *emphasis* etc. still resolves, which is fine.)
 */

import type { Root, Text, Link, PhrasingContent } from 'mdast'
import { visit } from 'unist-util-visit'

/** Matches `[[Anything but brackets]]`. Global so we can walk every hit. */
const WIKILINK_RE = /\[\[([^[\]]+)\]\]/g

/** Attribute the plugin stamps on resolved links; the `a` override reads it. */
export const WIKILINK_ID_ATTR = 'data-wikilink-id'

/** A catalog node reduced to what wikilink resolution needs. */
export type WikiTitleEntry = { id: string; title: string }

/**
 * Normalise a title for lookup: trim + lowercase (Russian locale). Keeps the
 * match forgiving about surrounding spaces and case while still requiring the
 * *name* to match exactly (no fuzzy/partial matching in v1).
 */
export function normaliseTitle(title: string): string {
  return title.trim().toLocaleLowerCase('ru')
}

/**
 * Build the normalised-title → id lookup from a list of nodes. On a title
 * collision the first wins (stable: callers pass an already-ordered list);
 * collisions are rare in practice and last-write-wins here would only flip
 * which of two same-named nodes a link points at.
 */
export function buildTitleIndex(
  nodes: ReadonlyArray<WikiTitleEntry>,
): Map<string, string> {
  const index = new Map<string, string>()
  for (const n of nodes) {
    const key = normaliseTitle(n.title)
    if (key && !index.has(key)) index.set(key, n.id)
  }
  return index
}

/**
 * remark plugin factory. Give it a title→id index; it returns a transformer
 * that rewrites `[[Name]]` spans in place. Resolved → `link` node with the id
 * in hProperties; unresolved → literal `[[Name]]` text (untouched-looking).
 */
export function remarkWikilinks(titleIndex: Map<string, string>) {
  return (tree: Root) => {
    visit(tree, 'text', (node: Text, index, parent) => {
      if (parent == null || index == null) return
      // Cheap bail-out: no `[[` at all → nothing to do for this node.
      if (!node.value.includes('[[')) return

      const value = node.value
      const replacement: PhrasingContent[] = []
      let last = 0
      let matched = false

      WIKILINK_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WIKILINK_RE.exec(value)) !== null) {
        const [full, rawName] = m
        const start = m.index
        const id = titleIndex.get(normaliseTitle(rawName))

        // Text before this hit (if any) stays as a plain text node.
        if (start > last) {
          replacement.push({ type: 'text', value: value.slice(last, start) })
        }

        if (id) {
          matched = true
          const link: Link = {
            type: 'link',
            // Harmless href; the real target lives in the data attr so it
            // survives react-markdown's urlTransform sanitiser untouched.
            url: '#',
            children: [{ type: 'text', value: rawName }],
            data: { hProperties: { [WIKILINK_ID_ATTR]: id } },
          }
          replacement.push(link)
        } else {
          // Unresolved — keep the literal text, brackets and all.
          replacement.push({ type: 'text', value: full })
        }

        last = start + full.length
      }

      if (!matched && replacement.length === 0) return

      // Trailing text after the last hit.
      if (last < value.length) {
        replacement.push({ type: 'text', value: value.slice(last) })
      }

      // Splice our nodes in place of the original single text node.
      parent.children.splice(index, 1, ...replacement)
      // Skip past the nodes we just inserted so visit doesn't re-scan them.
      return index + replacement.length
    })
  }
}
