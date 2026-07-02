'use client'

/* eslint-disable @next/next/no-img-element */

/**
 * Telegram Mini App — wiki/catalog (spec-030, Phase 2). Read-only browsing of
 * the campaign's people & creatures: a searchable list of character/npc/creature
 * nodes → a node view with a dark, touch-friendly portrait carousel + the
 * markdown article. No editing here (that's spec-021).
 *
 * Dark-native by design: the desktop PortraitCarousel / MarkdownContent are
 * light (bg-white) and can't be reused on the /tg neutral-950 surface, so this
 * file ships its own dark carousel + a tiny read-only markdown renderer.
 */

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { portraitUrl, type Portrait } from '@/lib/portraits'
import {
  getWikiNodes,
  getWikiNode,
  type WikiListItem,
  type WikiNode,
  type WikiType,
} from '@/lib/queries/wiki-tg'
import { initialOf } from './format'

// Russian labels for the three catalog types (badge + section headings).
const TYPE_LABEL: Record<WikiType, string> = {
  character: 'персонаж',
  npc: 'непись',
  creature: 'существо',
}

// ─────────────────────────── shared bits ───────────────────────────

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center text-sm text-neutral-400">
      {children}
    </div>
  )
}

function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mb-4 text-sm text-neutral-400 transition-colors hover:text-neutral-200"
    >
      ← {children}
    </button>
  )
}

/** Small portrait <img> with resized-thumbnail src + fallback to the full
 *  object if Cloudflare Image-Resizing isn't enabled (mirrors ledger SmartImg). */
function SmartImg({
  keyStr,
  width,
  alt,
  className,
  style,
  eager,
}: {
  keyStr: string
  width: number
  alt: string
  className?: string
  style?: React.CSSProperties
  eager?: boolean
}) {
  const original = portraitUrl(keyStr) ?? undefined
  const [src, setSrc] = useState<string | undefined>(portraitUrl(keyStr, { width }) ?? undefined)
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => {
        if (src !== original) setSrc(original)
      }}
    />
  )
}

/** Round mini-avatar for a list row: portrait if present, else a letter chip. */
function Avatar({ name, keyStr, size }: { name: string; keyStr: string | null; size: number }) {
  const style = { width: size, height: size }
  if (keyStr && portraitUrl(keyStr)) {
    return (
      <SmartImg
        keyStr={keyStr}
        width={96}
        alt={name}
        style={style}
        className="shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <div
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-neutral-700 font-semibold text-neutral-200"
    >
      {initialOf(name)}
    </div>
  )
}

function TypeBadge({ type }: { type: WikiType }) {
  return (
    <span className="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-[11px] text-neutral-400">
      {TYPE_LABEL[type]}
    </span>
  )
}

// ─────────────────────────── list screen ───────────────────────────

export function WikiListScreen({
  supabase,
  campaignId,
  onSelect,
  onBack,
}: {
  supabase: SupabaseClient
  campaignId: string
  onSelect: (item: WikiListItem) => void
  onBack: () => void
}) {
  const [items, setItems] = useState<WikiListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const rows = await getWikiNodes(supabase, campaignId)
        if (alive) setItems(rows)
      } catch {
        if (alive) setError('Не удалось загрузить каталог.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId])

  const shown = useMemo(() => {
    if (!items) return []
    const q = query.trim().toLocaleLowerCase('ru')
    if (!q) return items
    return items.filter((it) => it.title.toLocaleLowerCase('ru').includes(q))
  }, [items, query])

  return (
    <div className="mx-auto max-w-sm pb-6">
      <BackLink onClick={onBack}>назад</BackLink>
      <h1 className="mb-3 text-lg font-semibold">Каталог</h1>

      <input
        className="mb-4 w-full rounded-lg bg-neutral-800 px-3 py-2 text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
        placeholder="Поиск по имени…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error && <Centered>{error}</Centered>}
      {!error && !items && <Centered>Загрузка…</Centered>}
      {items && shown.length === 0 && (
        <p className="px-1 py-6 text-sm text-neutral-500">
          {query.trim() ? 'Никого не нашлось.' : 'В каталоге пока пусто.'}
        </p>
      )}
      {shown.length > 0 && (
        <ul className="space-y-2">
          {shown.map((it) => (
            <li key={it.id}>
              <button
                onClick={() => onSelect(it)}
                className="flex w-full items-center gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-left transition-colors hover:bg-neutral-800"
              >
                <Avatar name={it.title} keyStr={it.primaryPortraitKey} size={40} />
                <span className="min-w-0 flex-1 truncate font-medium">{it.title}</span>
                <TypeBadge type={it.type} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────── node screen ───────────────────────────

export function WikiNodeScreen({
  supabase,
  nodeId,
  title,
  onBack,
}: {
  supabase: SupabaseClient
  nodeId: string
  /** Title from the list row — shown immediately, before the body loads. */
  title: string
  onBack: () => void
}) {
  // Keyed on nodeId by the parent, so a new node remounts this component with
  // fresh null state — no need to reset inside the effect (which the
  // set-state-in-effect lint rule forbids).
  const [node, setNode] = useState<WikiNode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const n = await getWikiNode(supabase, nodeId)
        if (alive) setNode(n)
      } catch {
        if (alive) setError('Не удалось загрузить статью.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, nodeId])

  return (
    <div className="mx-auto max-w-sm pb-10">
      <BackLink onClick={onBack}>каталог</BackLink>
      <h1 className="mb-3 text-lg font-semibold">{node?.title ?? title}</h1>

      {error && <Centered>{error}</Centered>}
      {!error && !node && <Centered>Загрузка…</Centered>}
      {node && (
        <>
          <DarkCarousel name={node.title} portraits={node.portraits} />
          <Article content={node.content} />
        </>
      )}
    </div>
  )
}

/**
 * Dark, touch-friendly portrait carousel for /tg. Renders nothing when the node
 * has no portraits (same rule as the desktop carousel). Arrows wrap around;
 * dots jump. Swipe isn't wired — arrows + dots are enough on a phone.
 */
function DarkCarousel({ name, portraits }: { name: string; portraits: Portrait[] }) {
  const [idx, setIdx] = useState(0)
  if (portraits.length === 0) return null

  const clamped = Math.min(idx, portraits.length - 1)
  const cur = portraits[clamped]
  const multi = portraits.length > 1

  const go = (delta: number) =>
    setIdx((i) => {
      const n = portraits.length
      return (((i + delta) % n) + n) % n
    })

  return (
    <div className="mb-4 rounded-2xl bg-neutral-900 p-3">
      <div className="relative mx-auto">
        <SmartImg
          key={cur.r2_key}
          keyStr={cur.r2_key}
          width={768}
          alt={name}
          className="mx-auto max-h-[60vh] w-full rounded-lg object-contain"
          eager
        />

        {multi && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Предыдущий портрет"
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white transition-colors hover:bg-black/70"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Следующий портрет"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white transition-colors hover:bg-black/70"
            >
              ›
            </button>
            <div className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-xs text-white">
              {clamped + 1}/{portraits.length}
            </div>
          </>
        )}
      </div>

      {cur.caption && (
        <p className="mt-2 text-center text-sm text-neutral-400">{cur.caption}</p>
      )}

      {multi && (
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {portraits.map((p, i) => (
            <button
              key={p.r2_key}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Портрет ${i + 1}${p.caption ? `: ${p.caption}` : ''}`}
              aria-current={i === clamped}
              className={`h-2 w-2 rounded-full transition-colors ${
                i === clamped ? 'bg-neutral-300' : 'bg-neutral-600 hover:bg-neutral-500'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Read-only markdown article, dark prose. Soft placeholder when empty. */
function Article({ content }: { content: string }) {
  if (!content.trim()) {
    return <p className="px-1 py-4 text-sm italic text-neutral-500">Статья пока пустая.</p>
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-neutral-100 prose-a:text-blue-400 prose-strong:text-neutral-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
