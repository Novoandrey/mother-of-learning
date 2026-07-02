import { describe, expect, it } from 'vitest'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import type { Root, Link } from 'mdast'

import {
  buildTitleIndex,
  normaliseTitle,
  remarkWikilinks,
  WIKILINK_ID_ATTR,
} from '../wikilinks'

// Parse markdown → mdast → apply the plugin. Returns the transformed tree.
function transform(md: string, index: Map<string, string>): Root {
  const tree = unified().use(remarkParse).parse(md) as Root
  remarkWikilinks(index)(tree)
  return tree
}

// Collect every resolved wikilink node (has the data attr) in document order.
function wikiLinks(tree: Root): Array<{ id: string; text: string }> {
  const out: Array<{ id: string; text: string }> = []
  visit(tree, 'link', (node: Link) => {
    const id = node.data?.hProperties?.[WIKILINK_ID_ATTR]
    if (typeof id === 'string') {
      const text = node.children
        .map((c) => ('value' in c ? (c as { value: string }).value : ''))
        .join('')
      out.push({ id, text })
    }
  })
  return out
}

// Flatten all text-node values in the tree (to assert literal fallbacks survive).
function allText(tree: Root): string {
  let s = ''
  visit(tree, 'text', (n: { value: string }) => {
    s += n.value
  })
  return s
}

const INDEX = buildTitleIndex([
  { id: 'id-zorian', title: 'Зориан' },
  { id: 'id-red-robe', title: 'Красный Маг' },
])

describe('normaliseTitle', () => {
  it('trims and lowercases (ru)', () => {
    expect(normaliseTitle('  Зориан  ')).toBe('зориан')
    expect(normaliseTitle('КРАСНЫЙ Маг')).toBe('красный маг')
  })
})

describe('buildTitleIndex', () => {
  it('maps normalised title → id', () => {
    expect(INDEX.get('зориан')).toBe('id-zorian')
    expect(INDEX.get('красный маг')).toBe('id-red-robe')
  })

  it('first wins on a title collision', () => {
    const idx = buildTitleIndex([
      { id: 'first', title: 'Дубль' },
      { id: 'second', title: 'дубль' },
    ])
    expect(idx.get('дубль')).toBe('first')
  })
})

describe('remarkWikilinks', () => {
  it('resolves a known name to a link carrying the node id', () => {
    const tree = transform('Привет, [[Зориан]]!', INDEX)
    const links = wikiLinks(tree)
    expect(links).toEqual([{ id: 'id-zorian', text: 'Зориан' }])
  })

  it('is case- and whitespace-insensitive on the name', () => {
    const tree = transform('[[  зориАН  ]]', INDEX)
    expect(wikiLinks(tree)).toEqual([{ id: 'id-zorian', text: '  зориАН  ' }])
  })

  it('leaves an unknown name as literal bracketed text (no link)', () => {
    const tree = transform('[[Кто-то Неизвестный]] тут', INDEX)
    expect(wikiLinks(tree)).toEqual([])
    // The literal `[[…]]` is preserved verbatim in the text.
    expect(allText(tree)).toContain('[[Кто-то Неизвестный]]')
  })

  it('handles several links (resolved + unresolved) in one paragraph', () => {
    const tree = transform('[[Зориан]] и [[Аноним]] и [[Красный Маг]]', INDEX)
    expect(wikiLinks(tree)).toEqual([
      { id: 'id-zorian', text: 'Зориан' },
      { id: 'id-red-robe', text: 'Красный Маг' },
    ])
    expect(allText(tree)).toContain('[[Аноним]]')
  })

  it('does NOT touch [[…]] inside a fenced code block', () => {
    const md = ['```', '[[Зориан]]', '```'].join('\n')
    const tree = transform(md, INDEX)
    // No link produced; the code node keeps its raw value.
    expect(wikiLinks(tree)).toEqual([])
    let codeValue = ''
    visit(tree, 'code', (n: { value: string }) => {
      codeValue += n.value
    })
    expect(codeValue).toContain('[[Зориан]]')
  })

  it('does NOT touch [[…]] inside inline code', () => {
    const tree = transform('текст `[[Зориан]]` ещё', INDEX)
    expect(wikiLinks(tree)).toEqual([])
    let inline = ''
    visit(tree, 'inlineCode', (n: { value: string }) => {
      inline += n.value
    })
    expect(inline).toContain('[[Зориан]]')
  })

  it('preserves surrounding text around a resolved link', () => {
    const tree = transform('до [[Зориан]] после', INDEX)
    const text = allText(tree)
    expect(text).toContain('до ')
    expect(text).toContain(' после')
  })

  it('no-ops cleanly when there are no wikilinks', () => {
    const tree = transform('обычный **markdown** без ссылок', INDEX)
    expect(wikiLinks(tree)).toEqual([])
  })
})
