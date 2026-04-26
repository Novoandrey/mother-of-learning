'use client'

/**
 * Spec-017 — `<ContributionPoolCreateForm>`.
 *
 * Inline form (collapsible, обёрнутая в page.tsx). Поля:
 *   • Title (text)
 *   • Реквизиты (text, optional)
 *   • Общая сумма (number)
 *   • Multi-select member'ов кампании
 *   • Свободный input «добавить вручную» (Enter add → array)
 *   • Per-row share с кнопкой «Разделить поровну»
 *   • Live баннер «Сумма не бьётся» если invalid
 *   • Submit / Cancel
 *
 * Использует `splitEqual` для авто-расчёта equal split, `sharesMatchTotal`
 * для live-валидации. Submit вызывает `createContributionPool` server
 * action; на success — закрывает форму, `router.refresh()`.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { createContributionPool } from '@/app/actions/contributions'
import { sharesMatchTotal, splitEqual, sumShares } from '@/lib/contribution-split'

export type CampaignMemberOption = {
  userId: string
  displayName: string
}

type ParticipantDraft = {
  // Stable client-side id для key prop.
  key: string
  userId: string | null
  displayName: string
  share: number // в рублях, 2 decimals
}

type Props = {
  campaignId: string
  members: CampaignMemberOption[]
  onCancel?: () => void
}

let _keyCounter = 0
function nextKey() {
  return `p_${++_keyCounter}`
}

export default function ContributionPoolCreateForm({
  campaignId,
  members,
  onCancel,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [paymentHint, setPaymentHint] = useState('')
  const [totalStr, setTotalStr] = useState('')
  const [participants, setParticipants] = useState<ParticipantDraft[]>([])
  const [adHocInput, setAdHocInput] = useState('')

  const total = parseFloat(totalStr)
  const totalValid = Number.isFinite(total) && total > 0

  const sumOfShares = sumShares(participants.map((p) => p.share))
  const sumMatches =
    totalValid && sharesMatchTotal(participants.map((p) => p.share), total)

  const isValid =
    title.trim().length > 0 &&
    totalValid &&
    participants.length >= 1 &&
    sumMatches

  function toggleMember(member: CampaignMemberOption) {
    setParticipants((current) => {
      const existing = current.find((p) => p.userId === member.userId)
      if (existing) {
        return current.filter((p) => p.userId !== member.userId)
      }
      return [
        ...current,
        {
          key: nextKey(),
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
        userId: null,
        displayName: name,
        share: 0,
      },
    ])
    setAdHocInput('')
  }

  function removeParticipant(key: string) {
    setParticipants((current) => current.filter((p) => p.key !== key))
  }

  function updateShare(key: string, shareStr: string) {
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
    const shares = splitEqual(total, participants.length)
    setParticipants((current) =>
      current.map((p, i) => ({ ...p, share: shares[i] })),
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)
    if (!isValid) return

    startTransition(async () => {
      const result = await createContributionPool({
        campaignId,
        title: title.trim(),
        paymentHint: paymentHint.trim() || null,
        total,
        participants: participants.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          share: p.share,
        })),
      })

      if (!result.ok) {
        setSubmitError(result.error)
        return
      }

      // Success — reset + refresh to surface new pool.
      setTitle('')
      setPaymentHint('')
      setTotalStr('')
      setParticipants([])
      router.refresh()
      if (onCancel) onCancel()
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-blue-200 bg-blue-50/50 p-4"
    >
      <div className="space-y-1">
        <label
          htmlFor="title"
          className="text-xs font-medium text-gray-700"
        >
          Название
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Пицца 24 апреля"
          maxLength={100}
          required
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="paymentHint"
          className="text-xs font-medium text-gray-700"
        >
          Реквизиты <span className="text-gray-400">(опционально)</span>
        </label>
        <input
          id="paymentHint"
          type="text"
          value={paymentHint}
          onChange={(e) => setPaymentHint(e.target.value)}
          placeholder="Тинькофф +7 999 555 12 34, или «мой»"
          maxLength={200}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="total" className="text-xs font-medium text-gray-700">
          Общая сумма (₽)
        </label>
        <input
          id="total"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          value={totalStr}
          onChange={(e) => setTotalStr(e.target.value)}
          placeholder="4500"
          required
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Participant picker */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-gray-700">Участники</div>

        {members.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white p-2">
            <div className="mb-1 text-xs text-gray-500">Из кампании:</div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const checked = participants.some((p) => p.userId === m.userId)
                return (
                  <button
                    key={m.userId}
                    type="button"
                    onClick={() => toggleMember(m)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                      checked
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {checked && '✓ '}
                    {m.displayName}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-gray-200 bg-white p-2">
          <div className="mb-1 text-xs text-gray-500">
            Свободно (если человек не в кампании):
          </div>
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
              placeholder="Имя"
              maxLength={100}
              className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
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
      </div>

      {/* Shares table */}
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
              className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              Разделить поровну
            </button>
          </div>

          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {participants.map((p) => (
              <li
                key={p.key}
                className="flex items-center gap-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                  {p.displayName}
                  {p.userId === null && (
                    <span className="ml-1 text-xs text-gray-400">(внешний)</span>
                  )}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  value={p.share === 0 ? '' : p.share}
                  onChange={(e) => updateShare(p.key, e.target.value)}
                  placeholder="0.00"
                  className="w-24 rounded-md border border-gray-200 px-2 py-1 text-right font-mono text-sm focus:border-blue-500 focus:outline-none"
                />
                <span className="text-xs text-gray-500">₽</span>
                <button
                  type="button"
                  onClick={() => removeParticipant(p.key)}
                  aria-label="Убрать"
                  className="text-sm text-gray-400 hover:text-red-500 transition-colors"
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
        </div>
      )}

      {submitError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Отмена
          </button>
        )}
        <button
          type="submit"
          disabled={!isValid || isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Создаём…' : 'Создать'}
        </button>
      </div>
    </form>
  )
}
