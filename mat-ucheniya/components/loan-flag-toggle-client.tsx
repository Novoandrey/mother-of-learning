'use client'

import { useState, useTransition } from 'react'

import { setPcTakesStartingLoan } from '@/app/actions/starter-setup'

/**
 * Spec-012 T030 — loan-flag toggle. Two variants:
 *
 *   * `interactive=false` — static display (used for non-owner
 *     players viewing someone else's PC when we still want to surface
 *     the flag value).
 *   * `interactive=true` — checkbox-style toggle. Optimistic local
 *     state; rolls back on error.
 *
 * The permission check lives in the server action
 * (`setPcTakesStartingLoan`) — this component trusts the parent to
 * pass `interactive=true` only for DM/owner or for the PC's own
 * owner. RLS is still the hard boundary.
 */
export function LoanFlagToggleClient({
  pcId,
  initialValue,
  interactive,
}: {
  pcId: string
  initialValue: boolean
  interactive: boolean
}) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!interactive) {
    return (
      <p className="text-sm text-gray-700">
        Берёт стартовый кредит:{' '}
        <span className="font-medium">{initialValue ? '✅ да' : '❌ нет'}</span>
      </p>
    )
  }

  async function handleToggle(next: boolean) {
    setError(null)
    const prev = value
    setValue(next) // optimistic

    const result = await setPcTakesStartingLoan(pcId, next)
    if (!result.ok) {
      setValue(prev) // rollback
      setError(result.error)
    }
  }

  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={value}
          disabled={pending}
          onChange={(e) =>
            startTransition(() => {
              void handleToggle(e.target.checked)
            })
          }
          className="h-4 w-4 accent-blue-600"
        />
        Берёт стартовый кредит
      </label>
      {error && (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
