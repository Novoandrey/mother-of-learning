'use client'

import { useEffect } from 'react'
import BatchTransactionForm from './batch-transaction-form'
import type { CampaignPC } from '@/app/actions/characters'

type Props = {
  open: boolean
  onClose: () => void
  campaignId: string
  availablePcs: CampaignPC[]
  defaultLoopNumber: number
  defaultDayByPcId: Record<string, number>
  defaultSessionId?: string | null
  initialActorPcId?: string | null
}

/**
 * Sheet wrapper analogous to `<TransactionFormSheet>` but for the
 * spec-014 multi-row batch form.
 *
 * Bottom sheet on mobile, centered modal on md+. Escape + backdrop
 * tap close. Form's `onSuccess` triggers close so the host doesn't
 * duplicate dismiss wiring.
 */
export default function BatchTransactionFormSheet({
  open,
  onClose,
  campaignId,
  availablePcs,
  defaultLoopNumber,
  defaultDayByPcId,
  defaultSessionId,
  initialActorPcId,
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Подать заявки"
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />

      <div className="relative z-10 w-full md:w-auto md:min-w-[32rem] md:max-w-2xl">
        <div className="max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl md:p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Подать заявки</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть"
              className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
          </div>

          <BatchTransactionForm
            campaignId={campaignId}
            availablePcs={availablePcs}
            defaultLoopNumber={defaultLoopNumber}
            defaultDayByPcId={defaultDayByPcId}
            defaultSessionId={defaultSessionId}
            initialActorPcId={initialActorPcId}
            onSuccess={() => onClose()}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )
}
