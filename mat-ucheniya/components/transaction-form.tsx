'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import AmountInput, { type AmountInputValue } from './amount-input'
import CategoryDropdown from './category-dropdown'
import TransferRecipientPicker from './transfer-recipient-picker'
import {
  createTransaction,
  createTransfer,
  deleteTransfer,
  updateTransaction,
  updateTransfer,
  type CreateTransactionInput,
} from '@/app/actions/transactions'
import type {
  Category,
  CoinSet,
  TransactionWithRelations,
  TransferInput,
} from '@/lib/transactions'
import { aggregateGp } from '@/lib/transaction-resolver'
import { validateTransfer } from '@/lib/transaction-validation'

type Props = {
  campaignId: string
  actorPcId: string
  defaultLoopNumber: number
  defaultDayInLoop: number
  defaultSessionId: string | null
  categories?: Category[]
  editing?: TransactionWithRelations | null
  onSuccess?: () => void
  onCancel?: () => void
}

type Kind = 'money' | 'item' | 'transfer'

function seedAmountFromEditing(tx: TransactionWithRelations): AmountInputValue {
  const agg = aggregateGp(tx.coins)
  const nonZeroCount = (['cp', 'sp', 'gp', 'pp'] as (keyof CoinSet)[]).reduce(
    (n, d) => n + (tx.coins[d] !== 0 ? 1 : 0),
    0,
  )
  const sign: 1 | -1 = agg < 0 ? -1 : 1
  if (nonZeroCount > 1) {
    const absCoins: CoinSet = {
      cp: Math.abs(tx.coins.cp),
      sp: Math.abs(tx.coins.sp),
      gp: Math.abs(tx.coins.gp),
      pp: Math.abs(tx.coins.pp),
    }
    return { mode: 'denom', coins: absCoins, sign }
  }
  return { mode: 'gp', amount: Math.abs(agg), sign }
}

/**
 * Transaction form — mobile-first. All three kinds supported:
 *   • money  — sign toggle + gp or per-denom amount
 *   • item   — free-text item name, no coins
 *   • transfer — recipient picker + fixed-outflow amount
 *
 * Edit mode auto-detects kind from `editing`. Transfer edits act on
 * both legs via `updateTransfer`. Editing a transfer row is locked
 * to the transfer tab — swapping a transfer into a non-transfer
 * would corrupt the pair.
 */
export default function TransactionForm({
  campaignId,
  actorPcId,
  defaultLoopNumber,
  defaultDayInLoop,
  defaultSessionId,
  categories,
  editing,
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter()
  const editingId = editing?.id ?? null
  const editingTransferGroupId = editing?.transfer_group_id ?? null
  const editingKindLocked = editing?.kind === 'transfer'

  const initialKind: Kind = editing?.kind ?? 'money'
  const [kind, setKind] = useState<Kind>(initialKind)

  const [amount, setAmount] = useState<AmountInputValue>(() => {
    if (!editing || editing.kind === 'item') {
      return { mode: 'gp', amount: 0, sign: 1 }
    }
    const seeded = seedAmountFromEditing(editing)
    // Transfers are always an outflow from the sender — force sign to -1
    // when seeding the sender's leg, even if someone opens the recipient
    // leg (the form never targets the recipient side directly).
    if (editing.kind === 'transfer') {
      return { ...seeded, sign: -1 }
    }
    return seeded
  })
  const [itemName, setItemName] = useState<string>(editing?.item_name ?? '')
  const [recipientPcId, setRecipientPcId] = useState<string | null>(null)
  const [categorySlug, setCategorySlug] = useState<string>(
    editing?.category_slug ?? '',
  )
  const [comment, setComment] = useState<string>(editing?.comment ?? '')
  const [loopNumber, setLoopNumber] = useState<number>(
    editing?.loop_number ?? defaultLoopNumber,
  )
  const [dayInLoop, setDayInLoop] = useState<number>(
    editing?.day_in_loop ?? defaultDayInLoop,
  )
  const sessionId: string | null = editing?.session_id ?? defaultSessionId

  const [captionExpanded, setCaptionExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleKindChange = useCallback(
    (next: Kind) => {
      setKind(next)
      setError(null)
      if (next === 'transfer') {
        setAmount((prev) =>
          prev.mode === 'gp'
            ? { mode: 'gp', amount: prev.amount, sign: -1 }
            : { mode: 'denom', coins: prev.coins, sign: -1 },
        )
      }
      // Preselect a matching-slug category when available — keeps the
      // form at the spec's 3-field target for fresh entries.
      if (!editingId && categories) {
        const match = categories.find((c) => c.slug === next)
        if (match) setCategorySlug(match.slug)
      }
    },
    [categories, editingId],
  )

  const buildMoneyCoinsPayload = useCallback(() => {
    const signedGp =
      amount.mode === 'gp' ? amount.amount * amount.sign : undefined
    const perDenomOverride: CoinSet | undefined =
      amount.mode === 'denom'
        ? {
            cp: amount.coins.cp * amount.sign,
            sp: amount.coins.sp * amount.sign,
            gp: amount.coins.gp * amount.sign,
            pp: amount.coins.pp * amount.sign,
          }
        : undefined
    return { signedGp, perDenomOverride }
  }, [amount])

  const submit = useCallback(async () => {
    setError(null)

    if (!categorySlug) {
      setError('Выберите категорию')
      return
    }

    setSubmitting(true)
    try {
      if (kind === 'money') {
        const { signedGp, perDenomOverride } = buildMoneyCoinsPayload()
        const payload: CreateTransactionInput = {
          campaignId,
          actorPcId,
          kind: 'money',
          amountGp: signedGp,
          perDenomOverride,
          categorySlug,
          comment,
          loopNumber,
          dayInLoop,
          sessionId,
        }
        const res = editingId
          ? await updateTransaction(editingId, {
              kind: 'money',
              amountGp: signedGp,
              perDenomOverride,
              categorySlug,
              comment,
              loopNumber,
              dayInLoop,
              sessionId,
            })
          : await createTransaction(payload)
        if (!res.ok) {
          setError(res.error)
          return
        }
      } else if (kind === 'item') {
        if (!itemName.trim()) {
          setError('Укажите название предмета')
          return
        }
        const res = editingId
          ? await updateTransaction(editingId, {
              kind: 'item',
              itemName: itemName.trim(),
              categorySlug,
              comment,
              loopNumber,
              dayInLoop,
              sessionId,
            })
          : await createTransaction({
              campaignId,
              actorPcId,
              kind: 'item',
              itemName: itemName.trim(),
              categorySlug,
              comment,
              loopNumber,
              dayInLoop,
              sessionId,
            })
        if (!res.ok) {
          setError(res.error)
          return
        }
      } else {
        // transfer
        if (!editingTransferGroupId && !recipientPcId) {
          setError('Выберите получателя')
          return
        }
        if (recipientPcId) {
          const preErr = validateTransfer(
            actorPcId,
            recipientPcId,
            loopNumber,
            loopNumber,
          )
          if (preErr) {
            setError(preErr)
            return
          }
        }

        const absAmount =
          amount.mode === 'gp' ? Math.abs(amount.amount) : undefined
        const perDenomOverride: CoinSet | undefined =
          amount.mode === 'denom'
            ? {
                cp: Math.abs(amount.coins.cp),
                sp: Math.abs(amount.coins.sp),
                gp: Math.abs(amount.coins.gp),
                pp: Math.abs(amount.coins.pp),
              }
            : undefined

        if (editingTransferGroupId) {
          const patch: Partial<TransferInput> = {
            categorySlug,
            comment,
            loopNumber,
            dayInLoop,
            sessionId,
          }
          if (absAmount !== undefined && absAmount > 0) patch.amountGp = absAmount
          if (perDenomOverride) patch.perDenomOverride = perDenomOverride
          const res = await updateTransfer(editingTransferGroupId, patch)
          if (!res.ok) {
            setError(res.error)
            return
          }
        } else {
          if ((absAmount === undefined || absAmount === 0) && !perDenomOverride) {
            setError('Сумма перевода должна быть больше нуля')
            return
          }
          const res = await createTransfer({
            campaignId,
            senderPcId: actorPcId,
            recipientPcId: recipientPcId!,
            amountGp: absAmount ?? 0,
            perDenomOverride,
            categorySlug,
            comment,
            loopNumber,
            dayInLoop,
            sessionId,
          })
          if (!res.ok) {
            setError(res.error)
            return
          }
        }
      }

      router.refresh()
      onSuccess?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setSubmitting(false)
    }
  }, [
    actorPcId,
    amount,
    buildMoneyCoinsPayload,
    campaignId,
    categorySlug,
    comment,
    dayInLoop,
    editingId,
    editingTransferGroupId,
    itemName,
    kind,
    loopNumber,
    onSuccess,
    recipientPcId,
    router,
    sessionId,
  ])

  const handleTransferDelete = useCallback(async () => {
    if (!editingTransferGroupId) return
    if (!confirm('Удалить перевод? Обе стороны будут удалены.')) return
    setDeleting(true)
    try {
      const res = await deleteTransfer(editingTransferGroupId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
      onSuccess?.()
    } finally {
      setDeleting(false)
    }
  }, [editingTransferGroupId, onSuccess, router])

  const busy = submitting || deleting

  return (
    <div className="flex flex-col gap-3">
      {/* Kind switcher */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(['money', 'item', 'transfer'] as const).map((k) => {
          const labels = { money: 'Монеты', item: 'Предмет', transfer: 'Перевод' }
          const isActive = kind === k
          const locked = editingKindLocked && k !== 'transfer'
          return (
            <button
              key={k}
              type="button"
              onClick={() => !locked && handleKindChange(k)}
              disabled={locked || busy}
              className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white text-gray-900 shadow-sm'
                  : locked
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-pressed={isActive}
            >
              {labels[k]}
            </button>
          )
        })}
      </div>

      {/* Slot 1: amount or item name */}
      {kind === 'item' ? (
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Название предмета
          </label>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Например: кольцо невидимости"
            disabled={busy}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </div>
      ) : (
        <AmountInput
          value={amount}
          onChange={setAmount}
          // Transfer is always an outflow from the sender — lock the sign
          // so users can't accidentally create a reverse transfer.
          signLocked={kind === 'transfer'}
        />
      )}

      {/* Slot 1a (transfer + create only): recipient picker */}
      {kind === 'transfer' && !editingTransferGroupId && (
        <TransferRecipientPicker
          campaignId={campaignId}
          excludeId={actorPcId}
          value={recipientPcId}
          onChange={setRecipientPcId}
          disabled={busy}
        />
      )}

      {/* Slot 2: category */}
      <CategoryDropdown
        campaignId={campaignId}
        scope="transaction"
        value={categorySlug || null}
        onChange={setCategorySlug}
        prefetched={categories}
        disabled={busy}
      />

      {/* Slot 3: comment */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Комментарий
        </label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Необязательно"
          disabled={busy}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Auto-filled temporal caption (expandable) */}
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setCaptionExpanded((v) => !v)}
          className="self-start text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Петля {loopNumber} · день {dayInLoop}
          {sessionId ? ' · привязано к сессии' : ' · без сессии'}
          <span className="ml-1 text-gray-400">
            {captionExpanded ? '▾' : '▸'}
          </span>
        </button>
        {captionExpanded && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500">Петля</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={loopNumber}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n) && n > 0) setLoopNumber(Math.trunc(n))
                  }}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-500">День в петле</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={dayInLoop}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n) && n > 0) setDayInLoop(Math.trunc(n))
                  }}
                  className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Сессия подставляется автоматически по фронтиру; переназначение
              будет в отдельной итерации.
            </p>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Сохраняю…' : editingId ? 'Сохранить' : 'Создать'}
        </button>
        {editingTransferGroupId && (
          <button
            type="button"
            onClick={handleTransferDelete}
            disabled={busy}
            className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
          >
            {deleting ? 'Удаляю…' : 'Удалить обе стороны'}
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="ml-auto rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            Отмена
          </button>
        )}
      </div>
    </div>
  )
}
