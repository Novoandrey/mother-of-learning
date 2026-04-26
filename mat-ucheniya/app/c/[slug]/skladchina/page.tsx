export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'

import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import {
  getContributionPool,
  getContributionPoolsForList,
  getLastPaymentHintForUser,
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
 * полями). Two-step (members → profiles by IN), потому что
 * PostgREST embed между `campaign_members` и `user_profiles` не
 * работает: оба ссылаются на `auth.users`, но между собой FK нет.
 */
async function listCampaignMembers(
  campaignId: string,
): Promise<CampaignMemberOption[]> {
  const admin = createAdminClient()

  const { data: memberRows, error: membersErr } = await admin
    .from('campaign_members')
    .select('user_id')
    .eq('campaign_id', campaignId)

  if (membersErr) {
    console.error('listCampaignMembers: members fetch failed', membersErr)
    return []
  }
  const userIds = (memberRows ?? []).map(
    (r) => (r as { user_id: string }).user_id,
  )
  if (userIds.length === 0) return []

  const { data: profileRows, error: profilesErr } = await admin
    .from('user_profiles')
    .select('user_id, display_name, login')
    .in('user_id', userIds)

  if (profilesErr) {
    console.error('listCampaignMembers: profiles fetch failed', profilesErr)
    return []
  }

  type Profile = {
    user_id: string
    display_name: string | null
    login: string
  }
  const profileMap = new Map<string, Profile>(
    (profileRows ?? []).map((p) => [(p as Profile).user_id, p as Profile]),
  )

  return userIds.map((uid) => {
    const profile = profileMap.get(uid)
    return {
      userId: uid,
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
  // в режиме editing (если URL `?edit=`) + last payment hint автора
  // (для prefill в CreateForm).
  const [pools, members, editingPool, lastPaymentHint] = await Promise.all([
    getContributionPoolsForList(campaign.id, activeTab),
    listCampaignMembers(campaign.id),
    editParam ? getContributionPool(editParam) : Promise.resolve(null),
    getLastPaymentHintForUser(campaign.id, user.id),
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
          defaultPaymentHint={lastPaymentHint}
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
