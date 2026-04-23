import { getCurrentLoop } from '@/lib/loops'
import { getCurrentUser, getMembership } from '@/lib/auth'
import { getWallet, getRecentByPc } from '@/lib/transactions'
import { listCategories } from '@/lib/categories'
import { createAdminClient } from '@/lib/supabase/admin'
import type { TransactionWithRelations } from '@/lib/transactions'
import WalletBalance from './wallet-balance'
import WalletBlockClient from './wallet-block-client'

type Props = {
  pcId: string
  campaignId: string
  /** Campaign slug for the "View all →" link. */
  campaignSlug: string
}

/**
 * Server component — wallet balance + 10 recent transactions for a PC.
 *
 * Mounts on the PC catalog detail page (T022). Silently no-ops for
 * non-character nodes via the host page's type check.
 *
 * Fallback when no loop has `status='current'`: shows a lifetime
 * aggregate + caption explaining the fallback (FR-015).
 *
 * Author- and role-aware: passes `currentUserId` + `canManage` to the
 * client wrapper, which renders edit/delete controls only when the
 * viewer is the row's author or the campaign's owner/DM.
 */
export default async function WalletBlock({
  pcId,
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
    getWallet(pcId, loopNumber),
    getRecentByPc(pcId, loopNumber, 10),
    listCategories(campaignId, 'transaction'),
  ])

  // Day default: current loop → last visited day (frontier) via the
  // PC's participated_in edges; lifetime fallback → day 1. Pulled
  // inline to avoid a fifth module dependency in the wallet block.
  let defaultDayInLoop = 1
  let defaultSessionId: string | null = null
  if (currentLoop) {
    const admin = createAdminClient()
    // Cheapest path: grab the max day_to among sessions the PC has
    // participated in, in this loop. If none, default to 1.
    const { data: participatedSessions } = await admin
      .from('edges')
      .select(
        'source_id, source:nodes!source_id(id, fields)',
      )
      .eq('target_id', pcId)
      .eq(
        'type_id',
        (
          await admin
            .from('edge_types')
            .select('id')
            .eq('campaign_id', campaignId)
            .eq('slug', 'participated_in')
            .maybeSingle()
        ).data?.id ?? '',
      )

    let maxDayTo = 0
    let frontierSessionId: string | null = null
    for (const row of (participatedSessions ?? []) as {
      source_id: string
      source:
        | { id: string; fields: Record<string, unknown> | null }
        | { id: string; fields: Record<string, unknown> | null }[]
        | null
    }[]) {
      const src = Array.isArray(row.source) ? row.source[0] : row.source
      if (!src?.fields) continue
      const rawLoop = src.fields['loop_number']
      const loopOfSession =
        rawLoop != null && rawLoop !== ''
          ? Number(rawLoop)
          : null
      if (loopOfSession !== currentLoop.number) continue
      const rawDayTo = src.fields['day_to']
      const dayTo =
        rawDayTo != null && rawDayTo !== '' ? Number(rawDayTo) : null
      if (dayTo != null && dayTo > maxDayTo) {
        maxDayTo = dayTo
        frontierSessionId = src.id
      }
    }
    if (maxDayTo > 0) {
      defaultDayInLoop = maxDayTo
      defaultSessionId = frontierSessionId
    }
  }

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
          pcId={pcId}
          currentUserId={user.id}
          canManage={canManage}
          defaultLoopNumber={defaultLoopNumber}
          defaultDayInLoop={defaultDayInLoop}
          defaultSessionId={defaultSessionId}
          categories={categories}
          recent={rowsForClient as TransactionWithRelations[]}
        />
      </div>
    </section>
  )
}
