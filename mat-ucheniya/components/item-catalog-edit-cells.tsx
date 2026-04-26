'use client'

/**
 * Inline-edit cells для каталога предметов.
 *
 * Click-to-edit, Enter / blur — save, Escape — cancel.
 * Все три cell'а вызывают `quickUpdateItemAction` со своим
 * partial patch. На success — `router.refresh()`; на fail —
 * inline error sub-row через alert().
 *
 * Не используется `useOptimistic` — для grid'а лишний complexity;
 * router.refresh() даёт consistent state с одним server roundtrip.
 */

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { quickUpdateItemAction } from '@/app/actions/items'

// ---------- Text (title) ----------

export function EditableTitleCell({
  campaignId,
  itemId,
  value,
  onCancel,
}: {
  campaignId: string
  itemId: string
  value: string
  onCancel: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(value)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function save() {
    const trimmed = draft.trim()
    if (trimmed === '' || trimmed === value) {
      onCancel()
      return
    }
    startTransition(async () => {
      const result = await quickUpdateItemAction(campaignId, itemId, {
        title: trimmed,
      })
      if (!result.ok) {
        alert(result.error)
        return
      }
      router.refresh()
      onCancel()
    })
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          save()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      disabled={isPending}
      maxLength={200}
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  )
}

// ---------- Number (price) ----------

export function EditablePriceCell({
  campaignId,
  itemId,
  value,
  onCancel,
}: {
  campaignId: string
  itemId: string
  value: number | null
  onCancel: () => void
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function save() {
    const trimmed = draft.trim()
    const newPrice = trimmed === '' ? null : Number(trimmed)
    if (newPrice !== null && (!Number.isFinite(newPrice) || newPrice < 0)) {
      alert('Цена должна быть неотрицательным числом')
      return
    }
    if (newPrice === value) {
      onCancel()
      return
    }
    startTransition(async () => {
      const result = await quickUpdateItemAction(campaignId, itemId, {
        priceGp: newPrice,
      })
      if (!result.ok) {
        alert(result.error)
        return
      }
      router.refresh()
      onCancel()
    })
  }

  return (
    <input
      ref={inputRef}
      type="number"
      step="0.01"
      min="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          save()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      disabled={isPending}
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-right font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  )
}

// ---------- Select (source) ----------

export function EditableSourceCell({
  campaignId,
  itemId,
  value,
  options,
  onCancel,
}: {
  campaignId: string
  itemId: string
  value: string | null
  options: Array<{ slug: string; label: string }>
  onCancel: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const selectRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    selectRef.current?.focus()
  }, [])

  function save(next: string | null) {
    if (next === value) {
      onCancel()
      return
    }
    startTransition(async () => {
      const result = await quickUpdateItemAction(campaignId, itemId, {
        sourceSlug: next,
      })
      if (!result.ok) {
        alert(result.error)
        return
      }
      router.refresh()
      onCancel()
    })
  }

  return (
    <select
      ref={selectRef}
      value={value ?? ''}
      onChange={(e) => save(e.target.value === '' ? null : e.target.value)}
      onBlur={onCancel}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      disabled={isPending}
      className="w-full rounded border border-blue-400 bg-white px-1 py-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o.slug} value={o.slug}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
