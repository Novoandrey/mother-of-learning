'use server'

import { revalidatePath } from 'next/cache'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, loginToEmail, requireAuth, type Role } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionState = { error: string | null; success: string | null }

const LOGIN_REGEX = /^[a-z0-9_-]{3,32}$/

/**
 * Gate: the action caller must be the owner of the campaign.
 * Throws on unauthorized access.
 */
async function requireOwner(slug: string) {
  const { user } = await requireAuth()
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) throw new Error('Campaign not found')
  const membership = await getMembership(campaign.id)
  if (!membership || membership.role !== 'owner') {
    throw new Error('Forbidden')
  }
  return { user, campaign, membership }
}

/**
 * Create a new member (default role: 'dm').
 * Creates an auth-user via admin API (email confirmation skipped), upserts
 * user_profiles with must_change_password=true, inserts campaign_members.
 *
 * The 'owner' role cannot be assigned through the UI (exactly one owner per
 * campaign, enforced by a unique DB index).
 */
export async function createMemberAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const login = String(formData.get('login') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const role = String(formData.get('role') ?? 'dm') as Role

  // Role whitelist for this increment: DMs only. Players come in increment 3.
  if (role !== 'dm') {
    return { error: 'В этой версии можно создавать только ДМов', success: null }
  }
  if (!LOGIN_REGEX.test(login)) {
    return {
      error: 'Логин: 3–32 символа, только a–z, 0–9, _ и -',
      success: null,
    }
  }
  if (password.length < 8) {
    return { error: 'Пароль: минимум 8 символов', success: null }
  }

  let campaignId: string
  try {
    const { campaign } = await requireOwner(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }

  const admin = createAdminClient()
  const email = loginToEmail(login)

  // Look up whether this auth-user already exists — we tolerate the case
  // where the login already belongs to someone (e.g., a DM in another
  // campaign). We attach them to this campaign without resetting their
  // password.
  const { data: existingProfile } = await admin
    .from('user_profiles')
    .select('user_id, login')
    .eq('login', login)
    .maybeSingle()

  let userId: string

  if (existingProfile) {
    userId = existingProfile.user_id

    // Already a member of this campaign? Reject — owner should use "reset
    // password" or "change role" on the existing row instead.
    const { data: existingMember } = await admin
      .from('campaign_members')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingMember) {
      return {
        error: `Пользователь "${login}" уже в этой кампании`,
        success: null,
      }
    }
  } else {
    // Fresh user. Create the auth row first.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created.user) {
      return {
        error: 'Не удалось создать пользователя: ' + (createErr?.message ?? 'unknown'),
        success: null,
      }
    }
    userId = created.user.id

    const { error: profileErr } = await admin.from('user_profiles').insert({
      user_id: userId,
      login,
      display_name: login,
      must_change_password: true,
    })
    if (profileErr) {
      // Roll back the auth user so we don't leave orphans.
      await admin.auth.admin.deleteUser(userId).catch(() => {})
      return {
        error: 'Не удалось создать профиль: ' + profileErr.message,
        success: null,
      }
    }
  }

  const { error: memberErr } = await admin.from('campaign_members').insert({
    campaign_id: campaignId,
    user_id: userId,
    role,
  })
  if (memberErr) {
    return {
      error: 'Не удалось добавить в кампанию: ' + memberErr.message,
      success: null,
    }
  }

  revalidatePath(`/c/${slug}/members`)
  return { error: null, success: `Добавлен ${login} (${role})` }
}

/**
 * Force-reset a member's password. Sets must_change_password=true so the user
 * is redirected to /onboarding on next login.
 */
export async function resetPasswordAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get('user_id') ?? '')
  const newPassword = String(formData.get('new_password') ?? '')

  if (!userId) return { error: 'Нет user_id', success: null }
  if (newPassword.length < 8) {
    return { error: 'Пароль: минимум 8 символов', success: null }
  }

  try {
    await requireOwner(slug)
  } catch {
    return { error: 'Нет прав', success: null }
  }

  const admin = createAdminClient()

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  })
  if (updErr) {
    return { error: 'Не удалось сменить пароль: ' + updErr.message, success: null }
  }

  const { error: flagErr } = await admin
    .from('user_profiles')
    .update({ must_change_password: true })
    .eq('user_id', userId)
  if (flagErr) {
    return {
      error: 'Пароль сменён, но не удалось выставить флаг смены: ' + flagErr.message,
      success: null,
    }
  }

  revalidatePath(`/c/${slug}/members`)
  return { error: null, success: 'Пароль сброшен. Пользователь сменит его при входе.' }
}

/**
 * Remove a member from this campaign. The auth-user is NOT deleted — they may
 * belong to other campaigns.
 *
 * Blocks:
 *   - self-removal (owner can't kick themselves)
 *   - removing the owner of the campaign
 */
export async function removeMemberAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get('user_id') ?? '')
  if (!userId) return { error: 'Нет user_id', success: null }

  let callerId: string
  let campaignId: string
  try {
    const { user, campaign } = await requireOwner(slug)
    callerId = user.id
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }

  if (userId === callerId) {
    return { error: 'Нельзя удалить себя', success: null }
  }

  const admin = createAdminClient()

  // Refuse to remove the owner row.
  const { data: target } = await admin
    .from('campaign_members')
    .select('role, user_profiles(login)')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!target) return { error: 'Участник не найден', success: null }
  if (target.role === 'owner') {
    return { error: 'Нельзя удалить владельца кампании', success: null }
  }

  const { error: delErr } = await admin
    .from('campaign_members')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
  if (delErr) {
    return { error: 'Не удалось удалить: ' + delErr.message, success: null }
  }

  const login =
    (target as { user_profiles?: { login?: string } | { login?: string }[] | null })
      .user_profiles &&
    (Array.isArray(
      (target as { user_profiles?: { login?: string } | { login?: string }[] | null }).user_profiles,
    )
      ? (
          (target as { user_profiles?: { login?: string }[] }).user_profiles as { login?: string }[]
        )[0]?.login
      : ((target as { user_profiles?: { login?: string } }).user_profiles as { login?: string })
          ?.login)

  revalidatePath(`/c/${slug}/members`)
  return { error: null, success: `${login ?? 'Участник'} удалён из кампании` }
}

/**
 * Change a member's role. Cannot demote the owner or promote anyone to owner
 * (owner transfer is out of scope for this increment; unique index enforces
 * one-owner-per-campaign at the DB level anyway).
 */
export async function updateMemberRoleAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = String(formData.get('user_id') ?? '')
  const role = String(formData.get('role') ?? '') as Role

  if (!userId) return { error: 'Нет user_id', success: null }
  if (role !== 'dm' && role !== 'player') {
    return { error: 'Можно назначить только ДМа или игрока', success: null }
  }

  let campaignId: string
  try {
    const { campaign } = await requireOwner(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }

  const admin = createAdminClient()

  const { data: target } = await admin
    .from('campaign_members')
    .select('role')
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!target) return { error: 'Участник не найден', success: null }
  if (target.role === 'owner') {
    return { error: 'Нельзя изменить роль владельца', success: null }
  }

  const { error: updErr } = await admin
    .from('campaign_members')
    .update({ role })
    .eq('campaign_id', campaignId)
    .eq('user_id', userId)
  if (updErr) {
    return { error: 'Не удалось сменить роль: ' + updErr.message, success: null }
  }

  revalidatePath(`/c/${slug}/members`)
  return { error: null, success: `Роль обновлена: ${role}` }
}
