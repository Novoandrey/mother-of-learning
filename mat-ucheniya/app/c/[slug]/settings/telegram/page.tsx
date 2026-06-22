import { notFound, redirect } from 'next/navigation'
import { getCampaignBySlug } from '@/lib/campaign'
import { getMembership, requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { TelegramLinksClient, type LinkRow } from './telegram-client'

/**
 * DM/owner surface (spec-046, C-01 б): bind a Telegram user id to a member
 * account. Desktop — players never see this. Reachable at
 * /c/<slug>/settings/telegram.
 */
export default async function TelegramLinksPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const campaign = await getCampaignBySlug(slug)
  if (!campaign) notFound()

  await requireAuth()
  const membership = await getMembership(campaign.id)
  if (!membership) notFound()
  if (membership.role !== 'owner' && membership.role !== 'dm') {
    redirect(`/c/${slug}`)
  }

  const admin = createAdminClient()
  const { data: memberRows } = await admin
    .from('campaign_members')
    .select('user_id, role')
    .eq('campaign_id', campaign.id)
  const userIds = (memberRows ?? []).map((r) => r.user_id)

  let rows: LinkRow[] = []
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from('user_profiles')
      .select('user_id, login, display_name, telegram_id')
      .in('user_id', userIds)
    const roleByUser = new Map(
      (memberRows ?? []).map((r) => [r.user_id, r.role as string]),
    )
    rows = (
      (profiles ?? []) as Array<{
        user_id: string
        login: string
        display_name: string | null
        telegram_id: number | null
      }>
    )
      .map((p) => ({
        userId: p.user_id,
        login: p.login,
        displayName: p.display_name,
        telegramId: p.telegram_id != null ? String(p.telegram_id) : null,
        role: roleByUser.get(p.user_id) ?? 'player',
      }))
      .sort((a, b) => a.login.localeCompare(b.login))
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Привязка Telegram</h1>
      <p className="mt-1 text-sm text-gray-500">
        Игрок открывает Mini App, видит свой <code>telegram_id</code> и присылает
        его сюда. Впишите id напротив аккаунта и привяжите.
      </p>
      <TelegramLinksClient campaignId={campaign.id} slug={slug} rows={rows} />
    </div>
  )
}
