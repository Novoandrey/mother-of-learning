import Link from 'next/link'
import { getCurrentUserAndProfile } from '@/lib/auth'

/**
 * Small user menu for the app header. Shows the login and two links:
 * Account settings and Sign out (as a POST form to the signout route).
 * Renders nothing when not authenticated.
 */
export async function UserMenu() {
  const result = await getCurrentUserAndProfile()
  if (!result?.profile) return null
  const { profile } = result

  return (
    <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--gray-600)' }}>
      <Link
        href="/account"
        className="font-mono font-semibold hover:underline"
        style={{ color: 'var(--fg-1)' }}
        title="Настройки аккаунта"
      >
        {profile.display_name || profile.login}
      </Link>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="cursor-pointer rounded-[var(--radius)] px-2 py-1 text-[11px] transition-colors hover:bg-[var(--gray-100)]"
          style={{ color: 'var(--gray-500)' }}
        >
          Выйти
        </button>
      </form>
    </div>
  )
}
