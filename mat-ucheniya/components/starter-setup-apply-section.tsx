import Link from 'next/link'

import {
  getCampaignLoopSetupStatuses,
  type LoopSetupStatusEntry,
} from '@/lib/starter-setup'
import { getCurrentLoop } from '@/lib/loops'
import { ApplyStarterSetupButtonClient } from './apply-starter-setup-button-client'

/**
 * Spec-019 T004 — apply section that lives on top of
 * `/accounting/starter-setup`, replacing the old
 * `<LoopStartSetupBanner>` from `/loops`.
 *
 * Loads `getCampaignLoopSetupStatuses` + `getCurrentLoop` in parallel.
 * Three render paths:
 *
 *   1. **0 loops** — dashed-info card pointing the DM at /loops to
 *      create one. Apply machinery has nothing to bind to.
 *   2. **Normal** — primary row for the current (or latest) loop with
 *      its apply status + button. Below, optionally, a compact list of
 *      *other* unapplied past loops (uncommon edge case).
 *
 * Self-gates non-DM via the `isDM` prop (provided by the page).
 */
export async function StarterSetupApplySection({
  campaignId,
  campaignSlug,
  isDM,
}: {
  campaignId: string
  campaignSlug: string
  isDM: boolean
}) {
  if (!isDM) return null

  const [statuses, current] = await Promise.all([
    getCampaignLoopSetupStatuses(campaignId),
    getCurrentLoop(campaignId),
  ])

  // Path 1 — campaign has no loops at all.
  if (statuses.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">
          В кампании пока нет петель.{' '}
          <Link
            href={`/c/${campaignSlug}/loops`}
            className="text-blue-600 hover:underline"
          >
            Создайте петлю
          </Link>
          , чтобы применить стартовый сетап.
        </p>
      </section>
    )
  }

  // Pick the primary row: prefer the loop currently flagged as `current`,
  // fall back to the latest loop in the list (statuses preserve loop
  // order from `getLoops` which sorts by number).
  const primary =
    statuses.find((s) => s.loopId === current?.id) ??
    statuses[statuses.length - 1]

  // Other past loops where setup wasn't applied. Rare edge case (DM
  // skipped a loop), but worth surfacing here so it isn't only visible
  // on the per-loop page.
  const otherUnapplied = statuses.filter(
    (s) => s.loopId !== primary.loopId && !s.hasAutogenRows,
  )

  return (
    <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
      <PrimaryApplyRow status={primary} />

      {otherUnapplied.length > 0 && (
        <UnappliedBacklog rows={otherUnapplied} />
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components (private to this file)
// ─────────────────────────────────────────────────────────────────────

function PrimaryApplyRow({ status }: { status: LoopSetupStatusEntry }) {
  const applied = status.hasAutogenRows

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-blue-900">
          Петля {status.loopNumber}
          {applied ? (
            <span className="ml-2 font-normal text-emerald-700">
              · ✓ Стартовый сетап применён
            </span>
          ) : (
            <span className="ml-2 font-normal text-blue-700">
              · Стартовый сетап не применён
            </span>
          )}
        </p>
        <p className="mt-1 text-sm text-blue-700">
          {applied
            ? 'Нажмите «Применить заново», чтобы синхронизировать после правок настроек.'
            : 'Сгенерирует стартовые деньги, кредиты, предметы и наполнит общак по текущим настройкам кампании.'}
        </p>
      </div>
      <div className="flex-shrink-0">
        <ApplyStarterSetupButtonClient loopNodeId={status.loopId} />
      </div>
    </div>
  )
}

function UnappliedBacklog({ rows }: { rows: LoopSetupStatusEntry[] }) {
  return (
    <div className="mt-4 border-t border-blue-200 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-blue-700/80">
        Не применено также в петлях
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.loopId}
            className="flex items-center justify-between gap-3 rounded-md bg-white/60 px-3 py-1.5 text-sm"
          >
            <span className="font-medium text-blue-900">
              Петля {r.loopNumber}
            </span>
            <ApplyStarterSetupButtonClient loopNodeId={r.loopId} />
          </li>
        ))}
      </ul>
    </div>
  )
}
