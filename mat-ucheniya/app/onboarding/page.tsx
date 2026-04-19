import { redirect } from 'next/navigation'
import { getCurrentUserAndProfile } from '@/lib/auth'
import { OnboardingForm } from './onboarding-form'

export default async function OnboardingPage() {
  const result = await getCurrentUserAndProfile()
  if (!result) redirect('/login')
  const { profile } = result
  if (!profile) redirect('/login')

  // If the user has already changed their password, don't show this page.
  if (!profile.must_change_password) redirect('/')

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'var(--bg-0)' }}
    >
      <div
        className="w-full max-w-sm rounded-[var(--radius-lg)] border p-6"
        style={{
          background: 'white',
          borderColor: 'var(--gray-200)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h1
          className="mb-1 text-[18px] font-semibold"
          style={{ color: 'var(--fg-1)' }}
        >
          Смените пароль
        </h1>
        <p
          className="mb-6 text-[12px]"
          style={{ color: 'var(--gray-500)' }}
        >
          Начальный пароль выдал вам ДМ. Задайте свой — он никому не
          будет виден.
        </p>
        <OnboardingForm login={profile.login} />
      </div>
    </div>
  )
}
