'use client'

/* eslint-disable @next/next/no-img-element */

/**
 * Telegram Mini App — wiki/catalog (spec-030 read + spec-021 edit). Browse the
 * campaign's people & creatures: a searchable list of character/npc/creature
 * nodes → a node view with a dark, touch-friendly portrait carousel + the
 * markdown article. spec-021 adds in-place editing of the article body and
 * `[[wikilinks]]` between nodes.
 *
 * Dark-native by design: the desktop PortraitCarousel / MarkdownContent are
 * light (bg-white) and can't be reused on the /tg neutral-950 surface, so this
 * file ships its own dark carousel + a tiny markdown renderer/editor.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import type { PluggableList } from 'unified'
import remarkGfm from 'remark-gfm'
import { portraitUrl, type Portrait } from '@/lib/portraits'
import {
  getWikiNodes,
  getWikiNode,
  type WikiListItem,
  type WikiNode,
  type WikiType,
} from '@/lib/queries/wiki-tg'
import { buildTitleIndex, remarkWikilinks, WIKILINK_ID_ATTR } from '@/lib/wikilinks'
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
  campaignId,
  nodeId,
  title,
  onBack,
  onOpenNode,
}: {
  supabase: SupabaseClient
  campaignId: string
  nodeId: string
  /** Title from the list row — shown immediately, before the body loads. */
  title: string
  onBack: () => void
  /** Open another node in-app (wikilink tap). */
  onOpenNode: (nodeId: string, title: string) => void
}) {
  // Keyed on nodeId by the parent, so a new node remounts this component with
  // fresh null state — no need to reset inside the effect (which the
  // set-state-in-effect lint rule forbids).
  const [node, setNode] = useState<WikiNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Title→id index for resolving [[wikilinks]] (character+npc+creature). Loaded
  // once alongside the node; an empty map just means every link stays plain text.
  const [titleIndex, setTitleIndex] = useState<Map<string, string>>(() => new Map())
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // Node body + the campaign's title index in parallel. The index is a
        // nice-to-have for links, so a failure there doesn't block the article.
        const [n, list] = await Promise.all([
          getWikiNode(supabase, nodeId),
          getWikiNodes(supabase, campaignId).catch(() => [] as WikiListItem[]),
        ])
        if (!alive) return
        setNode(n)
        setTitleIndex(buildTitleIndex(list))
      } catch {
        if (alive) setError('Не удалось загрузить статью.')
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase, campaignId, nodeId])

  // Every campaign member may edit every campaign node. See canEditNode
  // (lib/auth.ts); keeping the affordance visible avoids a mobile-only gap.
  const canEdit = node != null

  return (
    <div className="mx-auto max-w-sm pb-10">
      <BackLink onClick={onBack}>каталог</BackLink>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">
          {node?.title ?? title}
        </h1>
        {canEdit && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="shrink-0 text-sm text-blue-400 transition-colors hover:text-blue-300"
          >
            Редактировать
          </button>
        )}
      </div>

      {error && <Centered>{error}</Centered>}
      {!error && !node && <Centered>Загрузка…</Centered>}
      {node && (
        <>
          <DarkCarousel name={node.title} portraits={node.portraits} campaignId={campaignId} />
          {editing ? (
            <ArticleEditor
              nodeId={nodeId}
              initialContent={node.content}
              titleIndex={titleIndex}
              onCancel={() => setEditing(false)}
              onSaved={(content) => {
                setNode((prev) => (prev ? { ...prev, content } : prev))
                setEditing(false)
              }}
            />
          ) : (
            <Article
              content={node.content}
              titleIndex={titleIndex}
              onOpenNode={onOpenNode}
            />
          )}
        </>
      )}
    </div>
  )
}

/**
 * Dark markdown editor for /tg: textarea + live preview + Save/Cancel. Saves
 * through the same gated route the desktop editor uses
 * (`PUT /api/nodes/[id]/content`). Draft is kept in local state only — no
 * cross-reload autosave here (that hook is desktop-shaped); losing an unsaved
 * /tg edit on reload is an acceptable v1 gap.
 */
function ArticleEditor({
  nodeId,
  initialContent,
  titleIndex,
  onCancel,
  onSaved,
}: {
  nodeId: string
  initialContent: string
  titleIndex: Map<string, string>
  onCancel: () => void
  onSaved: (content: string) => void
}) {
  const [draft, setDraft] = useState(initialContent)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/content`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (res.status === 403) {
        setErr('Нет прав на редактирование.')
        return
      }
      if (!res.ok) {
        setErr('Не удалось сохранить. Попробуй ещё раз.')
        return
      }
      onSaved(draft)
    } catch {
      setErr('Сеть недоступна. Попробуй позже.')
    } finally {
      setSaving(false)
    }
  }, [nodeId, draft, onSaved])

  return (
    <div className="rounded-2xl bg-neutral-900 p-3">
      <div className="mb-2 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-lg px-3 py-1.5 text-sm text-neutral-400 transition-colors hover:text-neutral-200 disabled:opacity-50"
        >
          Отмена
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
      </div>

      {err && (
        <p className="mb-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-300">{err}</p>
      )}

      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Markdown: # Заголовок, **жирно**, - списки, [[Ссылка на ноду]]…"
        className="min-h-[240px] w-full resize-y rounded-lg bg-neutral-800 p-3 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 outline-none focus:ring-1 focus:ring-neutral-600"
        autoFocus
      />

      {draft.trim() && (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Превью
          </div>
          {/* Preview resolves links but they aren't tappable here (no navigation
              mid-edit) — rendered muted so it reads as preview, not live. */}
          <Article content={draft} titleIndex={titleIndex} onOpenNode={null} />
        </div>
      )}
    </div>
  )
}

/**
 * Dark, touch-friendly portrait carousel for /tg. Renders nothing when the node
 * has no portraits (same rule as the desktop carousel). Arrows wrap around;
 * dots jump. Swipe isn't wired — arrows + dots are enough on a phone.
 */
function DarkCarousel({ name, portraits, campaignId }: { name: string; portraits: Portrait[]; campaignId: string }) {
  portraits = portraits.filter((portrait) => !!portrait.media_asset_id)
  const [idx, setIdx] = useState(0)
  const [cutoutUrls, setCutoutUrls] = useState<Map<string, string>>(() => new Map())
  const [showCutout, setShowCutout] = useState(false)
  const assetIdsParam = portraits.flatMap((portrait) => portrait.media_asset_id ? [portrait.media_asset_id] : []).join(',')

  useEffect(() => {
    if (!assetIdsParam) return
    let alive = true
    void fetch(`/api/media/renditions?campaignId=${encodeURIComponent(campaignId)}&rendition=cutout&assetIds=${assetIdsParam}`)
      .then((response) => response.ok ? response.json() as Promise<{ items?: Array<{ assetId: string; status: string; url?: string }> }> : null)
      .then((data) => {
        if (!alive || !data) return
        setCutoutUrls(new Map((data.items ?? []).flatMap((item) => item.status === 'ready' && item.url ? [[item.assetId, item.url] as const] : [])))
      })
      .catch(() => { if (alive) setCutoutUrls(new Map()) })
    return () => { alive = false }
  }, [campaignId, assetIdsParam])
  if (portraits.length === 0) return null

  const clamped = Math.min(idx, portraits.length - 1)
  const cur = portraits[clamped]
  const multi = portraits.length > 1
  const cutoutUrl = cur.media_asset_id ? cutoutUrls.get(cur.media_asset_id) : null

  const go = (delta: number) =>
    setIdx((i) => {
      const n = portraits.length
      return (((i + delta) % n) + n) % n
    })

  return (
    <div className="mb-4 rounded-2xl bg-neutral-900 p-3">
      <div className="relative mx-auto">
        {showCutout && cutoutUrl ? (
          <img src={cutoutUrl} alt={`${name}, силуэт без фона`} className="mx-auto max-h-[60vh] w-full rounded-lg object-contain" />
        ) : (
          <SmartImg key={cur.id} keyStr={cur.r2_key ?? ''} width={768} alt={name} className="mx-auto max-h-[60vh] w-full rounded-lg object-contain" eager />
        )}

        {cutoutUrl && (
          <button type="button" onClick={() => setShowCutout((shown) => !shown)} className="absolute bottom-2 left-2 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white transition-colors hover:bg-black/70">
            {showCutout ? 'Портрет' : 'Силуэт'}
          </button>
        )}

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
              key={p.id}
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

/**
 * Markdown article, dark prose, with `[[wikilinks]]` resolved against
 * `titleIndex`. When `onOpenNode` is a function, a resolved link is a tappable
 * button that navigates in-app; when null (edit preview) it renders inert.
 * Unresolved `[[Name]]` degrades to the plain bracketed text (never a link).
 */
function Article({
  content,
  titleIndex,
  onOpenNode,
}: {
  content: string
  titleIndex: Map<string, string>
  onOpenNode: ((nodeId: string, title: string) => void) | null
}) {
  // Tuple form `[attacher, options]` — unified's plugin contract. Passing the
  // bare transformer `remarkWikilinks(titleIndex)` makes unified call it with no
  // tree and crash. See lib/wikilinks.ts.
  const plugins = useMemo<PluggableList>(
    () => [remarkGfm, [remarkWikilinks, titleIndex]],
    [titleIndex],
  )

  if (!content.trim()) {
    return <p className="px-1 py-4 text-sm italic text-neutral-500">Статья пока пустая.</p>
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-headings:text-neutral-100 prose-a:text-blue-400 prose-strong:text-neutral-100">
      <ReactMarkdown
        remarkPlugins={plugins}
        components={{
          a({ node, children, href, ...rest }) {
            // hProperties are copied verbatim onto the hast node, so the key is
            // the literal attr string (not camelCased — that only happens when
            // the DOM element is built).
            const wikiId = node?.properties?.[WIKILINK_ID_ATTR] as string | undefined
            if (wikiId) {
              const label = typeof children === 'string' ? children : String(children)
              // Inline button styled like a link — tap opens the node in-app.
              return (
                <button
                  type="button"
                  onClick={() => onOpenNode?.(wikiId, label)}
                  disabled={!onOpenNode}
                  className="text-blue-400 underline underline-offset-2 transition-colors hover:text-blue-300 disabled:no-underline disabled:opacity-80"
                >
                  {children}
                </button>
              )
            }
            // Normal link — open external targets in a new tab.
            return (
              <a href={href} target="_blank" rel="noreferrer noopener" {...rest}>
                {children}
              </a>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
