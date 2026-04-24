export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { getCampaignStarterConfig } from '@/lib/starter-setup'
import { StartingCoinPickerClient } from '@/components/starting-coin-picker-client'
import { StartingItemsEditorClient } from '@/components/starting-items-editor-client'

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
 * Spec-012 T034 — campaign-wide starter setup editor. DM/owner only.
 * Three cards:
 *   1. Стартовый кредит (loanAmount coin picker)
 *   2. Общак — стартовые монеты (stashSeedCoins coin picker)
 *   3. Общак — стартовые предметы (stashSeedItems editor)
 *
 * The coin picker + items editor components are the same ones used
 * on the PC page — parameterized by `scope` so they know which server
 * action to call.
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

  const cfg = await getCampaignStarterConfig(campaign.id)

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
          каждой петли. Применение — на странице петли кнопкой
          «Применить».
        </p>
      </div>

      <div className="space-y-5">
        {/* Card 1: loan amount */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-base font-semibold text-gray-900">
            Стартовый кредит
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            Размер кредита, который получает каждый персонаж с
            включённым флагом «Берёт стартовый кредит».
          </p>
          <StartingCoinPickerClient
            scope={{ kind: 'campaign_loan', campaignId: campaign.id }}
            initialCoins={cfg.loanAmount}
          />
        </section>

        {/* Card 2: stash seed coins */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-base font-semibold text-gray-900">
            Общак — стартовые монеты
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            Монеты, которыми заполняется общак кампании при каждом
            применении стартового сетапа.
          </p>
          <StartingCoinPickerClient
            scope={{ kind: 'campaign_stash', campaignId: campaign.id }}
            initialCoins={cfg.stashSeedCoins}
          />
        </section>

        {/* Card 3: stash seed items */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-2 text-base font-semibold text-gray-900">
            Общак — стартовые предметы
          </h2>
          <p className="mb-3 text-sm text-gray-600">
            Предметы, которые добавляются в общак при применении
            стартового сетапа (зелья, свитки, расходники).
          </p>
          <StartingItemsEditorClient
            scope={{ kind: 'campaign_stash', campaignId: campaign.id }}
            initialItems={cfg.stashSeedItems}
          />
        </section>
      </div>
    </div>
  )
}
