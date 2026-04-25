'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import type { TransactionWithRelations } from '@/lib/transactions'
import type { WizardKey } from '@/lib/starter-setup'
import { formatAmount } from '@/lib/transaction-format'
import { aggregateGp } from '@/lib/transaction-resolver'
import { AutogenBadgeClient } from './autogen-badge-client'

type Props = {
  tx: TransactionWithRelations
  campaignSlug: string
  /**
   * `true` — ledger feed (show actor and, for transfers, actor → counterparty).
   * `false` — per-actor pages (wallet block, stash) where every row shares
   * the same actor so surfacing it would be pure noise. Transfer direction
   * is preserved via the sibling's name after the arrow in that case.
   */
  showActor: boolean
  /** Viewer can edit/delete this row. When `false`, the row is read-only. */
  canEdit: boolean
  onEdit: (tx: TransactionWithRelations) => void
  onDelete: (tx: TransactionWithRelations) => void
  /** Disables edit/delete controls while an action is in flight. */
  busy?: boolean
  /**
   * Spec-012 T037 — autogen badge data. Set when the row was produced
   * by an autogen wizard (loop start setup in spec-012; encounter loot
   * in spec-013). Displays a compact ⚙-icon before the day chip with
   * a tooltip showing wizard label + source title.
   */
  autogen?: { wizardKey: WizardKey; sourceTitle: string } | null
}

const MINUS_SIGN = '\u2212' // U+2212, typographic minus

/**
 * Universal one-line (desktop) / two-line (mobile) transaction row.
 *
 * Replaces both the ledger feed row and the wallet-block recent-list row.
 * Visual language:
 *   - Amount colour + sign prefix encode direction (colourblind-safe —
 *     `+` / `−` / `×` work without colour). WCAG AAA contrasts.
 *   - Day chip is a fixed-left gutter (`д.14` / `д.14·с.3`).
 *   - Actor bit (ledger only): `Mirian` for money, `Mirian → Общак`
 *     for transfers with a resolved sibling.
 *   - Category chip and session info are secondary; category collapses
 *     on narrow viewports.
 *
 * Transfer direction comes from the sign of `coins` (money) or `item_qty`
 * (item) — the action module flips the sender's leg negative and the
 * recipient's positive, so aggregateGp does the right thing without a
 * side-channel direction field.
 */
export default function TransactionRow({
  tx,
  campaignSlug,
  showActor,
  canEdit,
  onEdit,
  onDelete,
  busy,
  autogen,
}: Props) {
  const dayChip = renderDayChip(tx)
  const { mainText, amountText, amountClass } = renderBody(tx)
  const actorBit = renderActorBit(tx, campaignSlug, showActor)

  // Spec-014 status-aware framing.
  //   - pending → amber border-left + "⏳ Ждёт DM" badge
  //   - rejected → muted gray + strikethrough on amount + "✗ Отклонено" badge
  //   - approved → existing rendering (default)
  const isPending = tx.status === 'pending'
  const isRejected = tx.status === 'rejected'
  const containerClass = isPending
    ? 'group flex items-center justify-between gap-2 rounded-md border border-gray-200 border-l-4 border-l-amber-400 bg-amber-50/30 px-2.5 py-2 hover:border-gray-300 sm:gap-3 sm:px-3'
    : isRejected
      ? 'group flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2 hover:border-gray-300 sm:gap-3 sm:px-3 opacity-75'
      : 'group flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 hover:border-gray-300 sm:gap-3 sm:px-3'

  // Mute amount for rejected (strikethrough); approved/pending keep
  // the colour from `renderBody` (so the player still sees the +/− at
  // a glance while their row is in queue).
  const amountFinalClass = isRejected
    ? `${amountClass} line-through opacity-60`
    : amountClass

  return (
    <li className={containerClass}>
      {/* Left: day chip + (mobile-wrap) actor + main text + category */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        {isPending && (
          <span
            className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            title="Ждёт одобрения мастера"
          >
            ⏳ Ждёт DM
          </span>
        )}
        {isRejected && (
          <span
            className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800"
            title={tx.rejection_comment ?? 'Отклонено мастером'}
          >
            ✗ Отклонено
          </span>
        )}

        {autogen && (
          <AutogenBadgeClient
            wizardKey={autogen.wizardKey}
            sourceTitle={autogen.sourceTitle}
          />
        )}

        <span className="inline-flex shrink-0 items-center rounded bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-700">
          {dayChip}
        </span>

        {actorBit && (
          <span className="inline-flex shrink-0 items-center gap-1 text-sm text-gray-700">
            {actorBit}
          </span>
        )}

        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            isRejected ? 'text-gray-500' : 'text-gray-900'
          }`}
        >
          {mainText}
        </span>

        {isRejected && tx.rejection_comment && (
          <span
            className="hidden shrink-0 truncate rounded-full bg-red-50 px-2 py-0.5 text-xs italic text-red-700 sm:inline-flex"
            title={tx.rejection_comment}
          >
            «{tx.rejection_comment}»
          </span>
        )}

        <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700 sm:inline-flex">
          {tx.category_label}
        </span>
      </div>

      {/* Right: amount + actions */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <span
          className={`shrink-0 text-right text-sm font-semibold tabular-nums ${amountFinalClass}`}
        >
          {amountText}
        </span>

        {canEdit && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={() => onEdit(tx)}
              disabled={busy}
              className="rounded px-1.5 py-0.5 text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              aria-label="Изменить"
            >
              изм.
            </button>
            <button
              type="button"
              onClick={() => onDelete(tx)}
              disabled={busy}
              className="rounded px-1.5 py-0.5 text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"
              aria-label="Удалить"
            >
              {busy ? '…' : 'уд.'}
            </button>
          </span>
        )}
      </div>
    </li>
  )
}

// ---------- helpers ----------

function renderDayChip(tx: TransactionWithRelations): string {
  if (tx.session_number != null) {
    return `д.${tx.day_in_loop}·с.${tx.session_number}`
  }
  return `д.${tx.day_in_loop}`
}

function renderBody(tx: TransactionWithRelations): {
  mainText: string
  amountText: string
  amountClass: string
} {
  if (tx.kind === 'item') {
    // Items always use `×qty` gray. Direction for item-transfers is in
    // actor_bit (or lost on per-actor pages — acceptable, the name and
    // comment carry context).
    const qty = Math.abs(tx.item_qty)
    return {
      mainText: tx.item_name ?? '—',
      amountText: `×${qty}`,
      amountClass: 'text-gray-700',
    }
  }

  // Money or transfer: sign of aggregateGp drives colour + prefix.
  const agg = aggregateGp(tx.coins)
  const abs = formatAmount({
    cp: Math.abs(tx.coins.cp),
    sp: Math.abs(tx.coins.sp),
    gp: Math.abs(tx.coins.gp),
    pp: Math.abs(tx.coins.pp),
  })

  // `formatAmount('—')` for all-zero sets — treat as neutral.
  if (agg === 0) {
    return {
      mainText: mainTextFor(tx),
      amountText: abs,
      amountClass: 'text-gray-700',
    }
  }

  const prefix = agg < 0 ? MINUS_SIGN : '+'
  const colorClass = agg < 0 ? 'text-red-700' : 'text-emerald-700'

  return {
    mainText: mainTextFor(tx),
    amountText: `${prefix}${abs}`,
    amountClass: colorClass,
  }
}

function mainTextFor(tx: TransactionWithRelations): string {
  // Money / transfer: prefer comment; fall back to category label so
  // the row is never mostly-blank.
  if (tx.comment && tx.comment.trim()) return tx.comment
  return tx.category_label
}

function renderActorBit(
  tx: TransactionWithRelations,
  campaignSlug: string,
  showActor: boolean,
): ReactNode {
  if (!showActor) return null

  const actorName = tx.actor_pc_title ?? '[удалённый]'
  const actorNode = tx.actor_pc_id ? (
    <Link
      href={`/c/${campaignSlug}/catalog/${tx.actor_pc_id}`}
      className="font-medium text-gray-900 hover:text-blue-700"
    >
      {actorName}
    </Link>
  ) : (
    <span className="font-medium text-gray-500">{actorName}</span>
  )

  // Transfer / item-transfer: show "actor → counterparty" when sibling resolved.
  if (tx.counterparty) {
    const cpName = tx.counterparty.title ?? '[удалённый]'
    return (
      <>
        {actorNode}
        <span className="text-gray-400">→</span>
        <Link
          href={`/c/${campaignSlug}/catalog/${tx.counterparty.nodeId}`}
          className="font-medium text-gray-900 hover:text-blue-700"
        >
          {cpName}
        </Link>
      </>
    )
  }

  return actorNode
}
