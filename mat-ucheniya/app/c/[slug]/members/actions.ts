'use server'

import { revalidatePath } from 'next/cache'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, loginToEmail, requireAuth, type Role } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

type ActionState = { error: string | null; success: string | null }

const LOGIN_REGEX = /^[a-z0-9_-]{3,32}$/

/**
 * Gate: the action caller must be an owner OR a dm of the campaign.
 * DMs have full management rights in this project.
 * Throws on unauthorized access.
 */
async function requireManager(slug: string) {
  const { user } = await requireAuth()
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) throw new Error('Campaign not found')
  const membership = await getMembership(campaign.id)
  if (!membership || (membership.role !== 'owner' && membership.role !== 'dm')) {
    throw new Error('Forbidden')
  }
  return { user, campaign, membership }
}

/**
 * Create a new member (role: 'dm' or 'player').
 * Creates an auth-user via admin API (email confirmation skipped), upserts
 * user_profiles with must_change_password=true, inserts campaign_members.
 *
 * For role='player' an optional `bind_pc_id` may be passed — if provided,
 * after the membership is inserted we claim ownership of that character-node
 * by setting nodes.owner_user_id = new user. The bind is best-effort: if it
 * fails, we surface a partial-success message (user created, bind failed)
 * rather than rolling back the whole operation.
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
  const bindPcIdRaw = String(formData.get('bind_pc_id') ?? '').trim()
  const bindPcId = bindPcIdRaw && bindPcIdRaw !== '__none__' ? bindPcIdRaw : null

  // Role whitelist for this increment: dm or player. Owner is never assigned
  // through the UI (unique DB index enforces one owner per campaign anyway).
  if (role !== 'dm' && role !== 'player') {
    return { error: 'Можно создать только ДМа или игрока', success: null }
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
  if (bindPcId && role !== 'player') {
    return { error: 'Привязка к PC доступна только для игроков', success: null }
  }

  let campaignId: string
  try {
    const { campaign } = await requireManager(slug)
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

  // Optional PC bind (players only). Best-effort: membership stays even if
  // the bind fails, we just warn in the success message.
  let bindWarning: string | null = null
  if (role === 'player' && bindPcId) {
    // Validate: node exists, type=character, belongs to this campaign,
    // currently unowned. Service-role client bypasses RLS — we check the
    // invariants explicitly here.
    const { data: targetNode } = await admin
      .from('nodes')
      .select('id, campaign_id, owner_user_id, type:node_types(slug)')
      .eq('id', bindPcId)
      .maybeSingle()

    const typeSlug = Array.isArray((targetNode as any)?.type)
      ? (targetNode as any).type[0]?.slug
      : (targetNode as any)?.type?.slug

    if (!targetNode || targetNode.campaign_id !== campaignId) {
      bindWarning = 'PC-нода не найдена в этой кампании'
    } else if (typeSlug !== 'character') {
      bindWarning = 'Выбранная нода не является персонажем'
    } else if (targetNode.owner_user_id && targetNode.owner_user_id !== userId) {
      bindWarning = 'У PC уже есть владелец'
    } else {
      const { error: bindErr } = await admin
        .from('nodes')
        .update({ owner_user_id: userId })
        .eq('id', bindPcId)
      if (bindErr) {
        bindWarning = 'Не удалось привязать PC: ' + bindErr.message
      }
    }
  }

  revalidatePath(`/c/${slug}/members`)
  if (bindWarning) {
    return {
      error: null,
      success: `Добавлен ${login} (${role}). ⚠ ${bindWarning}`,
    }
  }
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
    await requireManager(slug)
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
    const { user, campaign } = await requireManager(slug)
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
    const { campaign } = await requireManager(slug)
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

/**
 * Bind or unbind the owner of a character-node (PC).
 *
 * Form fields:
 *   - node_id:  the character-node id
 *   - user_id:  the new owner's user_id, OR '__none__' / '' to unbind
 *
 * Gate: requireManager (owner or dm) — players cannot reassign ownership.
 * Validations:
 *   - node exists, belongs to this campaign, type = 'character'
 *   - if binding (user_id != none): target user must be a member of this
 *     campaign (any role — the spec only restricts at UI level, but the
 *     action just requires membership)
 */
export async function bindPcOwnerAction(
  slug: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const nodeId = String(formData.get('node_id') ?? '').trim()
  const rawUserId = String(formData.get('user_id') ?? '').trim()
  const unbind = rawUserId === '' || rawUserId === '__none__'
  const targetUserId = unbind ? null : rawUserId

  if (!nodeId) return { error: 'Нет node_id', success: null }

  let campaignId: string
  try {
    const { campaign } = await requireManager(slug)
    campaignId = campaign.id
  } catch {
    return { error: 'Нет прав', success: null }
  }

  const admin = createAdminClient()

  // Validate the node.
  const { data: node } = await admin
    .from('nodes')
    .select('id, campaign_id, type:node_types(slug)')
    .eq('id', nodeId)
    .maybeSingle()

  if (!node || node.campaign_id !== campaignId) {
    return { error: 'PC-нода не найдена в этой кампании', success: null }
  }
  const typeSlug = Array.isArray((node as any).type)
    ? (node as any).type[0]?.slug
    : (node as any).type?.slug
  if (typeSlug !== 'character') {
    return { error: 'Это не PC-нода', success: null }
  }

  // If binding: verify the target is a member of this campaign.
  if (targetUserId) {
    const { data: targetMember } = await admin
      .from('campaign_members')
      .select('user_id, role')
      .eq('campaign_id', campaignId)
      .eq('user_id', targetUserId)
      .maybeSingle()
    if (!targetMember) {
      return { error: 'Пользователь не является членом кампании', success: null }
    }
  }

  const { error: updErr } = await admin
    .from('nodes')
    .update({ owner_user_id: targetUserId })
    .eq('id', nodeId)
  if (updErr) {
    return { error: 'Не удалось обновить владельца: ' + updErr.message, success: null }
  }

  revalidatePath(`/c/${slug}/catalog/${nodeId}`)
  return {
    error: null,
    success: unbind ? 'Владелец снят' : 'Владелец назначен',
  }
}
