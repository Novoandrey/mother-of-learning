'use client'

import { useCallback, useEffect } from 'react'
import TransactionForm, { type StashPinnedDirection } from './transaction-form'
import type { Category, TransactionWithRelations } from '@/lib/transactions'

type Props = {
  open: boolean
  onClose: () => void
  campaignId: string
  /** Spec-015 — campaign slug + DM flag passed through to ItemTypeahead. */
  campaignSlug: string
  canEditCatalog: boolean
  actorPcId: string
  defaultLoopNumber: number
  defaultDayInLoop: number
  defaultSessionId: string | null
  categories?: Category[]
  editing?: TransactionWithRelations | null
  /** Pre-select a tab on mount (create flow). Ignored in edit mode. */
  initialKind?: 'income' | 'expense' | 'transfer'
  /** spec-011: pin the form to a put-into / take-from-stash flow. */
  initialTransferDirection?: StashPinnedDirection | null
  /** spec-011: current wallet gp — feeds the shortfall prompt. */
  currentWalletGp?: number
}

/**
 * Responsive wrapper around `<TransactionForm>`.
 *
 * On `max-width: md` — bottom sheet: full-width, slides up from the
 * bottom edge, rounded top corners. Natural thumb-reach on a phone.
 * On `md+` — centered modal: max-width card, dim backdrop.
 *
 * Escape + backdrop tap close the sheet. Form's `onSuccess` fires
 * `onClose` so the host doesn't need to duplicate dismiss wiring.
 */
export default function TransactionFormSheet({
  open,
  onClose,
  campaignId,
  campaignSlug,
  canEditCatalog,
  actorPcId,
  defaultLoopNumber,
  defaultDayInLoop,
  defaultSessionId,
  categories,
  editing,
  initialKind,
  initialTransferDirection,
  currentWalletGp,
}: Props) {
  // Escape-to-close.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lock body scroll while open so the sheet doesn't scroll the page
  // behind it. Cleaned up on close.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const handleSuccess = useCallback(() => {
    onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? 'Редактировать транзакцию' : 'Новая транзакция'}
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      {/* Panel — bottom sheet on mobile, centered modal on md+ */}
      <div className="relative z-10 w-full md:w-auto md:min-w-[28rem] md:max-w-lg">
        <div className="max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl md:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {editing ? 'Редактировать транзакцию' : 'Новая транзакция'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          <TransactionForm
            campaignId={campaignId}
            campaignSlug={campaignSlug}
            canEditCatalog={canEditCatalog}
            actorPcId={actorPcId}
            defaultLoopNumber={defaultLoopNumber}
            defaultDayInLoop={defaultDayInLoop}
            defaultSessionId={defaultSessionId}
            categories={categories}
            editing={editing}
            initialKind={initialKind}
            initialTransferDirection={initialTransferDirection}
            currentWalletGp={currentWalletGp}
            onSuccess={handleSuccess}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
