'use client'

/**
 * Spec-017 — `<ContributionPoolEditForm>`.
 *
 * Pre-fills с pool. Paid rows заморожены: nельзя удалить, нельзя
 * изменить share. Edit-form вызывает 2 действия:
 *   • `updateContributionPoolHeader` — title / payment_hint / total.
 *   • `replaceContributionParticipants` — diff участников.
 * Плюс кнопка `Удалить Складчину` → `softDeleteContributionPool`.
 *
 * Отдельный компонент от CreateForm — UI похожи, но логика
 * pre-fill + paid-freeze добавляет 100+ строк, и я не хочу один
 * мега-компонент с 5 if-веток. Reuse — на уровне утилит, не JSX.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  replaceContributionParticipants,
  softDeleteContributionPool,
  updateContributionPoolHeader,
} from '@/app/actions/contributions'
import { canReduceTotal, sharesMatchTotal, splitEqual, sumShares } from '@/lib/contribution-split'
import type { ContributionPoolWithRows } from '@/lib/contributions'
import type { CampaignMemberOption } from './contribution-pool-create-form'

type ParticipantDraft = {
  key: string
  // Если есть `existingId` — это был initially loaded row (paid|unpaid).
  existingId?: string
  paid: boolean
  userId: string | null
  displayName: string
  share: number
}

type Props = {
  pool: ContributionPoolWithRows
  members: CampaignMemberOption[]
  onCancel: () => void
}

let _keyCounter = 0
function nextKey() {
  return `e_${++_keyCounter}`
}

export default function ContributionPoolEditForm({
  pool,
  members,
  onCancel,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [title, setTitle] = useState(pool.title)
  const [paymentHint, setPaymentHint] = useState(pool.paymentHint ?? '')
  const [totalStr, setTotalStr] = useState(String(pool.total))

  const [participants, setParticipants] = useState<ParticipantDraft[]>(() =>
    pool.participants.map((p) => ({
      key: nextKey(),
      existingId: p.id,
      paid: p.paidAt !== null,
      userId: p.userId,
      displayName: p.displayName,
      share: p.share,
    })),
  )
  const [adHocInput, setAdHocInput] = useState('')

  const total = parseFloat(totalStr)
  const totalValid = Number.isFinite(total) && total > 0

  const sumOfShares = sumShares(participants.map((p) => p.share))
  const sumMatches =
    totalValid && sharesMatchTotal(participants.map((p) => p.share), total)

  // Reduce-guard: можно ли уменьшить total до текущего значения, если
  // он меньше суммы paid строк. Подсветить в banner отдельно от
  // sum-mismatch — это другая проблема.
  const reduceCheck = totalValid
    ? canReduceTotal(
        total,
        participants.map((p) => ({ share: p.share, paid: p.paid })),
      )
    : { ok: true as const }

  const isValid =
    title.trim().length > 0 &&
    totalValid &&
    participants.length >= 1 &&
    sumMatches &&
    reduceCheck.ok

  function toggleMember(member: CampaignMemberOption) {
    const existing = participants.find((p) => p.userId === member.userId)
    if (existing?.paid) {
      setSubmitError(
        `Нельзя убрать «${existing.displayName}» — он уже сдал. ` +
          `Сначала расжми чекбокс на странице.`,
      )
      return
    }
    setSubmitError(null)
    setParticipants((current) => {
      const cur = current.find((p) => p.userId === member.userId)
      if (cur) return current.filter((p) => p.userId !== member.userId)
      return [
        ...current,
        {
          key: nextKey(),
          paid: false,
          userId: member.userId,
          displayName: member.displayName,
          share: 0,
        },
      ]
    })
  }

  function addAdHoc() {
    const name = adHocInput.trim()
    if (!name) return
    setParticipants((current) => [
      ...current,
      {
        key: nextKey(),
        paid: false,
        userId: null,
        displayName: name,
        share: 0,
      },
    ])
    setAdHocInput('')
  }

  function removeParticipant(key: string) {
    const target = participants.find((p) => p.key === key)
    if (target?.paid) {
      setSubmitError(
        `Нельзя удалить «${target.displayName}» — он уже сдал.`,
      )
      return
    }
    setSubmitError(null)
    setParticipants((current) => current.filter((p) => p.key !== key))
  }

  function updateShare(key: string, shareStr: string) {
    const target = participants.find((p) => p.key === key)
    if (target?.paid) return // frozen
    const parsed = parseFloat(shareStr)
    const value = Number.isFinite(parsed) ? Math.max(0, parsed) : 0
    setParticipants((current) =>
      current.map((p) => (p.key === key ? { ...p, share: value } : p)),
    )
  }

  function splitEqually() {
    if (!totalValid) {
      setSubmitError('Сначала укажи общую сумму')
      return
    }
    if (participants.length === 0) {
      setSubmitError('Сначала добавь хотя бы одного участника')
      return
    }
    setSubmitError(null)

    // Paid строки замораживают свою долю; новые равные доли расходятся
    // только между unpaid строками.
    const paidParts = participants.filter((p) => p.paid)
    const unpaidParts = participants.filter((p) => !p.paid)
    const paidSum = sumShares(paidParts.map((p) => p.share))
    const remaining = total - paidSum

    if (remaining < 0) {
      setSubmitError(
        `Сумма заморожена paid-строками (${paidSum.toFixed(2)}) ` +
          `больше нового total. Сначала расжми чекбоксы.`,
      )
      return
    }

    if (unpaidParts.length === 0) {
      // Все paid — нечего делить, но и не ошибка. Если total
      // изменился — это покажется в баннере sum-mismatch.
      return
    }

    if (remaining === 0) {
      setParticipants((current) =>
        current.map((p) => (p.paid ? p : { ...p, share: 0 })),
      )
      return
    }

    const shares = splitEqual(remaining, unpaidParts.length)
    let unpaidIdx = 0
    setParticipants((current) =>
      current.map((p) => {
        if (p.paid) return p
        const share = shares[unpaidIdx++]
        return { ...p, share }
      }),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!isValid) return

    startTransition(async () => {
      // 1. Header update — если что-то изменилось.
      const headerChanged =
        title.trim() !== pool.title ||
        (paymentHint.trim() || null) !== pool.paymentHint ||
        total !== pool.total

      if (headerChanged) {
        const result = await updateContributionPoolHeader({
          poolId: pool.id,
          title: title.trim(),
          paymentHint: paymentHint.trim() || null,
          total,
        })
        if (!result.ok) {
          setSubmitError(result.error)
          return
        }
      }

      // 2. Participants replace.
      const result = await replaceContributionParticipants({
        poolId: pool.id,
        participants: participants.map((p) => ({
          id: p.existingId,
          userId: p.userId,
          displayName: p.displayName,
          share: p.share,
        })),
      })

      if (!result.ok) {
        setSubmitError(result.error)
        return
      }

      router.refresh()
      onCancel()
    })
  }

  async function handleDelete() {
    if (!confirm(`Удалить Складчину «${pool.title}»? Это soft-delete; восстановить можно только через SQL.`)) {
      return
    }
    setSubmitError(null)
    startTransition(async () => {
      const result = await softDeleteContributionPool(pool.id)
      if (!result.ok) {
        setSubmitError(result.error)
        return
      }
      router.refresh()
      onCancel()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-blue-300 bg-blue-50 p-4"
    >
      <div className="text-xs font-medium uppercase tracking-wider text-blue-700">
        Редактирование: {pool.title}
      </div>

      <div className="space-y-1">
        <label htmlFor="edit-title" className="text-xs font-medium text-gray-700">
          Название
        </label>
        <input
          id="edit-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          required
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="edit-hint" className="text-xs font-medium text-gray-700">
          Реквизиты <span className="text-gray-400">(опционально)</span>
        </label>
        <input
          id="edit-hint"
          type="text"
          value={paymentHint}
          onChange={(e) => setPaymentHint(e.target.value)}
          maxLength={200}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="edit-total" className="text-xs font-medium text-gray-700">
          Общая сумма (₽)
        </label>
        <input
          id="edit-total"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          value={totalStr}
          onChange={(e) => setTotalStr(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Member toggles — paid members are not removable */}
      {members.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-2">
          <div className="mb-1 text-xs text-gray-500">Из кампании:</div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => {
              const row = participants.find((p) => p.userId === m.userId)
              const checked = row !== undefined
              const frozen = row?.paid ?? false
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => toggleMember(m)}
                  disabled={frozen}
                  title={frozen ? 'Уже сдал — сначала расжми чекбокс' : undefined}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    checked
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  } ${frozen ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {checked && '✓ '}
                  {m.displayName}
                  {frozen && ' 🔒'}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-2">
        <div className="mb-1 text-xs text-gray-500">Свободно:</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={adHocInput}
            onChange={(e) => setAdHocInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addAdHoc()
              }
            }}
            maxLength={100}
            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addAdHoc}
            disabled={!adHocInput.trim()}
            className="rounded-md border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Добавить
          </button>
        </div>
      </div>

      {/* Shares — paid rows frozen */}
      {participants.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">
              Доли ({participants.length})
            </span>
            <button
              type="button"
              onClick={splitEqually}
              disabled={!totalValid}
              className="text-sm text-blue-600 hover:underline disabled:text-gray-400"
            >
              Разделить поровну (только unpaid)
            </button>
          </div>

          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {participants.map((p) => (
              <li key={p.key} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                  {p.displayName}
                  {p.userId === null && (
                    <span className="ml-1 text-xs text-gray-400">(внешний)</span>
                  )}
                  {p.paid && <span className="ml-1 text-xs text-emerald-600">сдал 🔒</span>}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={p.share === 0 ? '' : p.share}
                  onChange={(e) => updateShare(p.key, e.target.value)}
                  disabled={p.paid}
                  placeholder="0.00"
                  className="w-24 rounded-md border border-gray-200 px-2 py-1 text-right font-mono text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                />
                <span className="text-xs text-gray-500">₽</span>
                <button
                  type="button"
                  onClick={() => removeParticipant(p.key)}
                  disabled={p.paid}
                  aria-label="Убрать"
                  className="text-sm text-gray-400 hover:text-red-500 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {!sumMatches && totalValid && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Сумма не бьётся: {sumOfShares.toFixed(2)} ≠ {total.toFixed(2)}.
              Разница: {(total - sumOfShares).toFixed(2)}.
            </div>
          )}

          {!reduceCheck.ok && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {reduceCheck.reason}
            </div>
          )}
        </div>
      )}

      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Удалить Складчину
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!isValid || isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </form>
  )
}
