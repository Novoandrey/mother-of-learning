'use client'

/**
 * Spec-017 — Optimistic mark-paid checkbox.
 *
 * Один тап — flip paid_at. `useOptimistic` для instant UI; на server
 * fail — rollback + alert. Пишет в `toggleParticipantPaid`.
 *
 * Disabled visual для не-author/не-DM (canEdit=false). Hover prompt
 * объясняет почему — чтобы у обычного игрока не было ощущения
 * сломанной кнопки.
 */

import { useOptimistic, useTransition } from 'react'
import { toggleParticipantPaid } from '@/app/actions/contributions'

type Props = {
  participantId: string
  isPaid: boolean
  canEdit: boolean
}

export default function ContributionPoolCheckbox({
  participantId,
  isPaid,
  canEdit,
}: Props) {
  const [optimisticPaid, setOptimisticPaid] = useOptimistic(
    isPaid,
    (_state: boolean, next: boolean) => next,
  )
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (!canEdit || isPending) return
    const nextPaid = !optimisticPaid

    startTransition(async () => {
      setOptimisticPaid(nextPaid)
      const result = await toggleParticipantPaid({
        participantId,
        paid: nextPaid,
      })
      if (!result.ok) {
        // rollback вернёт следующий render через useOptimistic — мы
        // ничего не делаем, useOptimistic сам откатит на server-truth
        // после revalidatePath. Show alert чтобы юзер понял.
        // Use setTimeout — alert внутри transition может теряться.
        setTimeout(() => {
          alert(result.error ?? 'Не удалось обновить')
        }, 0)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canEdit || isPending}
      title={
        canEdit
          ? optimisticPaid
            ? 'Расжать — пометить «не сдал»'
            : 'Отметить «сдал»'
          : 'Только автор Складчины или ДМ может менять статусы'
      }
      aria-pressed={optimisticPaid}
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors ${
        optimisticPaid
          ? 'border-emerald-600 bg-emerald-600 text-white'
          : 'border-gray-300 bg-white text-transparent'
      } ${
        canEdit
          ? 'cursor-pointer hover:border-emerald-700'
          : 'cursor-not-allowed opacity-60'
      }`}
    >
      {optimisticPaid && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  )
}
