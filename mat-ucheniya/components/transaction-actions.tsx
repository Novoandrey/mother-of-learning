'use client'

import { useCallback, useState } from 'react'
import TransactionFormSheet from './transaction-form-sheet'
import type { Category, TransactionWithRelations } from '@/lib/transactions'
import type { TransactionActionKind } from './transaction-form'

type Props = {
  campaignId: string
  campaignSlug: string
  canEditCatalog: boolean
  actorPcId: string
  defaultLoopNumber: number
  defaultDayInLoop: number
  defaultSessionId: string | null
  categories: Category[]
  /** Optional — feeds the shortfall prompt for expense actions. */
  currentWalletGp?: number
  /**
   * When `true`, the four-button row collapses to two: «+ Доход» and
   * «− Расход». Used by stash page where item flows aren't available
   * to the actor (the stash is its own thing — items go through PC's
   * Положить/Взять buttons, not stash's own form).
   */
  moneyOnly?: boolean
  /** Reuse the same component for the edit-existing-row entry point. */
  editing?: TransactionWithRelations | null
}

type ButtonSpec = {
  kind: TransactionActionKind
  label: string
  /** Tailwind classes for the resting state. */
  tone: string
  /** Tailwind classes for the hover state. */
  hover: string
}

/**
 * Replaces the single «+ Транзакция» CTA with four explicit action
 * buttons. Each opens the transaction sheet pre-pinned to the right
 * kind, with no internal tab-bar — the user picks intent up front,
 * fills only the fields that matter for that action.
 *
 * Spec-015 chat 64+ UX revision. Rationale: the tabbed form forced two
 * decisions per submission (tab + fields); the new layout collapses
 * that to one. On mobile the four buttons wrap to a 2×2 grid which
 * remains thumb-friendly.
 *
 * Stash buttons (Положить/Взять из Общака) live in their own row
 * elsewhere — these four cover the «entered catalog of operations
 * not involving the stash» case.
 */
export default function TransactionActions({
  campaignId,
  campaignSlug,
  canEditCatalog,
  actorPcId,
  defaultLoopNumber,
  defaultDayInLoop,
  defaultSessionId,
  categories,
  currentWalletGp,
  moneyOnly = false,
  editing = null,
}: Props) {
  const [openKind, setOpenKind] = useState<TransactionActionKind | null>(null)

  const closeSheet = useCallback(() => setOpenKind(null), [])

  const buttons: ButtonSpec[] = moneyOnly
    ? [
        {
          kind: 'income',
          label: '+ Доход',
          tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
          hover: 'hover:border-emerald-400 hover:bg-emerald-100',
        },
        {
          kind: 'expense',
          label: '− Расход',
          tone: 'border-rose-200 bg-rose-50 text-rose-800',
          hover: 'hover:border-rose-400 hover:bg-rose-100',
        },
      ]
    : [
        {
          kind: 'income',
          label: '+ Доход',
          tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
          hover: 'hover:border-emerald-400 hover:bg-emerald-100',
        },
        {
          kind: 'expense',
          label: '− Расход',
          tone: 'border-rose-200 bg-rose-50 text-rose-800',
          hover: 'hover:border-rose-400 hover:bg-rose-100',
        },
        {
          kind: 'item-in',
          label: '+ Предмет',
          tone: 'border-blue-200 bg-blue-50 text-blue-800',
          hover: 'hover:border-blue-400 hover:bg-blue-100',
        },
        {
          kind: 'item-out',
          label: '− Предмет',
          tone: 'border-gray-200 bg-gray-50 text-gray-800',
          hover: 'hover:border-gray-400 hover:bg-gray-100',
        },
      ]

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2">
        {buttons.map((b) => (
          <button
            key={b.kind}
            type="button"
            onClick={() => setOpenKind(b.kind)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors sm:flex-initial sm:px-4 ${b.tone} ${b.hover}`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {openKind !== null && (
        <TransactionFormSheet
          open={true}
          onClose={closeSheet}
          campaignId={campaignId}
          campaignSlug={campaignSlug}
          canEditCatalog={canEditCatalog}
          actorPcId={actorPcId}
          defaultLoopNumber={defaultLoopNumber}
          defaultDayInLoop={defaultDayInLoop}
          defaultSessionId={defaultSessionId}
          categories={categories}
          currentWalletGp={currentWalletGp}
          editing={editing}
          initialKind={openKind}
        />
      )}
    </>
  )
}
