/**
 * Spec-017 — Per-user hint chip для Складчины.
 *
 * Pure render. Один из 4 состояний:
 *   • Автор pool'а → серый chip «Автор» (т.к. собирает деньги, не сдаёт).
 *   • Участник unpaid → красный «ты должен N ₽».
 *   • Участник paid → зелёный «ты сдал ✓».
 *   • Не участник → серый «не участвую».
 *
 * Используется на `<ContributionPoolCard>`. Логика — в одном месте,
 * чтобы не размазывать «как hint считается» по 4 разным render-путям.
 */

import type { ContributionPoolWithRows } from '@/lib/contributions'

type Props = {
  pool: ContributionPoolWithRows
  currentUserId: string
}

export default function UserPaymentHint({ pool, currentUserId }: Props) {
  // 1. Автор?
  if (pool.createdBy === currentUserId) {
    return (
      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
        Автор
      </span>
    )
  }

  // 2. Найти строку участника по user_id.
  const myRow = pool.participants.find((p) => p.userId === currentUserId)

  if (!myRow) {
    return (
      <span className="inline-flex items-center rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-500">
        не участвую
      </span>
    )
  }

  if (myRow.paidAt !== null) {
    return (
      <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        ты сдал ✓
      </span>
    )
  }

  return (
    <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      ты должен {myRow.share.toFixed(2)} ₽
    </span>
  )
}
