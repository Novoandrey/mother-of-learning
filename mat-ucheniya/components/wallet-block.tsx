import { getCurrentLoop } from '@/lib/loops'
import { getCurrentUser, getMembership } from '@/lib/auth'
import {
  computeDefaultDayForTx,
  getRecentByPc,
  getWallet,
} from '@/lib/transactions'
import { listCategories } from '@/lib/categories'
import type { TransactionWithRelations } from '@/lib/transactions'
import WalletBalance from './wallet-balance'
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
}

/**
 * Server component — wallet balance + 10 recent transactions for an
 * actor node (PC or stash).
 *
 * Mounts on the PC catalog detail page and on the stash page (spec-011
 * T031). Silently no-ops for non-character, non-stash nodes via the
 * host page's type check.
 *
 * Fallback when no loop has `status='current'`: shows a lifetime
 * aggregate + caption explaining the fallback (FR-015).
 *
 * Author- and role-aware: passes `currentUserId` + `canManage` to the
 * client wrapper, which renders edit/delete controls only when the
 * viewer is the row's author or the campaign's owner/DM.
 */
export default async function WalletBlock({
  actorNodeId,
  campaignId,
  campaignSlug,
}: Props) {
  // Viewer + role
  const user = await getCurrentUser()
  if (!user) return null
  const membership = await getMembership(campaignId)
  if (!membership) return null

  const canManage = membership.role === 'owner' || membership.role === 'dm'

  // Current loop drives which wallet window we show. `null` → lifetime.
  const currentLoop = await getCurrentLoop(campaignId)
  const loopNumber = currentLoop?.number ?? null

  // Fetch wallet + recent + categories in parallel — categories feed the
  // form sheet that the client wrapper mounts, so we pre-fetch here to
  // spare the dropdown its own round-trip.
  const [wallet, recent, categories] = await Promise.all([
    getWallet(actorNodeId, loopNumber),
    getRecentByPc(actorNodeId, loopNumber, 10),
    listCategories(campaignId, 'transaction'),
  ])

  // Day default: delegated to the shared helper so the form sheet here
  // and the actor bar on /accounting agree on the rule (latest tx →
  // frontier → 1).
  const defaultDayInLoop = currentLoop
    ? await computeDefaultDayForTx(actorNodeId, currentLoop.number, currentLoop.id)
    : 1

  const defaultLoopNumber = currentLoop?.number ?? 1

  // Convert rows into a light-weight shape for the client. We keep the full
  // TransactionWithRelations so the form can hydrate edit mode directly.
  const rowsForClient = recent

  const walletCaption = currentLoop
    ? `Петля ${currentLoop.number}`
    : 'За всё время'

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Кошелёк
          </div>
          <div className="mt-1">
            <WalletBalance wallet={wallet} caption={walletCaption} />
          </div>
          {!currentLoop && (
            <p className="mt-2 text-xs text-gray-400">
              Текущая петля не определена — показан итог за всю историю.
              Создайте активную петлю, чтобы вести учёт по текущему циклу.
            </p>
          )}
        </div>
        <WalletBlockClient
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
          recent={rowsForClient as TransactionWithRelations[]}
        />
      </div>
    </section>
  )
}
