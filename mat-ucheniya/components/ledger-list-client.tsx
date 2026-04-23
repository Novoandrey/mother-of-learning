'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import LedgerRow from './ledger-row'
import TransactionFormSheet from './transaction-form-sheet'
import {
  deleteTransaction,
  loadLedgerPage,
} from '@/app/actions/transactions'
import type {
  Category,
  LedgerFilters,
  TransactionWithRelations,
} from '@/lib/transactions'

type Props = {
  campaignId: string
  campaignSlug: string
  currentUserId: string
  canManage: boolean
  categories: Category[]
  initialRows: TransactionWithRelations[]
  initialNextCursor: string | null
  filters: LedgerFilters
  pageSize: number
}

/**
 * Client side of the ledger: accumulates additional pages via
 * "Load more", owns the shared form sheet for edit flows, and
 * routes delete actions through `deleteTransaction`.
 *
 * Edit sheet works in two directions: on success, the sheet closes
 * and `router.refresh()` is fired so the server component re-runs
 * the page query and the edited row re-materializes with the new
 * values. Appended pages (not yet on the server) stay in local
 * state, and the refresh rebuilds them.
 */
export default function LedgerListClient({
  campaignId,
  campaignSlug,
  currentUserId,
  canManage,
  categories,
  initialRows,
  initialNextCursor,
  filters,
  pageSize,
}: Props) {
  const router = useRouter()

  const [rows, setRows] = useState<TransactionWithRelations[]>(initialRows)
  const [cursor, setCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editing, setEditing] = useState<TransactionWithRelations | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return
    setLoading(true)
    setLoadError(null)
    try {
      const res = await loadLedgerPage(campaignId, filters, cursor, pageSize)
      if (!res.ok) {
        setLoadError(res.error)
        return
      }
      setRows((prev) => [...prev, ...res.page.rows])
      setCursor(res.page.nextCursor)
    } finally {
      setLoading(false)
    }
  }, [campaignId, cursor, filters, loading, pageSize])

  const openEdit = useCallback((row: TransactionWithRelations) => {
    setEditing(row)
    setSheetOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setEditing(null)
  }, [])

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Удалить эту транзакцию?')) return
      setBusyId(id)
      try {
        const res = await deleteTransaction(id)
        if (!res.ok) {
          alert(res.error)
          return
        }
        // Optimistic local removal — hides the row instantly for
        // users with slow networks; the server refresh confirms it.
        setRows((prev) => prev.filter((r) => r.id !== id))
        router.refresh()
      } finally {
        setBusyId(null)
      }
    },
    [router],
  )

  // For edit defaults we need a loopNumber/day to pass to the form when
  // opening a fresh transaction. When editing an existing row, the form
  // seeds from `editing` directly; defaults are a harmless placeholder.
  const defaultLoopNumber = editing?.loop_number ?? 1
  const defaultDayInLoop = editing?.day_in_loop ?? 1
  const defaultSessionId = editing?.session_id ?? null
  const defaultActorPcId = editing?.actor_pc_id ?? ''

  return (
    <>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-12 text-center text-sm text-gray-400">
          По заданным фильтрам транзакций нет
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <LedgerRow
              key={row.id}
              row={row}
              campaignSlug={campaignSlug}
              isAuthor={row.author_user_id === currentUserId}
              canManage={canManage}
              onEdit={openEdit}
              onDelete={handleDelete}
              busy={busyId === row.id}
            />
          ))}
        </ul>
      )}

      {loadError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {loadError}
        </p>
      )}

      {cursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loading}
          className="self-center rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Загружаю…' : 'Показать ещё'}
        </button>
      )}

      {editing && (
        <TransactionFormSheet
          open={sheetOpen}
          onClose={closeSheet}
          campaignId={campaignId}
          actorPcId={defaultActorPcId}
          defaultLoopNumber={defaultLoopNumber}
          defaultDayInLoop={defaultDayInLoop}
          defaultSessionId={defaultSessionId}
          categories={categories}
          editing={editing}
        />
      )}
    </>
  )
}
