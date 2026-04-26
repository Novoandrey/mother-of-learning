'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import AmountInput, { type AmountInputValue } from './amount-input'
import ItemTypeahead from './item-typeahead'
import { submitBatch, type BatchRowSubmitInput } from '@/app/actions/transactions'
import type { CampaignPC } from '@/app/actions/characters'
import { aggregateGp } from '@/lib/transaction-resolver'

/**
 * Spec-014 T020/T021 — multi-row submission form for player batches.
 *
 * Lightweight focused form distinct from the 770-line single-row
 * `<TransactionForm>` (kept untouched to avoid breaking stash-pinned
 * mode, edit mode, shortfall prompt, transfer recipient picker, etc.).
 *
 * Supported row kinds: income / expense / transfer / item (loot).
 * Item-transfer (player→player) is rare; player can still do that
 * one at a time via the existing form on a PC page.
 *
 * State shape: array of `RowState`. "+ Добавить ряд" appends; "×"
 * removes (only when ≥ 2 rows). Submit calls `submitBatch` with one
 * `batchId` covering every row. Server returns `{batchId, rowResults}`
 * on success; we close + revalidate the page.
 */

export type BatchRowKind = 'income' | 'expense' | 'transfer' | 'item'

type RowState = {
  clientId: string
  kind: BatchRowKind
  actorPcId: string
  /** Money + transfer rows. */
  amount: AmountInputValue
  /** Item rows. */
  itemName: string
  /** Spec-015 — optional Образец link for item / transfer-item rows. */
  itemNodeId: string | null
  itemQty: number
  /** Transfer rows. */
  recipientPcId: string | null
  comment: string
  dayInLoop: number
}

type Props = {
  campaignId: string
  /** Spec-015 — passed through to ItemTypeahead. */
  campaignSlug: string
  canEditCatalog: boolean
  availablePcs: CampaignPC[]
  defaultLoopNumber: number
  defaultDayByPcId: Record<string, number>
  defaultSessionId?: string | null
  /** Optional: pre-seed the first row's actor (e.g. from selected actor in bar). */
  initialActorPcId?: string | null
  /** Fires after a successful submit. */
  onSuccess?: (batchId: string) => void
  /** Fires on cancel — caller closes its sheet. */
  onCancel?: () => void
}

const KIND_LABELS: Record<BatchRowKind, string> = {
  income: 'Доход',
  expense: 'Расход',
  transfer: 'Перевод',
  item: 'Предмет',
}

const KIND_TO_CATEGORY: Record<BatchRowKind, string> = {
  income: 'income',
  expense: 'expense',
  transfer: 'transfer',
  item: 'loot',
}

function makeBlankRow(
  defaultActorPcId: string | null,
  defaultDay: number,
): RowState {
  return {
    clientId:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `r-${Math.random().toString(36).slice(2)}`,
    kind: 'income',
    actorPcId: defaultActorPcId ?? '',
    amount: { mode: 'gp', amount: 0 },
    itemName: '',
    itemNodeId: null,
    itemQty: 1,
    recipientPcId: null,
    comment: '',
    dayInLoop: defaultDay,
  }
}

/** Magnitude in gp for non-item rows; sign applied at submit time. */
function rowAmountMagnitudeGp(row: RowState): number {
  if (row.amount.mode === 'gp') return Math.max(0, row.amount.amount)
  return Math.abs(aggregateGp(row.amount.coins))
}

export default function BatchTransactionForm({
  campaignId,
  campaignSlug,
  canEditCatalog,
  availablePcs,
  defaultLoopNumber,
  defaultDayByPcId,
  defaultSessionId,
  initialActorPcId,
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter()
  const firstActor =
    initialActorPcId ?? availablePcs[0]?.id ?? null
  const firstActorDay: number =
    (firstActor !== null ? defaultDayByPcId[firstActor] : undefined) ?? 1

  const [rows, setRows] = useState<RowState[]>(() => [
    makeBlankRow(firstActor, firstActorDay),
  ])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ----- Row mutators -----

  const addRow = useCallback(() => {
    setRows((prev) => {
      const lastActor: string =
        prev[prev.length - 1]?.actorPcId || firstActor || ''
      const fallbackDay =
        prev[prev.length - 1]?.dayInLoop ?? firstActorDay
      const day: number =
        (lastActor !== '' ? defaultDayByPcId[lastActor] : undefined) ??
        fallbackDay
      return [...prev, makeBlankRow(lastActor || null, day)]
    })
  }, [firstActor, firstActorDay, defaultDayByPcId])

  const removeRow = useCallback((clientId: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.clientId !== clientId)))
  }, [])

  const updateRow = useCallback(<K extends keyof RowState>(
    clientId: string,
    field: K,
    value: RowState[K],
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.clientId === clientId ? { ...r, [field]: value } : r)),
    )
  }, [])

  /** Multi-field update — used by ItemTypeahead which sets itemNodeId+itemName together. */
  const patchRow = useCallback((clientId: string, patch: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)),
    )
  }, [])

  // ----- Submit -----

  const handleSubmit = useCallback(async () => {
    setError(null)

    // Client-side validation. Server re-validates authoritatively.
    if (rows.length === 0) {
      setError('Пусто — добавьте ряд.')
      return
    }
    for (const row of rows) {
      if (!row.actorPcId) {
        setError(`Ряд: не выбран персонаж.`)
        return
      }
      if (!Number.isInteger(row.dayInLoop) || row.dayInLoop < 1) {
        setError(`Ряд: некорректный день.`)
        return
      }
      if (row.kind === 'item') {
        if (!row.itemName.trim()) {
          setError(`Ряд: не указано название предмета.`)
          return
        }
        if (!Number.isInteger(row.itemQty) || row.itemQty < 1) {
          setError(`Ряд: количество предметов ≥ 1.`)
          return
        }
      } else {
        const mag = rowAmountMagnitudeGp(row)
        if (mag <= 0) {
          setError(`Ряд: введите ненулевую сумму.`)
          return
        }
        if (row.kind === 'transfer' && !row.recipientPcId) {
          setError(`Ряд: не выбран получатель перевода.`)
          return
        }
        if (row.kind === 'transfer' && row.recipientPcId === row.actorPcId) {
          setError(`Ряд: отправитель и получатель совпадают.`)
          return
        }
      }
    }

    // Build SubmitBatchInput.
    const submitRows: BatchRowSubmitInput[] = rows.map((row) => {
      const common = {
        clientId: row.clientId,
        categorySlug: KIND_TO_CATEGORY[row.kind],
        comment: row.comment,
        loopNumber: defaultLoopNumber,
        dayInLoop: row.dayInLoop,
        sessionId: defaultSessionId ?? null,
      }
      if (row.kind === 'item') {
        return {
          ...common,
          kind: 'item',
          actorPcId: row.actorPcId,
          itemName: row.itemName.trim(),
          itemNodeId: row.itemNodeId ?? undefined,
          itemQty: row.itemQty,
        }
      }
      const mag = rowAmountMagnitudeGp(row)
      // Sign convention: expense + transfer → outflow (negative
      // amountGp); income → positive. The server's resolver applies
      // the actual sign on the row, so we only need to indicate
      // direction here.
      const signedAmount = row.kind === 'income' ? mag : -mag

      if (row.kind === 'transfer') {
        return {
          ...common,
          kind: 'transfer-money',
          senderPcId: row.actorPcId,
          recipientPcId: row.recipientPcId!,
          // createTransfer expects a positive gp value and applies
          // the sign internally. Pass magnitude.
          amountGp: mag,
          perDenomOverride:
            row.amount.mode === 'denom' ? row.amount.coins : undefined,
        }
      }
      return {
        ...common,
        kind: 'money',
        actorPcId: row.actorPcId,
        amountGp: signedAmount,
        perDenomOverride:
          row.amount.mode === 'denom'
            ? // For expense, flip the per-denom override negative.
              row.kind === 'expense'
              ? {
                  cp: -Math.abs(row.amount.coins.cp),
                  sp: -Math.abs(row.amount.coins.sp),
                  gp: -Math.abs(row.amount.coins.gp),
                  pp: -Math.abs(row.amount.coins.pp),
                }
              : row.amount.coins
            : undefined,
      }
    })

    setSubmitting(true)
    try {
      const res = await submitBatch({
        campaignId,
        rows: submitRows,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      // Reset to a single blank row for the next batch.
      setRows([makeBlankRow(firstActor, firstActorDay)])
      router.refresh()
      onSuccess?.(res.batchId)
    } finally {
      setSubmitting(false)
    }
  }, [
    rows,
    campaignId,
    defaultLoopNumber,
    defaultSessionId,
    firstActor,
    firstActorDay,
    onSuccess,
    router,
  ])

  // ----- Render -----

  if (availablePcs.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
        У вас нет персонажей в этой кампании.
      </div>
    )
  }

  const submitLabel =
    rows.length === 1 ? 'Отправить заявку' : `Отправить ${rows.length} заявок`

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-900">
        Заявки отправляются мастеру на одобрение. Они появятся в очереди
        со значком «⏳ Ждёт DM» и не учитываются в балансах до одобрения.
      </div>

      <ul className="flex flex-col gap-3">
        {rows.map((row, idx) => (
          <li
            key={row.clientId}
            className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ряд {idx + 1}
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(row.clientId)}
                  disabled={submitting}
                  className="rounded p-1 text-xs text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                  aria-label="Удалить ряд"
                >
                  × удалить
                </button>
              )}
            </div>

            {/* Kind tabs */}
            <div className="flex flex-wrap gap-1">
              {(['income', 'expense', 'transfer', 'item'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => updateRow(row.clientId, 'kind', k)}
                  disabled={submitting}
                  className={
                    row.kind === k
                      ? 'rounded-md border border-blue-500 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-900'
                      : 'rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-600 hover:bg-gray-50'
                  }
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            {/* Actor select — always shown */}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Персонаж
              </span>
              <select
                value={row.actorPcId}
                onChange={(e) => {
                  const next = e.target.value
                  updateRow(row.clientId, 'actorPcId', next)
                  // Pull a fresh default-day for the new actor.
                  const day = defaultDayByPcId[next]
                  if (day) updateRow(row.clientId, 'dayInLoop', day)
                }}
                disabled={submitting}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
              >
                {availablePcs.map((pc) => (
                  <option key={pc.id} value={pc.id}>
                    {pc.title}
                  </option>
                ))}
              </select>
            </label>

            {/* Kind-specific block */}
            {row.kind === 'item' ? (
              <div className="flex flex-wrap gap-2">
                <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Название
                  </span>
                  <ItemTypeahead
                    campaignId={campaignId}
                    campaignSlug={campaignSlug}
                    value={{ itemNodeId: row.itemNodeId, itemName: row.itemName }}
                    onChange={(pick) =>
                      patchRow(row.clientId, {
                        itemNodeId: pick.itemNodeId,
                        itemName: pick.itemName,
                      })
                    }
                    canCreateNew={canEditCatalog}
                    showFreeTextHint={!canEditCatalog}
                    disabled={submitting}
                    placeholder="например, Зелье лечения"
                  />
                </label>
                <label className="flex w-24 flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Кол-во
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={row.itemQty || ''}
                    onChange={(e) =>
                      updateRow(
                        row.clientId,
                        'itemQty',
                        Math.max(1, Number(e.target.value) || 1),
                      )
                    }
                    disabled={submitting}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </label>
              </div>
            ) : (
              <AmountInput
                value={row.amount}
                onChange={(v) => updateRow(row.clientId, 'amount', v)}
              />
            )}

            {row.kind === 'transfer' && (
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Получатель
                </span>
                <select
                  value={row.recipientPcId ?? ''}
                  onChange={(e) =>
                    updateRow(row.clientId, 'recipientPcId', e.target.value || null)
                  }
                  disabled={submitting}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="" disabled>
                    Выберите персонажа
                  </option>
                  {availablePcs
                    .filter((pc) => pc.id !== row.actorPcId)
                    .map((pc) => (
                      <option key={pc.id} value={pc.id}>
                        {pc.title}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <label className="flex w-24 flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  День
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="365"
                  step="1"
                  value={row.dayInLoop || ''}
                  onChange={(e) =>
                    updateRow(
                      row.clientId,
                      'dayInLoop',
                      Math.max(1, Math.min(365, Number(e.target.value) || 1)),
                    )
                  }
                  disabled={submitting}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </label>
              <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Комментарий
                </span>
                <input
                  type="text"
                  value={row.comment}
                  onChange={(e) => updateRow(row.clientId, 'comment', e.target.value)}
                  disabled={submitting}
                  placeholder="например, продал зелья"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </label>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addRow}
        disabled={submitting}
        className="self-start rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
      >
        + Добавить ряд
      </button>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Отправка…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
