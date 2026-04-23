'use client'

import type { Wallet } from '@/lib/transactions'
import { DENOMINATIONS } from '@/lib/transaction-resolver'
import { DENOM_SHORT } from '@/lib/transaction-format'

type Props = {
  wallet: Wallet
  /** Optional caption shown to the right of the gp aggregate (e.g. "Петля 3"). */
  caption?: string
}

/**
 * Wallet balance — pure presentation component.
 *
 * Renders the aggregate gp as the primary line with cp-precision
 * formatting (`75.00 GP`), and a per-denomination caption below
 * (`0 c · 3 s · 75 g · 0 p`).
 *
 * The per-denom line iterates over `DENOMINATIONS` from the
 * resolver — adding a homebrew coin is one const entry and every
 * wallet display picks it up.
 */
export default function WalletBalance({ wallet, caption }: Props) {
  const agg = wallet.aggregate_gp

  // Sign placement: typographic minus, single aggregate-level sign.
  const sign = agg < 0 ? '\u2212' : ''
  const primary = `${sign}${Math.abs(agg).toFixed(2)} GP`

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold text-gray-900">{primary}</span>
        {caption && (
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            {caption}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-500">
        {DENOMINATIONS.map((d) => `${wallet.coins[d]} ${DENOM_SHORT[d]}`).join(' · ')}
      </div>
    </div>
  )
}
