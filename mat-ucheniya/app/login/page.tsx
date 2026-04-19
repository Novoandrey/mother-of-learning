import { LoginForm } from './login-form'

export default function LoginPage() {
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
          Мать Учения
        </h1>
        <p
          className="mb-6 text-[12px]"
          style={{ color: 'var(--gray-500)' }}
        >
          Войдите, чтобы продолжить
        </p>
        <LoginForm />
      </div>
    </div>
  )
}
