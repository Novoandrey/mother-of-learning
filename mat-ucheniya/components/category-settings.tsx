'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  createCategoryAction,
  renameCategoryAction,
  restoreCategoryAction,
  softDeleteCategoryAction,
} from '@/app/actions/categories'
import type { Category } from '@/lib/transactions'

export type CategoryScope = 'transaction' | 'item'

type Props = {
  campaignId: string
  scope: CategoryScope
  /** Initial list — server component has already fetched. */
  initial: Category[]
  /** When false, the UI is read-only (non-DM viewer). */
  canEdit: boolean
}

/**
 * DM-facing category taxonomy editor.
 *
 * List active categories with inline rename + soft-delete; collapsed
 * section below shows soft-deleted rows with a restore affordance.
 * "+ Add" inline form at the bottom.
 *
 * `scope` prop is the reuse hook for spec-015 item categories.
 */
export default function CategorySettings({
  campaignId,
  scope,
  initial,
  canEdit,
}: Props) {
  const router = useRouter()
  // Mirror the prefetched list in state so optimistic updates feel instant.
  // A `router.refresh()` after every action keeps the server-side source
  // of truth in sync.
  const [rows, setRows] = useState<Category[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const active = rows.filter((r) => !r.is_deleted)
  const deleted = rows.filter((r) => r.is_deleted)
  const [showDeleted, setShowDeleted] = useState(false)

  const runAction = useCallback(
    async (task: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
      setBusy(true)
      setError(null)
      try {
        const res = await task()
        if (!res.ok) {
          setError(res.error)
          return false
        }
        router.refresh()
        return true
      } finally {
        setBusy(false)
      }
    },
    [router],
  )

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Активные
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-gray-400">Ни одной активной категории</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {active.map((c) => (
              <CategoryRow
                key={c.slug}
                category={c}
                canEdit={canEdit}
                busy={busy}
                onRename={async (newLabel) => {
                  const ok = await runAction(() =>
                    renameCategoryAction(campaignId, scope, c.slug, newLabel),
                  )
                  if (ok) {
                    setRows((prev) =>
                      prev.map((r) =>
                        r.slug === c.slug ? { ...r, label: newLabel } : r,
                      ),
                    )
                  }
                  return ok
                }}
                onSoftDelete={async () => {
                  const ok = await runAction(() =>
                    softDeleteCategoryAction(campaignId, scope, c.slug),
                  )
                  if (ok) {
                    setRows((prev) =>
                      prev.map((r) =>
                        r.slug === c.slug ? { ...r, is_deleted: true } : r,
                      ),
                    )
                  }
                }}
              />
            ))}
          </ul>
        )}
      </section>

      {canEdit && (
        <AddCategoryForm
          busy={busy}
          onCreate={async (slug, label) => {
            const ok = await runAction(() =>
              createCategoryAction(campaignId, scope, slug, label),
            )
            if (ok) {
              // Best-effort optimistic append. `router.refresh()` reloads
              // authoritative data immediately after.
              setRows((prev) => [
                ...prev,
                {
                  slug,
                  label,
                  sort_order: Number.MAX_SAFE_INTEGER,
                  is_deleted: false,
                },
              ])
            }
            return ok
          }}
        />
      )}

      {deleted.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className="text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600"
          >
            Удалённые ({deleted.length}) {showDeleted ? '▾' : '▸'}
          </button>
          {showDeleted && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {deleted.map((c) => (
                <li
                  key={c.slug}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-gray-500 line-through">
                      {c.label}
                    </span>
                    <span className="text-xs text-gray-400">{c.slug}</span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await runAction(() =>
                          restoreCategoryAction(campaignId, scope, c.slug),
                        )
                        if (ok) {
                          setRows((prev) =>
                            prev.map((r) =>
                              r.slug === c.slug ? { ...r, is_deleted: false } : r,
                            ),
                          )
                        }
                      }}
                      disabled={busy}
                      className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                    >
                      восст.
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

// ─────────── sub-components ───────────

function CategoryRow({
  category,
  canEdit,
  busy,
  onRename,
  onSoftDelete,
}: {
  category: Category
  canEdit: boolean
  busy: boolean
  onRename: (newLabel: string) => Promise<boolean>
  onSoftDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draftLabel, setDraftLabel] = useState(category.label)

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {editing ? (
          <input
            type="text"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            autoFocus
            onKeyDown={async (e) => {
              if (e.key === 'Enter') {
                if (draftLabel.trim() && draftLabel.trim() !== category.label) {
                  const ok = await onRename(draftLabel.trim())
                  if (ok) setEditing(false)
                } else {
                  setEditing(false)
                }
              } else if (e.key === 'Escape') {
                setDraftLabel(category.label)
                setEditing(false)
              }
            }}
            disabled={busy}
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <span className="truncate text-sm font-medium text-gray-900">
            {category.label}
          </span>
        )}
        <span className="text-xs text-gray-400">{category.slug}</span>
      </div>
      {canEdit && (
        <div className="flex flex-shrink-0 items-center gap-2">
          {editing ? (
            <button
              type="button"
              onClick={async () => {
                if (draftLabel.trim() && draftLabel.trim() !== category.label) {
                  const ok = await onRename(draftLabel.trim())
                  if (ok) setEditing(false)
                } else {
                  setEditing(false)
                }
              }}
              disabled={busy}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              сохр.
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              изм.
            </button>
          )}
          <button
            type="button"
            onClick={onSoftDelete}
            disabled={busy}
            className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            уд.
          </button>
        </div>
      )}
    </li>
  )
}

function AddCategoryForm({
  busy,
  onCreate,
}: {
  busy: boolean
  onCreate: (slug: string, label: string) => Promise<boolean>
}) {
  const [slug, setSlug] = useState('')
  const [label, setLabel] = useState('')
  const [expanded, setExpanded] = useState(false)

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        disabled={busy}
        className="self-start rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        + Добавить категорию
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <div className="flex flex-col gap-2 md:flex-row">
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs text-gray-500">slug (a-z 0-9 _ -)</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            placeholder="напр. tax"
            disabled={busy}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-1 flex-col gap-0.5">
          <span className="text-xs text-gray-500">Название</span>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="напр. Налог"
            disabled={busy}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            const ok = await onCreate(slug, label)
            if (ok) {
              setSlug('')
              setLabel('')
              setExpanded(false)
            }
          }}
          disabled={busy || !slug || !label.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Создать
        </button>
        <button
          type="button"
          onClick={() => {
            setSlug('')
            setLabel('')
            setExpanded(false)
          }}
          disabled={busy}
          className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
        >
          отмена
        </button>
      </div>
    </div>
  )
}
