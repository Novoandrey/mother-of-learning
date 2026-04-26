'use client'

import { useCallback, useState } from 'react'
import TransactionFormSheet from './transaction-form-sheet'
import WalletBalance from './wallet-balance'
import type { Category, Wallet } from '@/lib/transactions'

type Props = {
  /** Section heading (e.g. "Кошелёк" / "Баланс общака"). */
  heading: string
  wallet: Wallet
  walletCaption: string
  /** Render the "no current loop — showing lifetime total" note. */
  showLifetimeFallback: boolean

  campaignId: string
  campaignSlug: string
  canEditCatalog: boolean
  actorNodeId: string
  defaultLoopNumber: number
  defaultDayInLoop: number
  defaultSessionId: string | null
  currentWalletGp?: number
  categories: Category[]
}

/**
 * Client shell for `<BalanceHero>`: balance on the left, "+ Транзакция"
 * on the right, and a TransactionFormSheet host that only opens in
 * create mode. Used on the stash page where the ledger tab owns the
 * edit flow — hero is a pure "add something new" surface.
 *
 * PC pages still use the fuller `<WalletBlockClient>` which retains the
 * inline recent list + edit wiring.
 */
export default function BalanceHeroClient({
  heading,
  wallet,
  walletCaption,
  showLifetimeFallback,
  campaignId,
  campaignSlug,
  canEditCatalog,
  actorNodeId,
  defaultLoopNumber,
  defaultDayInLoop,
  defaultSessionId,
  currentWalletGp,
  categories,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false)

  const openCreate = useCallback(() => {
    setSheetOpen(true)
  }, [])

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
  }, [])

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {heading}
          </div>
          <div className="mt-1">
            <WalletBalance wallet={wallet} caption={walletCaption} />
          </div>
          {showLifetimeFallback && (
            <p className="mt-2 text-xs text-gray-500">
              Текущая петля не определена — показан итог за всю историю.
              Создайте активную петлю, чтобы вести учёт по текущему циклу.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex-shrink-0 self-start rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          + Транзакция
        </button>
      </div>

      <TransactionFormSheet
        open={sheetOpen}
        onClose={closeSheet}
        campaignId={campaignId}
          campaignSlug={campaignSlug}
          canEditCatalog={canEditCatalog}
        actorPcId={actorNodeId}
        defaultLoopNumber={defaultLoopNumber}
        defaultDayInLoop={defaultDayInLoop}
        defaultSessionId={defaultSessionId}
        currentWalletGp={currentWalletGp}
        categories={categories}
        editing={null}
      />
    </>
  )
}
