export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCampaignStarterConfig } from '@/lib/starter-setup'
import { getCampaignPCs } from '@/app/actions/characters'
import { StartingCoinPickerClient } from '@/components/starting-coin-picker-client'
import { StartingItemsEditorClient } from '@/components/starting-items-editor-client'
import { StarterSetupApplySection } from '@/components/starter-setup-apply-section'
import { PcStarterOverviewList } from '@/components/pc-starter-overview-list'
import StarterSetupTabs from '@/components/starter-setup-tabs'
import type { CampaignStarterConfig } from '@/lib/starter-setup'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign
      ? `Стартовый сетап — ${campaign.name}`
      : 'Не найдено',
  }
}

/**
 * Spec-019 T005 — campaign-wide starter setup hub. DM/owner only.
 *
 * Layout:
 *   1. Apply section (top) — primary loop status + apply button.
 *      Replaces the old `<LoopStartSetupBanner>` from `/loops`.
 *   2. Tabs (below):
 *      - «Кампания» — three campaign-level cards (loan amount,
 *         stash seed coins, stash seed items). Default tab —
 *         preserves the historical entry-point UX.
 *      - «Персонажи» — stack of per-PC starter-config blocks
 *         (loan flag + starting coins + starting items). New in
 *         spec-019; eliminates the per-PC navigation chore.
 *
 * Auth: page-level DM gate is the same as the pre-spec-019 version
 * (player → redirect to /accounting). Each individual server action
 * inside the editors does its own gate too — defense in depth.
 */
export default async function CampaignStarterSetupPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  await requireAuth()
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')
  if (membership.role !== 'dm' && membership.role !== 'owner') {
    redirect(`/c/${slug}/accounting`)
  }

  // Parallel data fetch — campaign config (for the Кампания tab) +
  // PC list (for the Персонажи tab badge count). The per-PC details
  // are queried inside `<PcStarterOverviewList>` itself.
  const [cfg, pcs] = await Promise.all([
    getCampaignStarterConfig(campaign.id),
    getCampaignPCs(campaign.id),
  ])

  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-gray-500">
        <Link
          href={`/c/${slug}/accounting`}
          className="hover:text-gray-800 hover:underline"
        >
          Бухгалтерия
        </Link>
        <span className="mx-1.5 text-gray-400">›</span>
        <span className="text-gray-700">Стартовый сетап</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Стартовый сетап</h1>
        <p className="mt-1 text-sm text-gray-500">
          Настройки, которые применяются ко всем персонажам в начале
          каждой петли. Применение — кнопкой ниже.
        </p>
      </div>

      <div className="space-y-5">
        {/* Apply section — top of the page. */}
        <StarterSetupApplySection
          campaignId={campaign.id}
          campaignSlug={slug}
          isDM
        />

        {/* Tabs — campaign vs PCs. */}
        <StarterSetupTabs
          defaultTab="campaign"
          pcCount={pcs.length}
          campaignContent={
            <CampaignSetupCards cfg={cfg} campaignId={campaign.id} />
          }
          pcsContent={
            <PcStarterOverviewList
              campaignId={campaign.id}
              campaignSlug={slug}
            />
          }
        />
      </div>
    </div>
  )
}

/**
 * Campaign-level cards — extracted from the pre-spec-019 page body.
 * Three sections: loan amount + stash seed coins + stash seed items.
 * Renders the same client components as before; just relocated under
 * a tab.
 */
function CampaignSetupCards({
  cfg,
  campaignId,
}: {
  cfg: CampaignStarterConfig
  campaignId: string
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-base font-semibold text-gray-900">
          Стартовый кредит
        </h2>
        <p className="mb-3 text-sm text-gray-600">
          Размер кредита, который получает каждый персонаж с включённым
          флагом «Берёт стартовый кредит».
        </p>
        <StartingCoinPickerClient
          scope={{ kind: 'campaign_loan', campaignId }}
          initialCoins={cfg.loanAmount}
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-base font-semibold text-gray-900">
          Общак — стартовые монеты
        </h2>
        <p className="mb-3 text-sm text-gray-600">
          Монеты, которыми заполняется общак кампании при каждом
          применении стартового сетапа.
        </p>
        <StartingCoinPickerClient
          scope={{ kind: 'campaign_stash', campaignId }}
          initialCoins={cfg.stashSeedCoins}
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-2 text-base font-semibold text-gray-900">
          Общак — стартовые предметы
        </h2>
        <p className="mb-3 text-sm text-gray-600">
          Предметы, которые добавляются в общак при применении
          стартового сетапа (зелья, свитки, расходники).
        </p>
        <StartingItemsEditorClient
          scope={{ kind: 'campaign_stash', campaignId }}
          initialItems={cfg.stashSeedItems}
        />
      </section>
    </div>
  )
}
