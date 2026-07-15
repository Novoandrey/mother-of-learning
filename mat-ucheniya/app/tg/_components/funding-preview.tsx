'use client'

import { computeShortfall } from '@/lib/transaction-resolver'
import { formatGp } from './format'
import { FIELD, parseGp } from './primitives'

type FundingSource = 'pc' | 'pc_with_stash' | 'stash'

/** Shared balance preview for purchases funded by a PC, the stash, or both. */
export function FundingPreview({
  funding,
  totalGp,
  walletGp,
  stashGp,
  keep,
  onKeep,
  panelClassName,
}: {
  funding: FundingSource
  totalGp: number | null
  walletGp: number | null
  stashGp: number | null
  keep: string
  onKeep: (v: string) => void
  panelClassName: string
}) {
  const keepGp = funding === 'pc_with_stash' ? Math.max(0, parseGp(keep) ?? 0) : 0
  const preview = (() => {
    if (totalGp == null || walletGp == null) return null
    if (funding === 'pc') {
      return { own: [walletGp, walletGp - totalGp] as const, stash: null, short: 0 }
    }
    if (funding === 'stash') {
      const s = stashGp ?? 0
      return { own: null, stash: [s, s - totalGp] as const, short: 0 }
    }
    const s = stashGp ?? 0
    const sf = computeShortfall(walletGp, totalGp, s, keepGp)
    const ownSpend = totalGp - sf.toBorrow
    return {
      own: [walletGp, walletGp - ownSpend] as const,
      stash: [s, s - sf.toBorrow] as const,
      short: sf.remainderNegative,
    }
  })()
  const arrow = (from: number, to: number) => (
    <span className="font-mono tabular-nums text-neutral-300">
      {formatGp(from)} →{' '}
      <span className={to < 0 ? 'text-red-400' : 'text-neutral-100'}>{formatGp(to)}</span>
    </span>
  )

  return (
    <>
      {funding === 'pc_with_stash' && (
        <input
          className={FIELD}
          inputMode="decimal"
          placeholder="Оставить на руках, зм (необязательно)"
          value={keep}
          onChange={(e) => onKeep(e.target.value)}
        />
      )}
      {preview && (
        <div className={`rounded-lg px-3 py-2 text-xs ${panelClassName}`}>
          {preview.own && (
            <div className="flex justify-between">
              <span className="text-neutral-400">Свои</span>
              {arrow(preview.own[0], preview.own[1])}
            </div>
          )}
          {preview.stash && (
            <div className="mt-0.5 flex justify-between">
              <span className="text-neutral-400">Общак</span>
              {arrow(preview.stash[0], preview.stash[1])}
            </div>
          )}
          {preview.short > 0 && (
            <p className="mt-1 text-red-400">
              Не хватает {formatGp(preview.short)} даже с общаком
            </p>
          )}
        </div>
      )}
    </>
  )
}
