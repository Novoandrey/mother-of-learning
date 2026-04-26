export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import {
  getContributionPool,
  getContributionPoolsForList,
} from '@/lib/contributions'
import { createAdminClient } from '@/lib/supabase/admin'
import ContributionPoolCard from '@/components/contribution-pool-card'
import ContributionPoolPageController from '@/components/contribution-pool-page-controller'
import type { CampaignMemberOption } from '@/components/contribution-pool-create-form'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  return {
    title: campaign ? `Складчина — ${campaign.name}` : 'Не найдено',
  }
}

type SearchParams = Record<string, string | string[] | undefined>

function readStringParam(
  params: SearchParams,
  key: string,
): string | null {
  const v = params[key]
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/**
 * Грузим member'ов кампании с их display_name. Inline здесь, потому
 * что больше нигде не нужно (admin-page членов рендерит со своими
 * полями). Если понадобится в третьем месте — выносим в lib/.
 */
async function listCampaignMembers(
  campaignId: string,
): Promise<CampaignMemberOption[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('campaign_members')
    .select('user_id, user_profiles!inner(display_name, login)')
    .eq('campaign_id', campaignId)

  if (error) {
    console.error('listCampaignMembers failed', error)
    return []
  }

  type Row = {
    user_id: string
    user_profiles:
      | { display_name: string | null; login: string }
      | { display_name: string | null; login: string }[]
      | null
  }

  return (data ?? []).map((raw) => {
    const r = raw as Row
    const profile = Array.isArray(r.user_profiles)
      ? r.user_profiles[0]
      : r.user_profiles
    return {
      userId: r.user_id,
      displayName: profile?.display_name ?? profile?.login ?? '(unknown)',
    }
  })
}

export default async function SkladchinaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<SearchParams>
}) {
  const { slug } = await params
  const resolvedSearch = await searchParams

  const [campaign, { user }] = await Promise.all([
    getCampaignBySlug(slug),
    requireAuth(),
  ])
  if (!campaign) notFound()

  const membership = await getMembership(campaign.id)
  if (!membership) redirect('/')

  const tabParam = readStringParam(resolvedSearch, 'tab')
  const activeTab: 'active' | 'archived' =
    tabParam === 'archived' ? 'archived' : 'active'

  const editParam = readStringParam(resolvedSearch, 'edit')

  // Параллельно: pools для активной вкладки + members для форм + pool
  // в режиме editing (если URL `?edit=`).
  const [pools, members, editingPool] = await Promise.all([
    getContributionPoolsForList(campaign.id, activeTab),
    listCampaignMembers(campaign.id),
    editParam ? getContributionPool(editParam) : Promise.resolve(null),
  ])

  // Validate editingPool — pool должен быть в этой кампании, иначе
  // игнорируем (cross-campaign URL injection guard).
  const safeEditingPool =
    editingPool && editingPool.campaignId === campaign.id ? editingPool : null

  const baseUrl = `/c/${slug}/skladchina`

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Складчина</h1>
        <p className="text-sm text-gray-500">
          Кто скинулся, кто нет — на пиццу, комнату, миньки и прочее
          вне игры.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-1 border-b border-gray-200">
        <Link
          href={baseUrl}
          aria-current={activeTab === 'active' ? 'page' : undefined}
          className={`relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'active'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Текущие
        </Link>
        <Link
          href={`${baseUrl}?tab=archived`}
          aria-current={activeTab === 'archived' ? 'page' : undefined}
          className={`relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            activeTab === 'archived'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          Архив
        </Link>
      </div>

      {/* Form area: либо «+ Складчина» кнопка, либо create form, либо edit form */}
      <div className="mb-4">
        <ContributionPoolPageController
          campaignId={campaign.id}
          campaignSlug={slug}
          members={members}
          editingPool={safeEditingPool}
          activeTab={activeTab}
        />
      </div>

      {/* List */}
      {pools.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500">
          {activeTab === 'active'
            ? 'Пока никаких сборов. Нажми «+ Складчина», если кто-то скинулся на пиццу или комнату.'
            : 'Закрытых сборов пока нет.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {pools.map((pool) => (
            <li key={pool.id}>
              <ContributionPoolCard
                pool={pool}
                currentUserId={user.id}
                userRole={membership.role}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
