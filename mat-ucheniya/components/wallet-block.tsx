import { getCurrentLoop } from '@/lib/loops'
import { getCurrentUser, getMembership } from '@/lib/auth'
import {
  computeDefaultDayForTx,
  getRecentByPc,
  getWallet,
} from '@/lib/transactions'
import { listCategories } from '@/lib/categories'
import type { TransactionWithRelations } from '@/lib/transactions'
import WalletBlockClient from './wallet-block-client'

type Props = {
  /**
   * The node whose wallet we render. Named `actorNodeId` (not `pcId`)
   * so the same component powers both PC pages and the stash page —
   * both are `nodes.id` values used as `actor_pc_id` on transactions.
   */
  actorNodeId: string
  campaignId: string
  /** Campaign slug for the "View all →" link. */
  campaignSlug: string
  /**
   * Section heading. Defaults to "Кошелёк" for PC pages; the stash
   * page overrides with "Баланс общака" so the card reads naturally
   * as a standalone hero rather than a sidebar widget.
   */
  heading?: string
}

/**
 * Server component — balance + "+ Transaction" + 10 recent rows for
 * any actor node (PC or stash).
 *
 * The whole visual composition lives in `WalletBlockClient` so the
 * block stacks cleanly as a full-width hero (stash page) without
 * relitigating layout for the narrower PC-page embedding.
 *
 * Author- and role-aware: passes `currentUserId` + `canManage` to the
 * client, which gates edit/delete per row.
 *
 * Fallback when no loop has `status='current'`: shows a lifetime
 * aggregate + caption explaining the fallback (FR-015).
 */
export default async function WalletBlock({
  actorNodeId,
  campaignId,
  campaignSlug,
  heading = 'Кошелёк',
}: Props) {
  const user = await getCurrentUser()
  if (!user) return null
  const membership = await getMembership(campaignId)
  if (!membership) return null

  const canManage = membership.role === 'owner' || membership.role === 'dm'

  const currentLoop = await getCurrentLoop(campaignId)
  const loopNumber = currentLoop?.number ?? null

  const [wallet, recent, categories] = await Promise.all([
    getWallet(actorNodeId, loopNumber),
    getRecentByPc(actorNodeId, loopNumber, 10),
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
      <WalletBlockClient
        heading={heading}
        wallet={wallet}
        walletCaption={walletCaption}
        showLifetimeFallback={!currentLoop}
        campaignId={campaignId}
        campaignSlug={campaignSlug}
        actorNodeId={actorNodeId}
        currentUserId={user.id}
        canManage={canManage}
        defaultLoopNumber={defaultLoopNumber}
        defaultDayInLoop={defaultDayInLoop}
        defaultSessionId={null}
        currentWalletGp={wallet.aggregate_gp}
        categories={categories}
        recent={recent as TransactionWithRelations[]}
      />
    </section>
  )
}
