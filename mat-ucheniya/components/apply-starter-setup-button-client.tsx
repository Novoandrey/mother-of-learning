'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { applyLoopStartSetup } from '@/app/actions/starter-setup'
import type { AffectedRow } from '@/lib/starter-setup'
import { ApplyConfirmDialog } from './apply-confirm-dialog'

/**
 * Spec-012 T026 — client wrapper around `applyLoopStartSetup`. Handles
 * the two-phase flow:
 *
 *   1. First click → call without `confirmed`. If result has
 *      `needsConfirmation`, open the dialog with the affected rows.
 *   2. Dialog confirm → call with `confirmed: true`. On success,
 *      `router.refresh()` so the loop page re-renders (banner gets
 *      hidden by the status check, ledger updates on
 *      /c/[slug]/accounting via the action's revalidatePath).
 *
 * Errors surface inline below the button — keeps us from pulling in a
 * toast library for one use. The error clears on the next click.
 */
export function ApplyStarterSetupButtonClient({
  loopNodeId,
}: {
  loopNodeId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirmData, setConfirmData] = useState<AffectedRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function runApply(confirmed: boolean) {
    setError(null)
    const result = await applyLoopStartSetup(loopNodeId, { confirmed })

    if ('needsConfirmation' in result) {
      setConfirmData(result.affected)
      return
    }
    if (!result.ok) {
      setError(result.error)
      return
    }

    // Happy path. Close dialog if open; refresh to re-evaluate banner
    // and pull fresh ledger data.
    setConfirmData(null)
    router.refresh()
  }

  return (
    <>
      <button
        type="button"
        onClick={() => startTransition(() => runApply(false))}
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Применяем…' : 'Применить'}
      </button>

      {error && (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      {confirmData && (
        <ApplyConfirmDialog
          affected={confirmData}
          onCancel={() => setConfirmData(null)}
          onConfirm={() => startTransition(() => runApply(true))}
          pending={pending}
        />
      )}
    </>
  )
}
