'use client'

import { useState, useTransition } from 'react'

import {
  updateCampaignStarterConfig,
  updatePcStarterConfig,
} from '@/app/actions/starter-setup'
import type { CoinSet } from '@/lib/transactions'

type Scope =
  | { kind: 'pc'; pcId: string }
  | { kind: 'campaign_loan'; campaignId: string }
  | { kind: 'campaign_stash'; campaignId: string }

/**
 * Spec-012 T031 — 4-input coin picker (cp/sp/gp/pp). Reused across
 * three places: per-PC starting coins, campaign loan amount, campaign
 * stash seed coins. The scope prop selects which server action is
 * called on save.
 *
 * Plain edit + save form — no autosave, matches the rest of the
 * project's coin-editing surfaces (Wallet block's "+ Транзакция" flow,
 * category editor, etc).
 */
export function StartingCoinPickerClient({
  scope,
  initialCoins,
}: {
  scope: Scope
  initialCoins: CoinSet
}) {
  const [coins, setCoins] = useState<CoinSet>(initialCoins)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [pending, startTransition] = useTransition()

  const dirty =
    coins.cp !== initialCoins.cp ||
    coins.sp !== initialCoins.sp ||
    coins.gp !== initialCoins.gp ||
    coins.pp !== initialCoins.pp

  function update(key: keyof CoinSet, raw: string) {
    const n = raw === '' ? 0 : Number(raw)
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return
    setCoins((prev) => ({ ...prev, [key]: n }))
    setSavedAt(null)
  }

  async function save() {
    setError(null)
    let result
    if (scope.kind === 'pc') {
      result = await updatePcStarterConfig(scope.pcId, {
        startingCoins: coins,
      })
    } else if (scope.kind === 'campaign_loan') {
      result = await updateCampaignStarterConfig(scope.campaignId, {
        loanAmount: coins,
      })
    } else {
      result = await updateCampaignStarterConfig(scope.campaignId, {
        stashSeedCoins: coins,
      })
    }

    if (!result.ok) {
      setError(result.error)
      return
    }
    setSavedAt(Date.now())
  }

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {(['cp', 'sp', 'gp', 'pp'] as const).map((denom) => (
          <label key={denom} className="text-xs text-gray-600">
            <span className="uppercase tracking-wide">{denom}</span>
            <input
              type="number"
              min={0}
              step={1}
              value={coins[denom]}
              onChange={(e) => update(denom, e.target.value)}
              disabled={pending}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-60"
            />
          </label>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => startTransition(() => void save())}
          disabled={pending || !dirty}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {savedAt && !dirty && (
          <span className="text-xs text-gray-500">Сохранено</span>
        )}
        {error && (
          <span className="text-xs text-red-600" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
