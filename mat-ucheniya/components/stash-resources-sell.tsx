'use client'

/**
 * Desktop общак resource-sale section (spec-055 доработки). Mirrors the /tg
 * «Ресурсы» affordance of the Партия tab on the accounting/stash page: each
 * resource currently in the общак with a quantity picker and a «Продать» button
 * that sells it back at its nominal (money → общак, stock out) via
 * `sellStashResource`.
 *
 * Server-fetched `resources` (getStashResourceHoldingsTg) are handed in; the
 * sale is a server action; `router.refresh()` re-reads the RSC afterwards so the
 * balance + holdings update. Any campaign member may sell (spec-055 «и ДМ, и
 * игроки») — the action gates on membership.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { sellStashResource } from '@/app/actions/resources'
import type { StashResourceHoldingTg } from '@/lib/queries/ledger-tg'

export default function StashResourcesSell({
  campaignId,
  loopNumber,
  dayInLoop,
  resources,
}: {
  campaignId: string
  loopNumber: number
  dayInLoop: number
  resources: StashResourceHoldingTg[]
}) {
  if (resources.length === 0) return null
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h2 className="mb-3 text-sm font-semibold text-gray-900">Ресурсы общака</h2>
      <ul className="space-y-2">
        {resources.map((r) => (
          <ResourceRow
            key={r.itemNodeId}
            campaignId={campaignId}
            loopNumber={loopNumber}
            dayInLoop={dayInLoop}
            resource={r}
          />
        ))}
      </ul>
    </div>
  )
}

function ResourceRow({
  campaignId,
  loopNumber,
  dayInLoop,
  resource,
}: {
  campaignId: string
  loopNumber: number
  dayInLoop: number
  resource: StashResourceHoldingTg
}) {
  const router = useRouter()
  const [qty, setQty] = useState(resource.qty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const n = Math.min(Math.max(1, Math.trunc(Number.isFinite(qty) ? qty : 1)), resource.qty)

  const sell = async () => {
    setError(null)
    setBusy(true)
    const res = await sellStashResource({
      campaignId,
      itemNodeId: resource.itemNodeId,
      qty: n,
      loopNumber,
      dayInLoop,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    router.refresh()
  }

  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span className="flex-1 min-w-40 text-gray-800">
        {resource.name} · ×{resource.qty} · {resource.priceGp} зм/шт
      </span>
      <input
        type="number"
        min={1}
        max={resource.qty}
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
        className="w-16 rounded border border-gray-200 px-2 py-1 text-center text-gray-900"
      />
      <button
        type="button"
        onClick={sell}
        disabled={busy}
        className="rounded-lg bg-gray-900 px-3 py-1 text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
      >
        {busy ? '…' : `Продать (${n * resource.priceGp} зм)`}
      </button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </li>
  )
}
