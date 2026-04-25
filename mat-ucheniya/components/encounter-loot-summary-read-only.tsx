/**
 * Spec-013 T015 — Player-facing read-only loot summary.
 *
 * Server-rendered, pure display. Three states:
 *   - rows > 0           → "Лут распределён · N строк" + link to ledger
 *   - rows === 0 + draft → "Лут не распределён" (gray, neutral)
 *   - encounter active   → hidden entirely (loot is meaningless until
 *                          the fight is over)
 *
 * The DM panel handles the same data with full edit affordances; this
 * component is what non-DM members see on the encounter page.
 */

import Link from 'next/link'

import { getEncounterLootSummary } from '@/lib/queries/encounter-loot-summary'

export async function EncounterLootSummaryReadOnly({
  encounterId,
  campaignSlug,
  status,
}: {
  encounterId: string
  campaignSlug: string
  status: 'active' | 'completed'
}) {
  if (status === 'active') return null

  const summary = await getEncounterLootSummary(encounterId)
  if (!summary) return null

  if (summary.rowCount === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-500">
        Лут не распределён
      </div>
    )
  }

  // Link points to /accounting with the autogen filter pre-applied to
  // the encounter's mirror node. Users see exactly the loot rows for
  // this encounter.
  const href = `/c/${campaignSlug}/accounting?autogen=only&source=${summary.mirrorNodeId}`

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm flex items-center justify-between">
      <span className="text-emerald-800">
        Лут распределён · {summary.rowCount}{' '}
        {summary.rowCount === 1 ? 'строка' : 'строк'}
      </span>
      <Link
        href={href}
        className="text-emerald-700 hover:text-emerald-900 underline"
      >
        Показать в ленте →
      </Link>
    </div>
  )
}
