import { getCurrentLoop } from '@/lib/loops'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { computeDefaultDayForTx, getWallet } from '@/lib/transactions'
import { listCategories } from '@/lib/categories'
import BalanceHeroClient from './balance-hero-client'

type Props = {
  /**
   * The node whose balance we render. Same shape as `<WalletBlock>` —
   * used for both PC ids and the stash node id.
   */
  actorNodeId: string
  campaignId: string
  /**
   * Section heading. Defaults to "Кошелёк". Stash page passes
   * "Баланс общака" so the card reads naturally as a standalone hero.
   */
  heading?: string
}

/**
 * Server component — lighter sibling of `<WalletBlock>` that renders
 * ONLY the balance hero (heading + balance + "+ Транзакция" button),
 * without the inline recent list.
 *
 * Intended for pages where the recent/full transaction history lives
 * elsewhere on the page — notably the stash page, where the history
 * lives inside the "Лента транзакций" tab.
 *
 * Author- and role-aware: reuses the same loop/wallet/category fetches
 * as `<WalletBlock>`; the only difference is the missing `recent`
 * query + the client shell skipping the list render.
 *
 * Fallback when no loop has `status='current'`: shows a lifetime
 * aggregate + caption explaining the fallback (FR-015 — mirrors
 * WalletBlock's behaviour).
 */
export default async function BalanceHero({
  actorNodeId,
  campaignId,
  heading = 'Кошелёк',
}: Props) {
  const user = await getCurrentUser()
  if (!user) return null
  const membership = await getMembership(campaignId)
  if (!membership) return null

  const currentLoop = await getCurrentLoop(campaignId)
  const loopNumber = currentLoop?.number ?? null

  const [wallet, categories] = await Promise.all([
    getWallet(actorNodeId, loopNumber),
    listCategories(campaignId, 'transaction'),
  ])

  const defaultDayInLoop = currentLoop
    ? await computeDefaultDayForTx(actorNodeId, currentLoop.number, currentLoop.id)
    : 1

  const defaultLoopNumber = currentLoop?.number ?? 1
  const walletCaption = currentLoop
    ? `Петля ${currentLoop.number}`
    : 'За всё время'

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <BalanceHeroClient
        heading={heading}
        wallet={wallet}
        walletCaption={walletCaption}
        showLifetimeFallback={!currentLoop}
        campaignId={campaignId}
        actorNodeId={actorNodeId}
        defaultLoopNumber={defaultLoopNumber}
        defaultDayInLoop={defaultDayInLoop}
        defaultSessionId={null}
        currentWalletGp={wallet.aggregate_gp}
        categories={categories}
      />
    </section>
  )
}
