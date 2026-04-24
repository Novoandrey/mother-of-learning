import { getMembership } from '@/lib/auth'
import { getLoopSetupStatus } from '@/lib/starter-setup'
import { ApplyStarterSetupButtonClient } from './apply-starter-setup-button-client'

/**
 * Spec-012 T025 — DM-only banner on the loop page prompting first-time
 * apply of the starter setup. Self-gating:
 *
 *   * non-DM / non-owner → renders nothing (banner stays invisible for
 *     players)
 *   * loop already has autogen rows → renders nothing (nothing to do;
 *     subsequent reapplies go through a different entry point, e.g.
 *     the campaign starter-setup page)
 *
 * Both branches return `null` so the banner occupies zero layout space
 * when it isn't actionable.
 */
export async function LoopStartSetupBanner({
  loopNodeId,
  campaignId,
}: {
  loopNodeId: string
  campaignSlug: string
  campaignId: string
}) {
  const membership = await getMembership(campaignId)
  if (!membership) return null
  if (membership.role !== 'dm' && membership.role !== 'owner') return null

  const status = await getLoopSetupStatus(loopNodeId)
  if (status.hasAutogenRows) return null

  return (
    <div
      className="rounded-lg border border-blue-200 bg-blue-50 p-4"
      role="note"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-blue-900">
            Стартовый сетап не применён
          </p>
          <p className="mt-1 text-sm text-blue-700">
            Сгенерирует стартовые деньги, кредиты, предметы и наполнит
            общак по текущим настройкам кампании.
          </p>
        </div>
        <div className="flex-shrink-0">
          <ApplyStarterSetupButtonClient loopNodeId={loopNodeId} />
        </div>
      </div>
    </div>
  )
}
