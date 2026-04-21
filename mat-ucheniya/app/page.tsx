import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserAndProfile } from '@/lib/auth'

export default async function Home() {
  const result = await getCurrentUserAndProfile()

  // Middleware should have redirected anonymous users, but belt-and-suspenders.
  if (!result) redirect('/login')
  const { user, profile } = result
  if (!profile) redirect('/login')
  if (profile.must_change_password) redirect('/onboarding')

  // Find campaigns the user is a member of.
  const supabase = await createClient()
  const { data: memberships } = await supabase
    .from('campaign_members')
    .select('role, campaign:campaigns(slug, name)')
    .eq('user_id', user.id)

  type CampaignShort = { slug: string; name: string }
  type MembershipRow = {
    role: string
    campaign: CampaignShort | CampaignShort[] | null
  }

  const rows = ((memberships ?? []) as MembershipRow[]).flatMap((m) => {
    const c = Array.isArray(m.campaign) ? m.campaign[0] : m.campaign
    return c ? [{ slug: c.slug, name: c.name, role: m.role }] : []
  })

  if (rows.length === 0) {
    // Authenticated but not attached to any campaign — show a friendly stub
    // with a sign-out button, otherwise the user would be stuck.
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4"
        style={{ background: 'var(--bg-0)' }}
      >
        <div
          className="w-full max-w-md rounded-[var(--radius-lg)] border p-6 text-center"
          style={{
            background: 'white',
            borderColor: 'var(--gray-200)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <h1 className="mb-2 text-[18px] font-semibold" style={{ color: 'var(--fg-1)' }}>
            Нет доступа
          </h1>
          <p className="mb-6 text-[12px]" style={{ color: 'var(--gray-500)' }}>
            Вы вошли как <span className="font-mono font-semibold">{profile.login}</span>,
            но ни в одной кампании не состоите. Свяжитесь с ДМом.
          </p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-[var(--radius)] px-3 py-2 text-[13px] font-medium transition-colors"
              style={{ background: 'var(--gray-100)', color: 'var(--gray-700)' }}
            >
              Выйти
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (rows.length === 1) {
    redirect(`/c/${rows[0].slug}/catalog`)
  }

  // Multiple campaigns: simple list.
  return (
    <div className="mx-auto max-w-xl px-4 py-8" style={{ color: 'var(--fg-1)' }}>
      <h1 className="mb-6 text-[20px] font-semibold">Ваши кампании</h1>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li key={r.slug}>
            <a
              href={`/c/${r.slug}/catalog`}
              className="block rounded-[var(--radius-md)] border px-4 py-3 transition-colors hover:bg-[var(--gray-50)]"
              style={{ borderColor: 'var(--gray-200)' }}
            >
              <div className="font-semibold">{r.name}</div>
              <div className="text-[11px]" style={{ color: 'var(--gray-500)' }}>
                {r.role === 'owner' ? 'владелец' : r.role === 'dm' ? 'ДМ' : 'игрок'}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
