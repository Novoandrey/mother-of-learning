'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import LedgerRow from './ledger-row'
import TransactionFormSheet from './transaction-form-sheet'
import {
  deleteTransaction,
  deleteTransfer,
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
 * Client side of the ledger.
 *
 * Source-of-truth split:
 *   • `initialRows` — server-rendered first page (changes every
 *     refresh). Consumed straight from props, never copied into
 *     local state — that would desync after `router.refresh()`.
 *   • `appendedRows` — additional pages fetched via "Load more".
 *     Reset by the parent via a `key` prop when filters change.
 *   • `hiddenIds` — optimistic removal of deleted rows before the
 *     server refresh lands.
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

  const [appendedRows, setAppendedRows] = useState<TransactionWithRelations[]>(
    [],
  )
  const [cursor, setCursor] = useState<string | null>(initialNextCursor)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const combined = [...initialRows, ...appendedRows]
    if (hiddenIds.size === 0) return combined
    return combined.filter((r) => !hiddenIds.has(r.id))
  }, [initialRows, appendedRows, hiddenIds])

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
      setAppendedRows((prev) => [...prev, ...res.page.rows])
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
    async (row: TransactionWithRelations) => {
      const isTransfer =
        row.kind === 'transfer' && !!row.transfer_group_id
      const prompt = isTransfer
        ? 'Удалить перевод? Обе стороны будут удалены.'
        : 'Удалить эту транзакцию?'
      if (!confirm(prompt)) return
      setBusyId(row.id)
      try {
        const res = isTransfer
          ? await deleteTransfer(row.transfer_group_id!)
          : await deleteTransaction(row.id)
        if (!res.ok) {
          alert(res.error)
          return
        }
        setHiddenIds((prev) => {
          const next = new Set(prev)
          next.add(row.id)
          // Hide the sibling leg too so there's no brief flash of the
          // other side before `router.refresh()` lands.
          if (isTransfer) {
            for (const r of [...initialRows, ...appendedRows]) {
              if (r.transfer_group_id === row.transfer_group_id) {
                next.add(r.id)
              }
            }
          }
          return next
        })
        router.refresh()
      } finally {
        setBusyId(null)
      }
    },
    [appendedRows, initialRows, router],
  )

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
