/**
 * Spec-017 — `<ContributionPoolCard>`.
 *
 * Server component. Один pool в списке. Inline-expandable: detail
 * (полная таблица участников) рендерится сразу, скрыта/показана через
 * `<details>` — no-JS work, бесплатная toggle-state.
 *
 * Header (всегда виден):
 *   • Title + сумма прогресса (`paid/total ₽`).
 *   • Author chip + payment_hint + copy button.
 *   • <UserPaymentHint /> справа.
 *
 * Body (раскрывается):
 *   • Таблица участников — чекбокс / имя / share / status.
 *   • Footer: action bar (Редактировать / Удалить) — только author/DM.
 *   • Overlay «удалено» если `deletedAt !== null`.
 *
 * Чекбоксы — `<ContributionPoolCheckbox>` client island. Edit/Delete
 * пока заглушки (T018 / T013) — рендерим кнопки, обработчики добавим
 * в EditForm.
 */

import type { ContributionPoolWithRows } from '@/lib/contributions'
import type { Role } from '@/lib/auth'
import ContributionPoolCheckbox from './contribution-pool-checkbox'
import UserPaymentHint from './user-payment-hint'
import CopyButton from './copy-button'

type Props = {
  pool: ContributionPoolWithRows
  currentUserId: string
  userRole: Role
  /** Edit/Delete управляется через `<ContributionPoolEditForm>` в page.
   *  Карточка получает callback-id что нужно открыть эту форму. */
  onEditId?: (poolId: string) => void
}

function formatRub(value: number): string {
  // Интуитивный display: 750 → "750", 33.34 → "33.34", 4500 → "4500".
  // Цент-precise.
  return value.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

export default function ContributionPoolCard({
  pool,
  currentUserId,
  userRole,
}: Props) {
  const isAuthor = pool.createdBy === currentUserId
  const isDM = userRole === 'dm' || userRole === 'owner'
  const canEdit = isAuthor || isDM

  const isDeleted = pool.deletedAt !== null
  const isFullyPaid = pool.archived && !isDeleted

  // Progress: 4 / 6 sided count.
  const paidCount = pool.participants.filter((p) => p.paidAt !== null).length
  const totalCount = pool.participants.length

  return (
    <details
      open={!pool.archived /* active pools developed by default */}
      className={`group rounded-lg border bg-white transition-colors ${
        isDeleted
          ? 'border-gray-200 opacity-60'
          : isFullyPaid
            ? 'border-emerald-200'
            : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <summary className="cursor-pointer list-none p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left: title + meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3
                className={`text-base font-semibold ${
                  isDeleted ? 'text-gray-500 line-through' : 'text-gray-900'
                }`}
              >
                {pool.title}
              </h3>
              {isDeleted && (
                <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                  удалено
                </span>
              )}
              {isFullyPaid && (
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  закрыто
                </span>
              )}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <span>Автор: {pool.authorDisplayName}</span>
              {pool.paymentHint && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <span className="text-gray-700">{pool.paymentHint}</span>
                    <CopyButton text={pool.paymentHint} />
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right: progress + hint */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="text-right text-sm">
              <span className="font-mono font-semibold text-gray-900">
                {formatRub(pool.paidSum)}
              </span>
              <span className="text-gray-400"> / </span>
              <span className="font-mono text-gray-600">
                {formatRub(pool.total)} ₽
              </span>
            </div>
            <div className="text-xs text-gray-500">
              {paidCount} / {totalCount} сдали
            </div>
            <UserPaymentHint pool={pool} currentUserId={currentUserId} />
          </div>
        </div>
      </summary>

      {/* Body: participant table */}
      <div className="border-t border-gray-100 px-4 py-3">
        <ul className="divide-y divide-gray-100">
          {pool.participants.map((p) => {
            const isPaid = p.paidAt !== null
            const isAdHoc = p.userId === null
            return (
              <li
                key={p.id}
                className="flex items-center gap-3 py-2"
              >
                <ContributionPoolCheckbox
                  participantId={p.id}
                  isPaid={isPaid}
                  canEdit={canEdit && !isDeleted}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-sm ${
                        isPaid ? 'text-gray-500' : 'text-gray-900'
                      }`}
                    >
                      {p.displayName}
                    </span>
                    {p.userId === pool.createdBy && (
                      <span className="text-xs text-blue-600">(автор)</span>
                    )}
                    {isAdHoc && (
                      <span className="text-xs text-gray-400">(внешний)</span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={`font-mono text-sm ${
                      isPaid ? 'text-gray-500' : 'text-gray-900'
                    }`}
                  >
                    {formatRub(p.share)} ₽
                  </div>
                  <div
                    className={`text-xs ${
                      isPaid ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {isPaid ? 'сдал' : 'должен'}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>

        {/* Action bar — author/DM only, hidden for deleted pools */}
        {canEdit && !isDeleted && (
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            {/* Edit/Delete опираются на client form — линкуем через
                URL ?edit=<poolId> чтобы page.tsx мог отдетектить и
                развернуть EditForm над списком. */}
            <a
              href={`?edit=${pool.id}`}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Редактировать
            </a>
          </div>
        )}
      </div>
    </details>
  )
}
