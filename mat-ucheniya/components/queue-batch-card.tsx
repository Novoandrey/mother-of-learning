'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  approveRow,
  rejectRow,
  approveBatch,
  rejectBatch,
  withdrawRow,
  withdrawBatch,
} from '@/app/actions/approval'
import { summarizeBatch, type PendingBatch } from '@/lib/approval'
import { formatAmount } from '@/lib/transaction-format'
import TransactionRow from './transaction-row'
import type { TransactionWithRelations } from '@/lib/transactions'

type Props = {
  batch: PendingBatch
  campaignSlug: string
  isDM: boolean
  currentUserId: string
}

/**
 * Spec-014 T028 + T029 + T030 — single batch card with collapsed
 * summary line and expandable per-row list.
 *
 * Action layout:
 *   - DM: per-row [Одобрить][Отклонить] + batch-wide [Одобрить всё]
 *     [Отклонить всё]. Reject buttons open an inline comment input.
 *   - Player (only for own batches): per-row [Отозвать] + [Править]
 *     (Править deferred — see T020/T021 follow-up). Batch-wide
 *     [Отозвать всю пачку].
 *
 * Stale handling: any action returning `stale: true` fires a router
 * refresh after showing a brief inline notice. We don't try to
 * partially update — the queue page re-fetches on revalidation.
 */
export default function QueueBatchCard({
  batch,
  campaignSlug,
  isDM,
  currentUserId,
}: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [rejectMode, setRejectMode] = useState<
    | { kind: 'row'; rowId: string }
    | { kind: 'batch' }
    | null
  >(null)
  const [rejectComment, setRejectComment] = useState('')

  const summary = useMemo(() => summarizeBatch(batch), [batch])
  const isOwnBatch = batch.authorUserId === currentUserId
  const showPlayerActions = !isDM && isOwnBatch
  const showDMActions = isDM

  // Build the expectedUpdatedAtByRowId map fresh each call to capture
  // whatever updated_at the server returned at fetch time.
  const buildExpectedMap = (
    rows: TransactionWithRelations[],
  ): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const r of rows) {
      if (r.status === 'pending') map[r.id] = r.updated_at
    }
    return map
  }

  // ---------- DM handlers ----------

  const handleApproveRow = (row: TransactionWithRelations) => {
    setError(null)
    startTransition(async () => {
      const r = await approveRow({
        rowId: row.id,
        expectedUpdatedAt: row.updated_at,
      })
      if (!r.ok) {
        setError(r.error)
        if (r.stale) router.refresh()
        return
      }
      router.refresh()
    })
  }

  const handleRejectRow = (row: TransactionWithRelations) => {
    setRejectMode({ kind: 'row', rowId: row.id })
    setRejectComment('')
  }

  const submitRejectRow = (row: TransactionWithRelations) => {
    setError(null)
    const comment = rejectComment.trim() || undefined
    startTransition(async () => {
      const r = await rejectRow({
        rowId: row.id,
        expectedUpdatedAt: row.updated_at,
        comment,
      })
      setRejectMode(null)
      setRejectComment('')
      if (!r.ok) {
        setError(r.error)
        if (r.stale) router.refresh()
        return
      }
      router.refresh()
    })
  }

  const handleApproveBatch = () => {
    setError(null)
    startTransition(async () => {
      const r = await approveBatch({
        batchId: batch.batchId,
        expectedUpdatedAtByRowId: buildExpectedMap(batch.rows),
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (r.stale > 0) {
        setError(`Одобрено: ${r.processed}. Пропущено (изменены): ${r.stale}.`)
      }
      router.refresh()
    })
  }

  const submitRejectBatch = () => {
    setError(null)
    const comment = rejectComment.trim() || undefined
    startTransition(async () => {
      const r = await rejectBatch({
        batchId: batch.batchId,
        expectedUpdatedAtByRowId: buildExpectedMap(batch.rows),
        comment,
      })
      setRejectMode(null)
      setRejectComment('')
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (r.stale > 0) {
        setError(`Отклонено: ${r.processed}. Пропущено (изменены): ${r.stale}.`)
      }
      router.refresh()
    })
  }

  // ---------- Player handlers ----------

  const handleWithdrawRow = (row: TransactionWithRelations) => {
    if (!confirm(`Отозвать заявку?\n${row.comment || row.category_label}`)) return
    setError(null)
    startTransition(async () => {
      const r = await withdrawRow({
        rowId: row.id,
        expectedUpdatedAt: row.updated_at,
      })
      if (!r.ok) {
        setError(r.error)
        if (r.stale) router.refresh()
        return
      }
      router.refresh()
    })
  }

  const handleWithdrawBatch = () => {
    if (!confirm(`Отозвать всю пачку (${batch.pendingCount} заявок)?`)) return
    setError(null)
    startTransition(async () => {
      const r = await withdrawBatch({
        batchId: batch.batchId,
        expectedUpdatedAtByRowId: buildExpectedMap(batch.rows),
      })
      if (!r.ok) {
        setError(r.error)
        return
      }
      if (r.stale > 0) {
        setError(`Отозвано: ${r.processed}. Пропущено (изменены): ${r.stale}.`)
      }
      router.refresh()
    })
  }

  // ---------- Render ----------

  const summaryLine = buildSummaryLine(summary)
  const submittedDisplay = formatTimestamp(batch.submittedAt)

  return (
    <li className="rounded-lg border border-amber-200 bg-amber-50/30 shadow-sm">
      {/* Collapsed header — clickable to toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-t-lg px-4 py-3 text-left hover:bg-amber-50/60 focus:outline-none focus:ring-2 focus:ring-amber-300"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-gray-900">
              {batch.authorDisplayName ?? '—'}
            </span>
            <span className="text-xs text-gray-500">{submittedDisplay}</span>
            <span className="text-xs text-gray-600">
              · {batch.rows.length} {plural(batch.rows.length, ['ряд', 'ряда', 'рядов'])}
            </span>
            {batch.approvedCount > 0 && (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">
                одобрено: {batch.approvedCount}
              </span>
            )}
            {batch.rejectedCount > 0 && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
                отклонено: {batch.rejectedCount}
              </span>
            )}
            {batch.pendingCount > 0 && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                в очереди: {batch.pendingCount}
              </span>
            )}
          </div>
          {summaryLine && (
            <span className="truncate text-sm text-gray-700">{summaryLine}</span>
          )}
        </div>
        <span className="shrink-0 text-gray-400" aria-hidden="true">
          {expanded ? '▴' : '▾'}
        </span>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-amber-200 px-4 py-3">
          {error && (
            <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {/* Per-row list with action buttons */}
          <ul className="flex flex-col gap-1.5">
            {batch.rows.map((row) => {
              const isRowPending = row.status === 'pending'
              const inRejectMode =
                rejectMode?.kind === 'row' && rejectMode.rowId === row.id

              return (
                <li key={row.id} className="flex flex-col gap-1.5">
                  <div className="flex items-stretch gap-2">
                    <div className="flex-1">
                      <ul>
                        <TransactionRow
                          tx={row}
                          campaignSlug={campaignSlug}
                          showActor={true}
                          canEdit={false}
                          onEdit={() => {
                            /* no-op — edit deferred to T030 follow-up */
                          }}
                          onDelete={() => {
                            /* no-op */
                          }}
                          autogen={null}
                        />
                      </ul>
                    </div>

                    {/* Per-row action stack */}
                    {isRowPending && (showDMActions || showPlayerActions) && (
                      <div className="flex shrink-0 items-center gap-1">
                        {showDMActions && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveRow(row)}
                              disabled={isPending}
                              className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              ✓ Одобрить
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectRow(row)}
                              disabled={isPending}
                              className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              ✗ Отклонить
                            </button>
                          </>
                        )}
                        {showPlayerActions && (
                          <button
                            type="button"
                            onClick={() => handleWithdrawRow(row)}
                            disabled={isPending}
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                          >
                            ↶ Отозвать
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Inline reject comment input for this row */}
                  {inRejectMode && (
                    <div className="ml-4 flex items-center gap-2">
                      <input
                        type="text"
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                        placeholder="Причина (необязательно)"
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => submitRejectRow(row)}
                        disabled={isPending}
                        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Подтвердить отказ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectMode(null)
                          setRejectComment('')
                        }}
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Отмена
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {/* Batch-wide actions */}
          {batch.pendingCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-3">
              {showDMActions && (
                <>
                  <button
                    type="button"
                    onClick={handleApproveBatch}
                    disabled={isPending}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ✓ Одобрить всё ({batch.pendingCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectMode({ kind: 'batch' })
                      setRejectComment('')
                    }}
                    disabled={isPending}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    ✗ Отклонить всё
                  </button>
                </>
              )}
              {showPlayerActions && (
                <button
                  type="button"
                  onClick={handleWithdrawBatch}
                  disabled={isPending}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  ↶ Отозвать всю пачку
                </button>
              )}
              <Link
                href={`/c/${campaignSlug}/accounting?batch=${batch.batchId}`}
                className="ml-auto text-xs text-gray-500 hover:text-gray-700"
              >
                В ленте →
              </Link>
            </div>
          )}

          {/* Batch-wide reject comment */}
          {rejectMode?.kind === 'batch' && (
            <div className="mt-2 flex items-center gap-2 border-t border-amber-200 pt-2">
              <input
                type="text"
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="Причина для всей пачки (необязательно)"
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                autoFocus
              />
              <button
                type="button"
                onClick={submitRejectBatch}
                disabled={isPending}
                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Подтвердить отказ
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectMode(null)
                  setRejectComment('')
                }}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
              >
                Отмена
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

// ---------- Helpers ----------

function buildSummaryLine(s: ReturnType<typeof summarizeBatch>): string {
  const parts: string[] = []

  // Coin total — formatAmount expects positive. Use the absolute value
  // and prefix the sign separately so cells don't double-up minuses.
  const hasMoney = s.kinds.includes('money') || s.kinds.includes('transfer')
  if (hasMoney) {
    const abs = formatAmount({
      cp: Math.abs(s.netCoins.cp),
      sp: Math.abs(s.netCoins.sp),
      gp: Math.abs(s.netCoins.gp),
      pp: Math.abs(s.netCoins.pp),
    })
    if (s.netGp !== 0) {
      parts.push(`${s.netGp > 0 ? '+' : '−'}${abs}`)
    }
  }

  if (s.itemCount > 0) {
    parts.push(`${s.itemCount} ${plural(s.itemCount, ['предмет', 'предмета', 'предметов'])}`)
  }

  if (s.transferRecipients.length > 0) {
    const truncated = s.transferRecipients.slice(0, 2).join(', ')
    const more =
      s.transferRecipients.length > 2 ? ` +${s.transferRecipients.length - 2}` : ''
    parts.push(`→ ${truncated}${more}`)
  }

  return parts.join(' · ')
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return forms[0]
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1]
  return forms[2]
}
