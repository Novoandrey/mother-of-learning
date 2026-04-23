'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import AmountInput, { type AmountInputValue } from './amount-input'
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
  /** Retained for shape compat — unused while category UI is hidden (IDEA-050). */
  categories?: Category[]
  editing?: TransactionWithRelations | null
  /** Pre-select a tab in create mode. Ignored when `editing` is set. */
  initialKind?: FormKind
  onSuccess?: () => void
  onCancel?: () => void
}

/**
 * Form-level kind. `income` and `expense` collapse onto the DB's
 * `kind='money'` with + / − sign; `transfer` stays its own kind.
 *
 * `item` was removed from the UI (chat 37) — it comes back with
 * spec-015 (items-as-nodes). Legacy item rows still render in the
 * ledger and stay editable through the server action, just not via
 * this form.
 */
type FormKind = 'income' | 'expense' | 'transfer'

const TAB_LABELS: Record<FormKind, string> = {
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
}

/**
 * Auto-assigned category slug per form kind. Mirrors the seed in
 * migration 034 — every new campaign has these 3 slugs. `seedCampaign-
 * Categories` guarantees it going forward. If a DM soft-deleted one
 * of them via /settings/categories, the row still writes cleanly —
 * `category_slug` has no FK on `categories.slug` by design.
 */
const AUTO_CATEGORY: Record<FormKind, string> = {
  income: 'income',
  expense: 'expense',
  transfer: 'transfer',
}

function seedFromEditing(tx: TransactionWithRelations): {
  kind: FormKind
  amount: AmountInputValue
} {
  if (tx.kind === 'transfer') {
    const abs: CoinSet = {
      cp: Math.abs(tx.coins.cp),
      sp: Math.abs(tx.coins.sp),
      gp: Math.abs(tx.coins.gp),
      pp: Math.abs(tx.coins.pp),
    }
    const nonZero = (['cp', 'sp', 'gp', 'pp'] as const).reduce(
      (n, d) => n + (abs[d] !== 0 ? 1 : 0),
      0,
    )
    if (nonZero > 1) return { kind: 'transfer', amount: { mode: 'denom', coins: abs } }
    return {
      kind: 'transfer',
      amount: { mode: 'gp', amount: Math.abs(aggregateGp(tx.coins)) },
    }
  }
  if (tx.kind === 'item') {
    // Legacy item row — we no longer edit these through this form
    // (item mode was removed chat 37). Fall through to `expense`
    // as a safe default so users aren't stuck; they can delete and
    // re-create if they want to change the kind.
    return { kind: 'expense', amount: { mode: 'gp', amount: 0 } }
  }
  // money
  const agg = aggregateGp(tx.coins)
  const kind: FormKind = agg < 0 ? 'expense' : 'income'
  const abs: CoinSet = {
    cp: Math.abs(tx.coins.cp),
    sp: Math.abs(tx.coins.sp),
    gp: Math.abs(tx.coins.gp),
    pp: Math.abs(tx.coins.pp),
  }
  const nonZero = (['cp', 'sp', 'gp', 'pp'] as const).reduce(
    (n, d) => n + (abs[d] !== 0 ? 1 : 0),
    0,
  )
  if (nonZero > 1) return { kind, amount: { mode: 'denom', coins: abs } }
  return { kind, amount: { mode: 'gp', amount: Math.abs(agg) } }
}

/**
 * Transaction form — mobile-first. Three tabs:
 *   Доход (green) / Расход (red) / Перевод (blue)
 *
 * Sign is carried by the tab choice; `AmountInput` is magnitude-
 * only. Category picker is hidden (IDEA-050) — slug is auto-
 * assigned from kind; users who need category filters use the
 * /settings/categories editor and the ledger filter bar.
 */
export default function TransactionForm({
  campaignId,
  actorPcId,
  defaultLoopNumber,
  defaultDayInLoop,
  defaultSessionId,
  editing,
  initialKind,
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter()
  const editingId = editing?.id ?? null
  const editingTransferGroupId = editing?.transfer_group_id ?? null
  const editingKindLocked = editing?.kind === 'transfer'

  const seed = editing ? seedFromEditing(editing) : null

  const [kind, setKind] = useState<FormKind>(
    seed?.kind ?? initialKind ?? 'expense',
  )
  const [amount, setAmount] = useState<AmountInputValue>(
    seed?.amount ?? { mode: 'gp', amount: 0 },
  )
  const [recipientPcId, setRecipientPcId] = useState<string | null>(null)
  const [comment, setComment] = useState<string>(editing?.comment ?? '')
  // Loop is context — never editable in this form. If the DM needs to
  // record something in a past/future loop, that flow belongs in a
  // dedicated bulk-edit tool (IDEA-043), not the per-tx sheet.
  const loopNumber: number = editing?.loop_number ?? defaultLoopNumber
  // Day is stored as the raw input string so the user can clear the
  // field and type a new number — a plain `useState<number>` rejects
  // the intermediate empty state and freezes the cursor. We normalise
  // to a valid number on blur and again at submit: empty/<1 → 1, >30
  // → 30 (30 matches the current loop-length default; revisit once
  // loops carry variable length_days all the way down to the form).
  const initialDay: number = editing?.day_in_loop ?? defaultDayInLoop
  const [dayInLoopText, setDayInLoopText] = useState<string>(
    String(initialDay),
  )
  const normalizeDay = useCallback((raw: string): number => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1) return 1
    if (n > 30) return 30
    return Math.trunc(n)
  }, [])
  const dayInLoop = normalizeDay(dayInLoopText)
  const sessionId: string | null = editing?.session_id ?? defaultSessionId

  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleKindChange = useCallback((next: FormKind) => {
    setKind(next)
    setError(null)
  }, [])

  const applyMoneySign = useCallback(
    (magnitude: AmountInputValue, sign: 1 | -1) => {
      if (magnitude.mode === 'gp') {
        return {
          signedGp: magnitude.amount * sign,
          perDenomOverride: undefined as CoinSet | undefined,
        }
      }
      return {
        signedGp: undefined,
        perDenomOverride: {
          cp: magnitude.coins.cp * sign,
          sp: magnitude.coins.sp * sign,
          gp: magnitude.coins.gp * sign,
          pp: magnitude.coins.pp * sign,
        } as CoinSet,
      }
    },
    [],
  )

  const submit = useCallback(async () => {
    setError(null)
    const categorySlug = AUTO_CATEGORY[kind]

    setSubmitting(true)
    try {
      if (kind === 'income' || kind === 'expense') {
        const sign: 1 | -1 = kind === 'income' ? 1 : -1
        const { signedGp, perDenomOverride } = applyMoneySign(amount, sign)

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

        const absAmount = amount.mode === 'gp' ? amount.amount : undefined
        const perDenomOverride: CoinSet | undefined =
          amount.mode === 'denom' ? amount.coins : undefined

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
    applyMoneySign,
    campaignId,
    comment,
    dayInLoop,
    editingId,
    editingTransferGroupId,
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
      {/* Kind switcher — coloured active states mirror the coloured
          entry-point buttons on /accounting. */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
        {(['income', 'expense', 'transfer'] as const).map((k) => {
          const isActive = kind === k
          const locked = editingKindLocked && k !== 'transfer'
          const activeClass = (() => {
            if (!isActive) return ''
            if (k === 'income') return 'bg-emerald-600 text-white shadow-sm'
            if (k === 'expense') return 'bg-red-600 text-white shadow-sm'
            return 'bg-blue-600 text-white shadow-sm'
          })()
          return (
            <button
              key={k}
              type="button"
              onClick={() => !locked && handleKindChange(k)}
              disabled={locked || busy}
              className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? activeClass
                  : locked
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              aria-pressed={isActive}
            >
              {TAB_LABELS[k]}
            </button>
          )
        })}
      </div>

      {/* Slot 1: amount (magnitude only) */}
      <AmountInput value={amount} onChange={setAmount} />

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

      {/* Slot 2: comment (free-form; category is auto-assigned per kind). */}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Комментарий
        </label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Откуда / за что / детали"
          disabled={busy}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Temporal context. Loop is read-only (it's campaign state,
          changed via the loops page); day is an inline number input so
          the user can nudge it without expanding anything. Session is
          auto-attached from the frontier — explicit override ships
          with IDEA-045/TECH-009. */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Петля {loopNumber}</span>
        <span aria-hidden="true">·</span>
        <label className="flex items-center gap-1">
          <span>День</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="30"
            value={dayInLoopText}
            onChange={(e) => setDayInLoopText(e.target.value)}
            onBlur={() => setDayInLoopText(String(normalizeDay(dayInLoopText)))}
            disabled={busy}
            className="w-16 rounded border border-gray-200 px-2 py-0.5 text-right text-xs focus:border-blue-500 focus:outline-none disabled:opacity-50"
          />
        </label>
        <span aria-hidden="true">·</span>
        <span className="text-gray-400">
          {sessionId ? 'сессия подставлена' : 'без сессии'}
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

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
