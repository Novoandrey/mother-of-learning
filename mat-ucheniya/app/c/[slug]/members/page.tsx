import { notFound, redirect } from 'next/navigation'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth, type Role } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { MembersClient, type MemberRow } from './members-client'

type MemberJoinRow = {
  user_id: string
  role: Role
  created_at: string
  user_profiles:
    | {
        login: string
        display_name: string | null
        must_change_password: boolean
      }
    | Array<{
        login: string
        display_name: string | null
        must_change_password: boolean
      }>
    | null
}

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  // Owner-only gate.
  const { user } = await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership || membership.role !== 'owner') {
    redirect(`/c/${slug}/catalog`)
  }

  // Need service role here because RLS may hide user_profiles of other users.
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('campaign_members')
    .select(
      'user_id, role, created_at, user_profiles(login, display_name, must_change_password)',
    )
    .eq('campaign_id', campaign.id)
    .order('role', { ascending: true }) // 'dm' < 'owner' < 'player' alphabetically
    .order('created_at', { ascending: true })

  const members: MemberRow[] = ((rows ?? []) as MemberJoinRow[]).map((r) => {
    const profile = Array.isArray(r.user_profiles)
      ? r.user_profiles[0]
      : r.user_profiles
    return {
      user_id: r.user_id,
      role: r.role,
      created_at: r.created_at,
      login: profile?.login ?? '(нет профиля)',
      display_name: profile?.display_name ?? null,
      must_change_password: profile?.must_change_password ?? false,
      is_self: r.user_id === user.id,
    }
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" style={{ color: 'var(--fg-1)' }}>
      <h1 className="mb-1 text-[20px] font-semibold">Участники кампании</h1>
      <p className="mb-6 text-[12px]" style={{ color: 'var(--gray-500)' }}>
        Создание ДМов, сброс паролей, удаление. Пароль при создании станет
        одноразовым — пользователь сменит его при первом входе.
      </p>

      <MembersClient slug={slug} members={members} />
    </div>
  )
}
