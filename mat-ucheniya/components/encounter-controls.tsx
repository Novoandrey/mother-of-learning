'use client'

/**
 * IDEA-055 — DM controls on encounter detail page: rename + delete.
 *
 * Mounted only when `canEdit === true` (DM/owner). Players don't see
 * this strip at all.
 *
 * Rename: pencil icon → input replaces title → Enter saves / Esc
 * cancels. Optimistic UI: input value seeds the new title; on success
 * `router.refresh()` re-renders the page with the persisted value.
 *
 * Delete: trash icon → native `window.confirm` (matches existing
 * pattern in `encounter-list-page.tsx`) → on confirm, action runs
 * and `router.push` jumps to the encounters list.
 */

import { Pencil, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  deleteEncounter,
  renameEncounter,
} from '@/app/actions/encounter-meta'

export function EncounterControls({
  encounterId,
  campaignSlug,
  initialTitle,
}: {
  encounterId: string
  campaignSlug: string
  initialTitle: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialTitle)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commitRename() {
    if (draft.trim() === initialTitle) {
      setEditing(false)
      return
    }
    setPending(true)
    setError(null)
    try {
      const r = await renameEncounter(encounterId, draft)
      if (r.ok) {
        setEditing(false)
        router.refresh()
      } else {
        setError(r.error)
      }
    } finally {
      setPending(false)
    }
  }

  function cancelRename() {
    setDraft(initialTitle)
    setEditing(false)
    setError(null)
  }

  async function handleDelete() {
    if (
      !window.confirm(
        `Удалить энкаунтер «${initialTitle}»? Это удалит всех участников, лог, лут и не может быть отменено.`,
      )
    ) {
      return
    }
    setPending(true)
    setError(null)
    try {
      const r = await deleteEncounter(encounterId)
      if (r.ok) {
        router.push(`/c/${r.campaignSlug}/encounters`)
      } else {
        setError(r.error)
        setPending(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPending(false)
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <input
          type="text"
          value={draft}
          autoFocus
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            else if (e.key === 'Escape') cancelRename()
          }}
          className="rounded border border-gray-300 px-2 py-1 text-sm flex-1 max-w-md"
          placeholder="Название энкаунтера"
        />
        <button
          type="button"
          onClick={commitRename}
          disabled={pending || draft.trim().length === 0}
          className="rounded bg-emerald-700 px-3 py-1 text-white hover:bg-emerald-800 disabled:opacity-50"
        >
          Сохранить
        </button>
        <button
          type="button"
          onClick={cancelRename}
          disabled={pending}
          className="rounded border border-gray-300 px-3 py-1 hover:bg-gray-50 disabled:opacity-50"
        >
          Отмена
        </button>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <button
        type="button"
        onClick={() => {
          setDraft(initialTitle)
          setEditing(true)
        }}
        disabled={pending}
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
        title="Переименовать"
        aria-label="Переименовать энкаунтер"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
        title="Удалить"
        aria-label="Удалить энкаунтер"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error && <span className="text-xs text-red-700 ml-2">{error}</span>}
      {/* campaignSlug consumed by handleDelete via the action result, kept
          on the prop list to make the call site explicit about which
          campaign the controls operate on. */}
      <input type="hidden" value={campaignSlug} readOnly />
    </div>
  )
}
