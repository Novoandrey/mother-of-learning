'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { searchItemsAction } from '@/app/actions/items'
import type { ItemNode } from '@/lib/items-types'

export type ItemPick = {
  /** `null` when free-text; the canonical id when an Образец was picked. */
  itemNodeId: string | null
  /** Display string. For linked picks, the canonical title; for free-text, what the user typed. */
  itemName: string
}

type Props = {
  campaignId: string
  campaignSlug: string
  value: ItemPick
  onChange: (next: ItemPick) => void
  /** When true, dropdown shows a «+ Создать» row that opens `/items/new?title=…`. DM-only. */
  canCreateNew: boolean
  /** Player non-action hint when no match. Defaults to true on player-facing forms. */
  showFreeTextHint?: boolean
  disabled?: boolean
  placeholder?: string
  /** Optional id for label association. */
  id?: string
}

/**
 * Item typeahead — spec-015 (T022).
 *
 * Replaces the free-text `item_name` input on every item-row form
 * (transaction form, batch form, encounter loot editor). Behaviour:
 *  - 200 ms debounced search via `searchItemsAction`.
 *  - Dropdown shows up to 10 ranked matches (server-side ranking).
 *  - On pick: fills `itemNodeId` and `itemName` (canonical title from
 *    the catalog); `onChange` fires synchronously.
 *  - On free-text submit (typing without picking): `itemNodeId` stays
 *    null, `itemName` is whatever the user typed.
 *  - When `canCreateNew=true`: dropdown bottom row «+ Создать «<typed>»»
 *    navigates to `/items/new?title=…` so the DM can promote a new
 *    Образец from a half-typed name. Uses a regular link rather than
 *    inline modal — keeps the form mounted, the new item won't apply
 *    to this row but the DM can come back and re-pick.
 *  - When `showFreeTextHint=true` and the search returned 0 results,
 *    a small "не найдено в каталоге — оставлю как текст" footer
 *    reassures players that they can still submit.
 *
 * Source-of-truth: the parent owns `value`. This component is dumb
 * about syncing — `onChange` fires on every meaningful state change.
 *
 * Closing: clicks outside collapse the dropdown. Escape clears focus.
 * Keyboard nav (↑↓/Enter) is intentionally minimal — added if we
 * find we need it.
 */
export default function ItemTypeahead({
  campaignId,
  campaignSlug,
  value,
  onChange,
  canCreateNew,
  showFreeTextHint = false,
  disabled = false,
  placeholder = 'Название предмета',
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value.itemName)
  const [results, setResults] = useState<ItemNode[]>([])
  const [searching, setSearching] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Sync local query when parent updates value (e.g. seed prefill in
  // edit mode). Avoid clobbering the user's in-flight typing — only
  // sync when the parent's name is meaningfully different.
  useEffect(() => {
    if (value.itemName !== query && !open) {
      setQuery(value.itemName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.itemName, value.itemNodeId])

  // Debounced search.
  useEffect(() => {
    if (!open) return
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setResults([])
      setSearching(false)
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      const res = await searchItemsAction(campaignId, trimmed, 10)
      if (cancelled) return
      setSearching(false)
      if (res.ok) setResults(res.items)
      else setResults([])
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, query, campaignId])

  // Click-outside collapses the dropdown.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const onInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value
      setQuery(text)
      // Free-text path — clear the link and propagate the raw text.
      onChange({ itemNodeId: null, itemName: text })
    },
    [onChange],
  )

  const pickItem = useCallback(
    (item: ItemNode) => {
      setQuery(item.title)
      setOpen(false)
      onChange({ itemNodeId: item.id, itemName: item.title })
    },
    [onChange],
  )

  const noResults = useMemo(
    () => open && !searching && query.trim().length > 0 && results.length === 0,
    [open, searching, query, results.length],
  )

  return (
    <div ref={wrapRef} className="relative">
      <input
        id={id}
        type="text"
        value={query}
        onChange={onInput}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      />

      {/* Linked badge — surfaces "this is connected to a catalog entry". */}
      {value.itemNodeId && !open && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-amber-600 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">
          образец
        </span>
      )}

      {open && (query.trim().length > 0 || results.length > 0) && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {searching && (
            <div className="px-3 py-2 text-xs text-gray-400">Поиск…</div>
          )}

          {!searching && results.length > 0 && (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault() // keep input focus
                      pickItem(item)
                    }}
                    className="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-blue-50"
                  >
                    <span className="text-gray-900">{item.title}</span>
                    <span className="text-[10px] text-gray-500">
                      {item.categorySlug}
                      {item.rarity ? ` · ${item.rarity}` : ''}
                      {item.priceGp !== null ? ` · ${item.priceGp} gp` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {noResults && showFreeTextHint && !canCreateNew && (
            <div className="border-t border-gray-100 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-500">
              не найдено в каталоге — оставлю как текст
            </div>
          )}

          {noResults && canCreateNew && (
            <a
              href={`/c/${campaignSlug}/items/new?title=${encodeURIComponent(query.trim())}`}
              className="block border-t border-gray-100 bg-amber-50 px-3 py-2 text-sm text-amber-800 hover:bg-amber-100"
              onMouseDown={(e) => {
                // Allow normal navigation; just prevent input from re-focusing.
                e.stopPropagation()
              }}
            >
              + Создать «{query.trim()}»
            </a>
          )}
        </div>
      )}
    </div>
  )
}
