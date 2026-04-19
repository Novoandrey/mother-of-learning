'use client'

import { useActionState } from 'react'
import { changePasswordOnboardingAction } from './actions'

const initialState = { error: null as string | null }

export function OnboardingForm({ login }: { login: string }) {
  const [state, formAction, pending] = useActionState(
    changePasswordOnboardingAction,
    initialState,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div
        className="rounded-[var(--radius)] px-3 py-2 text-[12px]"
        style={{ background: 'var(--gray-50)', color: 'var(--gray-700)' }}
      >
        Логин: <span className="font-mono font-semibold">{login}</span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
          Новый пароль (минимум 8 символов)
        </span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          autoFocus
          className="rounded-[var(--radius)] border px-3 py-2 text-[14px] outline-none"
          style={{ borderColor: 'var(--gray-300)' }}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium" style={{ color: 'var(--gray-600)' }}>
          Подтверждение
        </span>
        <input
          type="password"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
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
        {pending ? 'Сохраняю…' : 'Сохранить пароль'}
      </button>
    </form>
  )
}
