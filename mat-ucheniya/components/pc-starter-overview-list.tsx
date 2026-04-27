import Link from 'next/link'

import { getPcStarterConfigsForCampaign } from '@/lib/starter-setup'
import { PcStarterConfigBlock } from './pc-starter-config-block'

/**
 * Spec-019 T003 — DM-only overview that stacks a `<PcStarterConfigBlock>`
 * for every PC in the campaign on a single screen.
 *
 * Cards are sorted by PC title (RU collation). Each card has a small
 * header strip with the PC name and a link back to its catalog page,
 * then the unmodified `<PcStarterConfigBlock>` in `dm` mode (loan
 * toggle + coin picker + items editor).
 *
 * The `<PcStarterConfigBlock>` queries its own row inside, so we have
 * an N+1 read pattern (29 single-PK lookups for mat-ucheniya). At
 * < 1 ms per lookup this is ~30 ms total — well below the threshold
 * for any user-visible regression. If a future campaign hits 100+ PC
 * we'd extend the block with an optional `prefetchedConfig` prop and
 * fetch in batch here; not warranted now.
 *
 * Empty state shown when the campaign has 0 PCs — defensive only;
 * realistically this would never render in mat-ucheniya.
 */
export async function PcStarterOverviewList({
  campaignId,
  campaignSlug,
}: {
  campaignId: string
  campaignSlug: string
}) {
  const configs = await getPcStarterConfigsForCampaign(campaignId)

  if (configs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
        <p className="text-sm text-gray-600">
          В кампании пока нет персонажей. Создайте PC в каталоге, чтобы
          настроить им стартовый сетап.
        </p>
      </div>
    )
  }

  // Stable RU-collation sort. `localeCompare` with 'ru' handles
  // mixed Cyrillic + Latin; tie-break by pcId so renders are
  // deterministic across reloads.
  const sorted = [...configs].sort(
    (a, b) =>
      a.pcTitle.localeCompare(b.pcTitle, 'ru') ||
      a.pcId.localeCompare(b.pcId),
  )

  return (
    <div className="space-y-4">
      {sorted.map((cfg) => (
        <article
          key={cfg.pcId}
          className="rounded-lg border border-gray-200 bg-white"
        >
          <header className="flex items-baseline justify-between border-b border-gray-100 px-4 py-2.5">
            <h3 className="text-base font-semibold text-gray-900">
              {cfg.pcTitle}
            </h3>
            <Link
              href={`/c/${campaignSlug}/catalog/${cfg.pcId}`}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline"
            >
              На страницу персонажа →
            </Link>
          </header>
          <div className="p-4">
            <PcStarterConfigBlock pcId={cfg.pcId} mode="dm" />
          </div>
        </article>
      ))}
    </div>
  )
}
