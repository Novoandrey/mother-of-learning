import { requireAuth } from '@/lib/auth'
import { AccountForm } from './account-form'

export default async function AccountPage() {
  const { profile } = await requireAuth()

  return (
    <div
      className="mx-auto max-w-xl px-4 py-8"
      style={{ color: 'var(--fg-1)' }}
    >
      <h1 className="mb-6 text-[20px] font-semibold">Аккаунт</h1>

      <div
        className="mb-6 rounded-[var(--radius-lg)] border p-4"
        style={{ borderColor: 'var(--gray-200)' }}
      >
        <div className="mb-1 text-[11px] uppercase" style={{ color: 'var(--gray-500)' }}>
          Логин
        </div>
        <div className="font-mono text-[14px] font-semibold">{profile.login}</div>
        {profile.display_name && profile.display_name !== profile.login && (
          <>
            <div
              className="mt-3 mb-1 text-[11px] uppercase"
              style={{ color: 'var(--gray-500)' }}
            >
              Имя
            </div>
            <div className="text-[14px]">{profile.display_name}</div>
          </>
        )}
      </div>

      <div
        className="rounded-[var(--radius-lg)] border p-4"
        style={{ borderColor: 'var(--gray-200)' }}
      >
        <h2 className="mb-4 text-[14px] font-semibold">Сменить пароль</h2>
        <AccountForm />
      </div>
    </div>
  )
}
