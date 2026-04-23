'use client'

import { useCallback, useState } from 'react'
import TransactionFormSheet from './transaction-form-sheet'
import type { Category } from '@/lib/transactions'
import type { CampaignPC } from '@/app/actions/characters'

type Props = {
  campaignId: string
  availablePcs: CampaignPC[]
  /** Pre-fetched taxonomy forwarded into the form. */
  categories: Category[]
  defaultLoopNumber: number
  defaultDayInLoop: number
}

/**
 * Ledger-page "create transaction" entry point.
 *
 * Step 1: user clicks the button and picks which PC the transaction
 * is for. For DM/owner the list is every PC in the campaign; for
 * players it is filtered to PCs they own (server component decides
 * what to pass in via `availablePcs`).
 *
 * Step 2: after PC selection, the standard `TransactionFormSheet`
 * opens seeded with that `actorPcId`. Frontier day is not pre-
 * computed here (the wallet block does that inline because it
 * knows which PC it is for); the caption editor in the form lets
 * the user tweak loop/day before saving.
 */
export default function LedgerCreateButton({
  campaignId,
  availablePcs,
  categories,
  defaultLoopNumber,
  defaultDayInLoop,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [selectedPc, setSelectedPc] = useState<CampaignPC | null>(null)

  const openPicker = useCallback(() => {
    setPickerOpen(true)
  }, [])

  const closePicker = useCallback(() => {
    setPickerOpen(false)
  }, [])

  const choosePc = useCallback((pc: CampaignPC) => {
    setSelectedPc(pc)
    setPickerOpen(false)
  }, [])

  const closeSheet = useCallback(() => {
    setSelectedPc(null)
  }, [])

  if (availablePcs.length === 0) {
    // Player with zero owned PCs — hide the button rather than
    // showing an empty picker.
    return null
  }

  // Fast path: a player with exactly one owned PC skips the picker.
  const fastPath = availablePcs.length === 1
  const triggerPc = fastPath ? availablePcs[0] : null

  return (
    <>
      <button
        type="button"
        onClick={() => (fastPath ? choosePc(triggerPc!) : openPicker())}
        className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        + Новая транзакция
      </button>

      {pickerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Выбрать персонажа"
          className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
        >
          <button
            type="button"
            aria-label="Закрыть"
            onClick={closePicker}
            className="absolute inset-0 bg-black/40"
          />
          <div className="relative z-10 w-full md:w-auto md:min-w-[22rem] md:max-w-md">
            <div className="max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 md:rounded-2xl md:p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Выбрать персонажа
                </h2>
                <button
                  type="button"
                  onClick={closePicker}
                  aria-label="Закрыть"
                  className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >
                  ✕
                </button>
              </div>
              <ul className="flex flex-col">
                {availablePcs.map((pc) => (
                  <li key={pc.id}>
                    <button
                      type="button"
                      onClick={() => choosePc(pc)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <span className="font-medium">{pc.title}</span>
                      {pc.owner_display_name && (
                        <span className="text-xs text-gray-400">
                          {pc.owner_display_name}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {selectedPc && (
        <TransactionFormSheet
          open={true}
          onClose={closeSheet}
          campaignId={campaignId}
          actorPcId={selectedPc.id}
          defaultLoopNumber={defaultLoopNumber}
          defaultDayInLoop={defaultDayInLoop}
          defaultSessionId={null}
          categories={categories}
          editing={null}
        />
      )}
    </>
  )
}
