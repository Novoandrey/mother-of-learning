'use client'

import { useActionState } from 'react'
import { signInAction } from './actions'

const initialState = { error: null as string | null }

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
          Логин
        </span>
        <input
          type="text"
          name="login"
          autoComplete="username"
          required
          autoFocus
          className="rounded-[var(--radius)] border px-3 py-2 text-[14px] outline-none"
          style={{ borderColor: 'var(--gray-300)' }}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
          Пароль
        </span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          className="rounded-[var(--radius)] border px-3 py-2 text-[14px] outline-none"
          style={{ borderColor: 'var(--gray-300)' }}
        />
      </label>

      {state.error && (
        <div
          className="rounded-[var(--radius)] px-3 py-2 text-[12px]"
          style={{ background: 'var(--red-50)', color: 'var(--red-700)' }}
        >
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius)] px-3 py-2 text-[13px] font-medium text-white transition-colors disabled:opacity-60"
        style={{ background: 'var(--blue-600)' }}
      >
        {pending ? 'Вход…' : 'Войти'}
      </button>
    </form>
  )
}
