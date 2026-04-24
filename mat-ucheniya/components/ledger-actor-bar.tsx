'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import TransactionFormSheet from './transaction-form-sheet'
import StashButtons from './stash-buttons'
import type { Category, TransactionWithRelations } from '@/lib/transactions'
import type { CampaignPC } from '@/app/actions/characters'
import type { StashMeta } from '@/lib/stash'

type Props = {
  campaignId: string
  availablePcs: CampaignPC[]
  /** spec-011: stash node for this campaign. `null` → seeder hasn't run. */
  stashNode?: StashMeta | null
  categories: Category[]
  defaultLoopNumber: number
  /**
   * Per-PC default day pre-computed on the server (latest tx →
   * frontier → 1). The bar looks up the active PC's day from this
   * map when the sheet opens so the form pre-fills correctly without
   * a round-trip. Missing key → `1` fallback.
   */
  defaultDayByPcId: Record<string, number>
  /**
   * spec-011: current-loop number for stash operations. When `null`
   * the stash-pinned put/take buttons render as disabled with a hint.
   */
  currentLoopNumber?: number | null
}

/**
 * Ledger-page create bar.
 *
 * Persisted single-select of the "acting" actor — PCs **and** the
 * campaign's stash (Общак) when one exists. Behaviour:
 *
 *   - PC selected → показываем [+ Доход] [− Расход] [Перевод →]
 *     + [Положить в Общак] [Взять из Общака] (spec-011 StashButtons).
 *   - Stash selected → только три основных кнопки, без StashButtons
 *     (перевод stash↔stash бессмыслен; перевод stash→PC делается
 *     обычной кнопкой «Перевод →»).
 *
 * Selection persists in localStorage keyed by campaign id.
 */
export default function LedgerActorBar({
  campaignId,
  availablePcs,
  stashNode,
  categories,
  defaultLoopNumber,
  defaultDayByPcId,
  currentLoopNumber,
}: Props) {
  const storageKey = `mol:accounting-actor-pc:${campaignId}`

  // Null = nothing chosen yet. Avoid SSR/client mismatch by loading
  // from localStorage inside an effect.
  const [actorPcId, setActorPcId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // All selectable actors, stash first. Built once; dropdown reuses.
  const actors = useMemo(() => {
    const list: Array<{ id: string; label: string; isStash: boolean }> = []
    if (stashNode) {
      list.push({
        id: stashNode.nodeId,
        label: `${stashNode.icon ?? '💰'} ${stashNode.title}`,
        isStash: true,
      })
    }
    for (const pc of availablePcs) {
      list.push({
        id: pc.id,
        label: pc.owner_display_name
          ? `${pc.title} — ${pc.owner_display_name}`
          : pc.title,
        isStash: false,
      })
    }
    return list
  }, [availablePcs, stashNode])

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey)
      if (saved && actors.some((a) => a.id === saved)) {
        setActorPcId(saved)
      } else if (actors.length > 0) {
        // Prefer first PC over stash for the default selection — most
        // common flow is "I'm entering a transaction for my PC".
        const firstPc = actors.find((a) => !a.isStash)
        setActorPcId(firstPc?.id ?? actors[0].id)
      }
    } catch {
      if (actors.length > 0) {
        const firstPc = actors.find((a) => !a.isStash)
        setActorPcId(firstPc?.id ?? actors[0].id)
      }
    } finally {
      setHydrated(true)
    }
  }, [actors, storageKey])

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

  const selectedActor = useMemo(
    () => actors.find((a) => a.id === actorPcId) ?? null,
    [actors, actorPcId],
  )
  const selectedIsStash = selectedActor?.isStash ?? false

  if (actors.length === 0) {
    return null
  }

  const buttonsDisabled = !hydrated || !selectedActor

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Актор
        </span>
        <select
          value={actorPcId ?? ''}
          onChange={(e) => handleActorChange(e.target.value)}
          disabled={!hydrated}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50"
        >
          {actors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
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

      {/* StashButtons — only for PC actors. Stash-as-actor path can use
          the regular Transfer button to move money to a PC. */}
      {selectedActor && !selectedIsStash && stashNode && (
        <StashButtons
          campaignId={campaignId}
          actorPcId={selectedActor.id}
          currentLoopNumber={currentLoopNumber ?? null}
          defaultDay={defaultDayByPcId[selectedActor.id] ?? 1}
          defaultSessionId={null}
          categories={categories}
        />
      )}

      {selectedActor && initialKind && (
        <TransactionFormSheet
          open={sheetOpen}
          onClose={closeSheet}
          campaignId={campaignId}
          actorPcId={selectedActor.id}
          defaultLoopNumber={defaultLoopNumber}
          defaultDayInLoop={defaultDayByPcId[selectedActor.id] ?? 1}
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
