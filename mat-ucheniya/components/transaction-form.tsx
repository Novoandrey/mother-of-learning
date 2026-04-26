'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AmountInput, { type AmountInputValue } from './amount-input'
import TransferRecipientPicker from './transfer-recipient-picker'
import ShortfallPrompt from './shortfall-prompt'
import ItemTypeahead from './item-typeahead'
import {
  createTransaction,
  createTransfer,
  deleteTransfer,
  updateTransaction,
  updateTransfer,
  type CreateTransactionInput,
} from '@/app/actions/transactions'
import {
  putMoneyIntoStash,
  takeMoneyFromStash,
  putItemIntoStash,
  takeItemFromStash,
  getStashAggregate,
  createExpenseWithStashShortfall,
} from '@/app/actions/stash'
import type {
  Category,
  CoinSet,
  TransactionWithRelations,
  TransferInput,
} from '@/lib/transactions'
import { aggregateGp } from '@/lib/transaction-resolver'
import { validateTransfer, validateItemQty } from '@/lib/transaction-validation'

export type StashPinnedDirection = 'put-into-stash' | 'take-from-stash'

type Props = {
  campaignId: string
  /** Spec-015 — campaign slug for the typeahead's «+ Создать» link. */
  campaignSlug: string
  /** Spec-015 — DM/owner gets the «+ Создать» affordance in the typeahead. */
  canEditCatalog: boolean
  actorPcId: string
  defaultLoopNumber: number
  defaultDayInLoop: number
  defaultSessionId: string | null
  /** Retained for shape compat — unused while category UI is hidden (IDEA-050). */
  categories?: Category[]
  editing?: TransactionWithRelations | null
  /** Pre-select a tab in create mode. Ignored when `editing` is set. */
  initialKind?: FormKind
  /**
   * When set, lock the form to a stash-pinned flow (spec-011 T025):
   *   - Hide transfer tab + recipient picker.
   *   - Show a direction chip (→ Общак / ← Общак).
   *   - Save dispatches to putMoney/takeMoney/putItem/takeItem actions.
   */
  initialTransferDirection?: StashPinnedDirection | null
  /**
   * Current wallet aggregate in gp. Used by the shortfall prompt
   * (T026) to decide whether the typed expense overdraws. Optional —
   * callers that don't pass it simply disable the prompt (the user
   * can still save; the row goes negative per spec-010 baseline).
   */
  currentWalletGp?: number
  onSuccess?: () => void
  onCancel?: () => void
}

/**
 * Form-level kind. `income` and `expense` collapse onto the DB's
 * `kind='money'` with + / − sign; `transfer` is its own kind; `item`
 * lands via spec-011 and is only selectable when the form is in
 * stash-pinned mode (put/take against the общак).
 */
type FormKind = 'income' | 'expense' | 'transfer' | 'item'

const TAB_LABELS: Record<FormKind, string> = {
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
  item: 'Предмет',
}

const AUTO_CATEGORY: Record<FormKind, string> = {
  income: 'income',
  expense: 'expense',
  transfer: 'transfer',
  item: 'loot',
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
    // (item mode was removed chat 37, re-added for stash-pinned in
    // spec-011). Fall through to `expense` as a safe default.
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
 * Magnitude aggregate in gp from the `AmountInput` value shape. Used
 * client-side to compute shortfall inline without hitting the server.
 */
function amountMagnitudeGp(v: AmountInputValue): number {
  if (v.mode === 'gp') return Math.max(0, v.amount)
  return Math.abs(aggregateGp(v.coins))
}

/**
 * Transaction form — mobile-first. Two personalities:
 *
 *   1. Normal mode — three tabs: Доход / Расход / Перевод. Standard
 *      spec-010 flow. Expense kind wires in the spec-011 shortfall
 *      prompt when the amount would overdraw the wallet.
 *   2. Stash-pinned mode (`initialTransferDirection` set) — tabs
 *      replaced with Деньги / Предмет. The recipient is always the
 *      stash; a chip shows the direction. Save dispatches to the
 *      `app/actions/stash.ts` wrappers.
 */
export default function TransactionForm({
  campaignId,
  campaignSlug,
  canEditCatalog,
  actorPcId,
  defaultLoopNumber,
  defaultDayInLoop,
  defaultSessionId,
  editing,
  initialKind,
  initialTransferDirection,
  currentWalletGp,
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter()
  const editingId = editing?.id ?? null
  const editingTransferGroupId = editing?.transfer_group_id ?? null
  const editingKindLocked = editing?.kind === 'transfer'

  const stashPinned = !!initialTransferDirection && !editing
  // In stash-pinned mode the "Деньги" tab maps to income for take-from
  // and expense for put-into — the sign is fixed by the direction, the
  // user only enters a magnitude.
  const stashMoneyKind: 'income' | 'expense' =
    initialTransferDirection === 'take-from-stash' ? 'income' : 'expense'

  const seed = editing ? seedFromEditing(editing) : null

  const [kind, setKind] = useState<FormKind>(
    seed?.kind ?? (stashPinned ? stashMoneyKind : initialKind ?? 'expense'),
  )
  const [amount, setAmount] = useState<AmountInputValue>(
    seed?.amount ?? { mode: 'gp', amount: 0 },
  )
  const [recipientPcId, setRecipientPcId] = useState<string | null>(null)
  const [comment, setComment] = useState<string>(editing?.comment ?? '')
  // Item-specific state (spec-011 + spec-015 catalog link).
  const [itemName, setItemName] = useState<string>(editing?.item_name ?? '')
  const [itemNodeId, setItemNodeId] = useState<string | null>(
    editing?.item_node_id ?? null,
  )
  const [itemQty, setItemQty] = useState<number>(1)

  const loopNumber: number = editing?.loop_number ?? defaultLoopNumber
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

  // ------ Shortfall prompt state (T026) ------
  const expenseMagGp = useMemo(() => {
    if (kind !== 'expense') return 0
    if (stashPinned) return 0 // dispatches to stash wrapper, not the overdraw path
    return amountMagnitudeGp(amount)
  }, [amount, kind, stashPinned])

  const walletGp = currentWalletGp ?? null
  const shortfallGp = useMemo(() => {
    if (walletGp === null) return 0
    if (expenseMagGp <= 0) return 0
    return Math.max(0, expenseMagGp - walletGp)
  }, [expenseMagGp, walletGp])

  const [stashGp, setStashGp] = useState<number | null>(null)
  const [stashFetched, setStashFetched] = useState(false)
  // `'unresolved'` = prompt was dismissed or never offered;
  // `'accept'` = user opted for stash cover on submit;
  // `'decline'` = user opted to go negative.
  const [shortfallChoice, setShortfallChoice] = useState<
    'unresolved' | 'accept' | 'decline'
  >('unresolved')

  // Lazily fetch stash aggregate once shortfall > 0. Memoized by
  // (campaignId, loopNumber) — cleared when either changes.
  useEffect(() => {
    if (shortfallGp <= 0) return
    if (stashFetched) return
    let cancelled = false
    ;(async () => {
      const res = await getStashAggregate(campaignId, loopNumber)
      if (cancelled) return
      if (res.ok) setStashGp(res.aggregateGp)
      setStashFetched(true)
    })()
    return () => {
      cancelled = true
    }
  }, [shortfallGp, stashFetched, campaignId, loopNumber])

  // Reset memoization when the actor or loop changes.
  useEffect(() => {
    setStashGp(null)
    setStashFetched(false)
    setShortfallChoice('unresolved')
  }, [actorPcId, loopNumber])

  // When the user lowers the amount back below wallet, clear any
  // previous choice so the prompt won't stealthily apply on save.
  useEffect(() => {
    if (shortfallGp <= 0 && shortfallChoice !== 'unresolved') {
      setShortfallChoice('unresolved')
    }
  }, [shortfallGp, shortfallChoice])

  const showShortfallPrompt =
    !stashPinned &&
    kind === 'expense' &&
    !editing &&
    shortfallGp > 0 &&
    stashFetched &&
    shortfallChoice === 'unresolved'

  // ------ Handlers ------

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
      // --- Stash-pinned branch (spec-011) ---
      if (stashPinned) {
        const direction = initialTransferDirection!

        if (kind === 'item') {
          const qtyErr = validateItemQty(itemQty)
          if (qtyErr) {
            setError(qtyErr)
            return
          }
          if (!itemName.trim()) {
            setError('Укажите название предмета')
            return
          }
          const fn = direction === 'put-into-stash' ? putItemIntoStash : takeItemFromStash
          const res = await fn({
            campaignId,
            actorPcId,
            itemName: itemName.trim(),
            itemNodeId: itemNodeId ?? undefined,
            qty: itemQty,
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
          const absAmount =
            amount.mode === 'gp' ? amount.amount : amountMagnitudeGp(amount)
          if (!absAmount || absAmount <= 0) {
            setError('Сумма должна быть больше нуля')
            return
          }
          const fn = direction === 'put-into-stash' ? putMoneyIntoStash : takeMoneyFromStash
          const res = await fn({
            campaignId,
            actorPcId,
            amountGp: absAmount,
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
        router.refresh()
        onSuccess?.()
        return
      }

      // --- Normal mode ---
      if (kind === 'income' || kind === 'expense') {
        // Shortfall shortcut (T026): expense + user accepted stash cover.
        if (
          kind === 'expense' &&
          shortfallChoice === 'accept' &&
          amount.mode === 'gp' &&
          amount.amount > 0
        ) {
          const res = await createExpenseWithStashShortfall({
            campaignId,
            actorPcId,
            amountGp: amount.amount,
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
          router.refresh()
          onSuccess?.()
          return
        }

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
      } else if (kind === 'item') {
        // Item kind in normal mode isn't wired — spec-011 restricts
        // item entry to stash-pinned mode. If we ever surface an
        // item-only tab outside stash flows, route it here.
        setError('Предметы пока создаются только через «Положить/Взять из Общака»')
        return
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
    initialTransferDirection,
    itemName,
    itemNodeId,
    itemQty,
    kind,
    loopNumber,
    onSuccess,
    recipientPcId,
    router,
    sessionId,
    shortfallChoice,
    stashPinned,
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
      {/* Stash direction chip (stash-pinned mode only). */}
      {stashPinned && (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white">
            {initialTransferDirection === 'put-into-stash' ? '→ Общак' : '← Общак'}
          </span>
          <span className="text-xs text-gray-500">
            {initialTransferDirection === 'put-into-stash'
              ? 'Вы кладёте в общак'
              : 'Вы берёте из общака'}
          </span>
        </div>
      )}

      {/* Kind switcher. Two-tab in stash-pinned (money + item), three-
          tab in normal mode. Transfer tab disabled in stash-pinned —
          stash transfers aren't PC↔PC. */}
      {stashPinned ? (
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {([stashMoneyKind, 'item'] as const).map((k) => {
            const isActive = kind === k
            const activeClass = (() => {
              if (!isActive) return ''
              if (k === 'income') return 'bg-emerald-600 text-white shadow-sm'
              if (k === 'expense') return 'bg-red-600 text-white shadow-sm'
              return 'bg-blue-600 text-white shadow-sm'
            })()
            const label = k === 'item' ? 'Предмет' : 'Деньги'
            return (
              <button
                key={k}
                type="button"
                onClick={() => handleKindChange(k)}
                disabled={busy}
                className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? activeClass : 'text-gray-500 hover:text-gray-700'
                }`}
                aria-pressed={isActive}
              >
                {label}
              </button>
            )
          })}
        </div>
      ) : (
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
      )}

      {/* Item inputs (kind='item' only) */}
      {kind === 'item' ? (
        <>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Предмет
            </label>
            <ItemTypeahead
              campaignId={campaignId}
              campaignSlug={campaignSlug}
              value={{ itemNodeId, itemName }}
              onChange={(next) => {
                setItemNodeId(next.itemNodeId)
                setItemName(next.itemName)
              }}
              canCreateNew={canEditCatalog}
              showFreeTextHint={!canEditCatalog}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Количество
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              value={itemQty}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 1) setItemQty(Math.trunc(n))
                else if (e.target.value === '') setItemQty(1)
              }}
              disabled={busy}
              className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
          </div>
        </>
      ) : (
        /* Money/transfer amount input */
        <AmountInput value={amount} onChange={setAmount} />
      )}

      {/* Recipient picker — transfer in normal mode only. */}
      {kind === 'transfer' && !editingTransferGroupId && !stashPinned && (
        <TransferRecipientPicker
          campaignId={campaignId}
          excludeId={actorPcId}
          value={recipientPcId}
          onChange={setRecipientPcId}
          disabled={busy}
        />
      )}

      {/* Shortfall prompt (T026) — normal mode expense only. */}
      {showShortfallPrompt && stashGp !== null && (
        <ShortfallPrompt
          shortfallGp={shortfallGp}
          stashGp={stashGp}
          onAcceptBorrow={() => setShortfallChoice('accept')}
          onDeclineBorrow={() => setShortfallChoice('decline')}
        />
      )}
      {/* Reminder chip once the user made a choice but hasn't submitted. */}
      {!showShortfallPrompt && shortfallGp > 0 && shortfallChoice !== 'unresolved' && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          {shortfallChoice === 'accept'
            ? 'При сохранении недостающее возьмём из общака.'
            : 'Сохранение оставит кошелёк в минусе.'}{' '}
          <button
            type="button"
            onClick={() => setShortfallChoice('unresolved')}
            className="underline hover:no-underline"
          >
            изменить
          </button>
        </div>
      )}

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
          disabled={busy || showShortfallPrompt}
          title={
            showShortfallPrompt
              ? 'Сначала ответьте на вопрос о нехватке средств'
              : undefined
          }
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
