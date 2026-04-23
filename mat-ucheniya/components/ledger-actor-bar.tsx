'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import TransactionFormSheet from './transaction-form-sheet'
import type { Category, TransactionWithRelations } from '@/lib/transactions'
import type { CampaignPC } from '@/app/actions/characters'

type Props = {
  campaignId: string
  availablePcs: CampaignPC[]
  categories: Category[]
  defaultLoopNumber: number
  /**
   * Per-PC default day pre-computed on the server (latest tx →
   * frontier → 1). The bar looks up the active PC's day from this
   * map when the sheet opens so the form pre-fills correctly without
   * a round-trip. Missing key → `1` fallback.
   */
  defaultDayByPcId: Record<string, number>
}

/**
 * Ledger-page create bar.
 *
 * Persisted single-select of the "acting" PC (localStorage keyed by
 * campaign id) + two coloured action buttons: Доход / Расход.
 *
 * Pressing a button opens `TransactionFormSheet` with `initialKind`
 * set so the user doesn't have to pick a tab again.
 *
 * Общий стах (IDEA-046 / spec-011) will later land here as the
 * first option in the PC dropdown — it's a disabled stub for now
 * so the UI telegraphs the intent.
 *
 * Item and Transfer live inside the form's 4-tab switcher — the
 * bar stays focused on the 90% path (cash in/out for a single PC).
 */
export default function LedgerActorBar({
  campaignId,
  availablePcs,
  categories,
  defaultLoopNumber,
  defaultDayByPcId,
}: Props) {
  const storageKey = `mol:accounting-actor-pc:${campaignId}`

  // Null = nothing chosen yet. Avoid SSR/client mismatch by loading
  // from localStorage inside an effect.
  const [actorPcId, setActorPcId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (saved && availablePcs.some((pc) => pc.id === saved)) {
        setActorPcId(saved)
      } else if (availablePcs.length > 0) {
        setActorPcId(availablePcs[0].id)
      }
    } catch {
      // localStorage disabled (private mode, etc.) — fall back to
      // the first available PC without persistence.
      if (availablePcs.length > 0) setActorPcId(availablePcs[0].id)
    } finally {
      setHydrated(true)
    }
  }, [availablePcs, storageKey])

  const handleActorChange = useCallback(
    (next: string) => {
      setActorPcId(next)
      try {
        window.localStorage.setItem(storageKey, next)
      } catch {
        // Intentional no-op; selection still works for the session.
      }
    },
    [storageKey],
  )

  const [sheetOpen, setSheetOpen] = useState(false)
  const [initialKind, setInitialKind] = useState<
    'income' | 'expense' | 'transfer' | null
  >(null)

  const openSheet = useCallback(
    (kind: 'income' | 'expense' | 'transfer') => {
      setInitialKind(kind)
      setSheetOpen(true)
    },
    [],
  )

  const closeSheet = useCallback(() => {
    setSheetOpen(false)
    setInitialKind(null)
  }, [])

  const selectedPc = useMemo(
    () => availablePcs.find((pc) => pc.id === actorPcId) ?? null,
    [availablePcs, actorPcId],
  )

  if (availablePcs.length === 0) {
    return null
  }

  const buttonsDisabled = !hydrated || !selectedPc

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Персонаж
        </span>
        <select
          value={actorPcId ?? ''}
          onChange={(e) => handleActorChange(e.target.value)}
          disabled={!hydrated}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        >
          {/*
            Планируемый общий стах (IDEA-046 / spec-011) появится здесь
            первой строкой с id='stash' и отключит ownership-проверку.
            Пока — disabled-плейсхолдер, чтобы UI говорил о намерении.
          */}
          <option value="__stash__" disabled>
            Общий стах (скоро)
          </option>
          {availablePcs.map((pc) => (
            <option key={pc.id} value={pc.id}>
              {pc.title}
              {pc.owner_display_name ? ` — ${pc.owner_display_name}` : ''}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => openSheet('income')}
        disabled={buttonsDisabled}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        + Доход
      </button>
      <button
        type="button"
        onClick={() => openSheet('expense')}
        disabled={buttonsDisabled}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
      >
        − Расход
      </button>
      <button
        type="button"
        onClick={() => openSheet('transfer')}
        disabled={buttonsDisabled}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        Перевод →
      </button>

      {selectedPc && initialKind && (
        <TransactionFormSheet
          open={sheetOpen}
          onClose={closeSheet}
          campaignId={campaignId}
          actorPcId={selectedPc.id}
          defaultLoopNumber={defaultLoopNumber}
          defaultDayInLoop={defaultDayByPcId[selectedPc.id] ?? 1}
          defaultSessionId={null}
          categories={categories}
          editing={null}
          initialKind={initialKind}
        />
      )}
    </div>
  )
}

// Re-export the editing type so pages that only need the bar type
// signature don't have to chase imports.
export type { TransactionWithRelations }
