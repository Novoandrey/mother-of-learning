'use client'

import Link from 'next/link'
import type { TransactionWithRelations } from '@/lib/transactions'
import { formatAmount } from '@/lib/transaction-format'

type Props = {
  row: TransactionWithRelations
  campaignSlug: string
  /** Viewer is the row's author — enables edit/delete. */
  isAuthor: boolean
  /** Viewer is owner/dm — enables edit/delete regardless of authorship. */
  canManage: boolean
  onEdit: (row: TransactionWithRelations) => void
  onDelete: (row: TransactionWithRelations) => void
  /** Disables edit/delete controls while an action for this id is in flight. */
  busy?: boolean
}

/**
 * Single ledger feed row.
 *
 * Layout:
 *   • `< md`: single-column stacked card — optimized for phone reading.
 *   • `md+`: table-row flex layout with fixed slots.
 *
 * Handles graceful fallbacks when joined rows return null:
 *   • deleted character  → "[удалённый персонаж]"
 *   • deleted session    → "[удалённая сессия]"
 *   • missing author     → "[неизвестный автор]"
 */
export default function LedgerRow({
  row,
  campaignSlug,
  isAuthor,
  canManage,
  onEdit,
  onDelete,
  busy,
}: Props) {
  const canEdit = isAuthor || canManage

  const actorTitle = row.actor_pc_title ?? '[удалённый персонаж]'
  const sessionLabel =
    row.session_id == null
      ? null
      : row.session_title
      ? `Сессия ${row.session_number ?? '?'}: ${row.session_title}`
      : '[удалённая сессия]'

  const amountOrItem =
    row.kind === 'item'
      ? row.item_name ?? '—'
      : formatAmount(row.coins)

  const kindBadge =
    row.kind === 'money' ? null : (
      <span
        className={`rounded-full px-2 py-0.5 text-xs ${
          row.kind === 'item'
            ? 'bg-amber-50 text-amber-700'
            : 'bg-purple-50 text-purple-700'
        }`}
      >
        {row.kind === 'item' ? 'предмет' : 'перевод'}
      </span>
    )

  return (
    <li className="rounded-lg border border-gray-200 bg-white px-3 py-2 md:px-4 md:py-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
        {/* When / where */}
        <div className="flex-shrink-0 text-xs text-gray-400 md:w-28">
          <div>Петля {row.loop_number}</div>
          <div>День {row.day_in_loop}</div>
        </div>

        {/* PC actor */}
        <div className="flex-shrink-0 md:w-40">
          {row.actor_pc_id ? (
            <Link
              href={`/c/${campaignSlug}/catalog/${row.actor_pc_id}`}
              className="text-sm font-medium text-gray-900 hover:text-blue-600"
            >
              {actorTitle}
            </Link>
          ) : (
            <span className="text-sm font-medium text-gray-400">{actorTitle}</span>
          )}
        </div>

        {/* Amount + category + kind badge */}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {amountOrItem}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
              {row.category_label}
            </span>
            {kindBadge}
          </div>
          {row.comment && (
            <span className="truncate text-xs text-gray-500">{row.comment}</span>
          )}
          {sessionLabel && (
            <span className="text-xs text-gray-400">
              {row.session_id && row.session_title ? (
                <Link
                  href={`/c/${campaignSlug}/sessions/${row.session_id}`}
                  className="hover:text-blue-600"
                >
                  {sessionLabel}
                </Link>
              ) : (
                sessionLabel
              )}
            </span>
          )}
        </div>

        {/* Author */}
        <div className="flex-shrink-0 text-xs text-gray-400 md:w-32 md:text-right">
          {row.author_display_name ?? '[неизвестный автор]'}
        </div>

        {/* Edit/delete */}
        {canEdit && (
          <div className="flex flex-shrink-0 items-center gap-2 md:w-20 md:justify-end">
            <button
              type="button"
              onClick={() => onEdit(row)}
              disabled={busy}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              изм.
            </button>
            <button
              type="button"
              onClick={() => onDelete(row)}
              disabled={busy}
              className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
            >
              {busy ? '…' : 'уд.'}
            </button>
          </div>
        )}
      </div>
    </li>
  )
}
