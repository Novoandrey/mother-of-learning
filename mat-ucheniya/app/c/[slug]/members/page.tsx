import { notFound } from 'next/navigation'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth, type Role } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { MembersClient, type MemberRow, type UnboundPc } from './members-client'

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  // Spec-006 increment 3: /members is open to all campaign members.
  // Players see the table read-only. Write-capable UI is behind `canManage`.
  const { user } = await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership) {
    // Layout would already have redirected non-members; this is defensive.
    notFound()
  }

  const canManage = membership.role === 'owner' || membership.role === 'dm'

  // Service role — bypass RLS so we see every member's profile.
  const admin = createAdminClient()

  // Two separate queries joined in JS. Direct PostgREST embed doesn't work
  // because campaign_members.user_id and user_profiles.user_id both reference
  // auth.users(id), with no direct FK between each other.
  const { data: memberRows } = await admin
    .from('campaign_members')
    .select('user_id, role, created_at')
    .eq('campaign_id', campaign.id)

  const userIds = (memberRows ?? []).map((r) => r.user_id)

  type ProfileRow = {
    user_id: string
    login: string
    display_name: string | null
    must_change_password: boolean
  }
  let profileMap = new Map<string, ProfileRow>()
  if (userIds.length > 0) {
    const { data: profileRows } = await admin
      .from('user_profiles')
      .select('user_id, login, display_name, must_change_password')
      .in('user_id', userIds)

    profileMap = new Map(
      ((profileRows ?? []) as ProfileRow[]).map((p) => [p.user_id, p]),
    )
  }

  // Role ordering: owner → dm → player.
  const ROLE_WEIGHT: Record<Role, number> = { owner: 0, dm: 1, player: 2 }

  const members: MemberRow[] = (memberRows ?? [])
    .map((r) => {
      const profile = profileMap.get(r.user_id)
      return {
        user_id: r.user_id,
        role: r.role as Role,
        created_at: r.created_at,
        login: profile?.login ?? '(нет профиля)',
        display_name: profile?.display_name ?? null,
        must_change_password: profile?.must_change_password ?? false,
        is_self: r.user_id === user.id,
      }
    })
    .sort((a, b) => {
      const roleDiff = ROLE_WEIGHT[a.role] - ROLE_WEIGHT[b.role]
      if (roleDiff !== 0) return roleDiff
      return a.created_at.localeCompare(b.created_at)
    })

  // Load unbound character-nodes only if the viewer can manage — we use them
  // to offer an optional bind-at-create for players.
  let unboundPcs: UnboundPc[] = []
  if (canManage) {
    // Resolve the 'character' node_type id for this campaign.
    const { data: charType } = await admin
      .from('node_types')
      .select('id')
      .eq('campaign_id', campaign.id)
      .eq('slug', 'character')
      .maybeSingle()

    if (charType?.id) {
      const { data: pcRows } = await admin
        .from('nodes')
        .select('id, title')
        .eq('campaign_id', campaign.id)
        .eq('type_id', charType.id)
        .is('owner_user_id', null)
        .order('title')
      unboundPcs = (pcRows ?? []).map((n) => ({ id: n.id, title: n.title }))
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" style={{ color: 'var(--fg-1)' }}>
      <h1 className="mb-1 text-[20px] font-semibold">Участники кампании</h1>
      <p className="mb-6 text-[12px]" style={{ color: 'var(--gray-500)' }}>
        {canManage
          ? 'Создание ДМов и игроков, сброс паролей, удаление. Пароль при создании станет одноразовым — пользователь сменит его при первом входе.'
          : 'Список участников кампании. Управлением занимаются владелец и ДМы.'}
      </p>

      <MembersClient
        slug={slug}
        members={members}
        canManage={canManage}
        unboundPcs={unboundPcs}
      />
    </div>
  )
}
