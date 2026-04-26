'use client'

import TransactionActions from './transaction-actions'
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
 * Client shell for `<BalanceHero>`: balance on the left, the
 * four-button transaction-action row on the right.
 *
 * Stash hero is special — items inside the stash live in their own
 * inventory tab, and PC↔stash item flows go through PC's «Положить /
 * Взять из Общака» buttons (separate component). So here we surface
 * only money actions (`moneyOnly={true}`) — «+ Доход» / «− Расход»
 * land directly on the stash node's wallet.
 *
 * PC pages still use the fuller `<WalletBlockClient>` which retains
 * the inline recent list + edit wiring around the same buttons.
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
  return (
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
      <div className="flex-shrink-0 self-start">
        <TransactionActions
          campaignId={campaignId}
          campaignSlug={campaignSlug}
          canEditCatalog={canEditCatalog}
          actorPcId={actorNodeId}
          defaultLoopNumber={defaultLoopNumber}
          defaultDayInLoop={defaultDayInLoop}
          defaultSessionId={defaultSessionId}
          categories={categories}
          currentWalletGp={currentWalletGp}
          moneyOnly={true}
        />
      </div>
    </div>
  )
}
