'use client'

/**
 * Spec-052 (C-13/C-14). DM-facing editor for the per-rarity purchase policy:
 * a price coefficient (multiplier on the resolved buy price) and an
 * approval-required toggle, per rarity. Debounced (400ms) save via
 * updateItemPurchasePolicy. This layers on top of the default prices — it
 * scales the resolved buy price, it does not replace it.
 */

import { useEffect, useRef, useState } from 'react'

import { updateItemPurchasePolicy } from '@/app/c/[slug]/settings/actions'
import { RARITY_KEYS, type RarityKey } from '@/lib/item-default-prices'
import type { ItemPurchasePolicy } from '@/lib/item-purchase-policy'

const RARITY_LABEL: Record<RarityKey, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
}

type Props = {
  campaignSlug: string
  initial: ItemPurchasePolicy
  canEdit: boolean
}

export default function ItemPurchasePolicyEditor({
  campaignSlug,
  initial,
  canEdit,
}: Props) {
  const [policy, setPolicy] = useState<ItemPurchasePolicy>(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function schedulePersist(next: ItemPurchasePolicy) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (fadeRef.current) clearTimeout(fadeRef.current)
    setStatus('saving')
    debounceRef.current = setTimeout(async () => {
      const r = await updateItemPurchasePolicy(campaignSlug, next)
      if (r.ok) {
        setStatus('saved')
        setErrorMsg(null)
        fadeRef.current = setTimeout(() => setStatus('idle'), 1500)
      } else {
        setStatus('error')
        setErrorMsg(r.error)
      }
    }, 400)
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (fadeRef.current) clearTimeout(fadeRef.current)
    },
    [],
  )

  function setCoefficient(rarity: RarityKey, raw: string) {
    const trimmed = raw.trim()
    let parsed: number
    if (trimmed === '') {
      parsed = 1
    } else {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) return // reject — keep prior value
      parsed = n
    }
    const next: ItemPurchasePolicy = {
      ...policy,
      coefficient: { ...policy.coefficient, [rarity]: parsed },
    }
    setPolicy(next)
    schedulePersist(next)
  }

  function setApproval(rarity: RarityKey, value: boolean) {
    const next: ItemPurchasePolicy = {
      ...policy,
      approvalRequired: { ...policy.approvalRequired, [rarity]: value },
    }
    setPolicy(next)
    schedulePersist(next)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Коэффициент умножает цену покупки (1 — без изменений, 0.5 — вдвое
        дешевле, 2 — вдвое дороже). «Одобрение» — покупка этой редкости уходит
        ведущему на подтверждение независимо от источника денег.
      </p>

      <div className="rounded border border-gray-200 bg-white p-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
              <th className="py-1.5 pr-2 font-medium">Редкость</th>
              <th className="py-1.5 pr-2 text-right font-medium">Коэффициент</th>
              <th className="py-1.5 text-center font-medium">Одобрение</th>
            </tr>
          </thead>
          <tbody>
            {RARITY_KEYS.map((r) => (
              <tr key={r} className="border-b border-gray-100 last:border-b-0">
                <td className="py-1.5 pr-2 text-gray-700">{RARITY_LABEL[r]}</td>
                <td className="py-1.5 pr-2 text-right">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.05"
                    value={policy.coefficient[r] ?? 1}
                    disabled={!canEdit}
                    onChange={(e) => setCoefficient(r, e.target.value)}
                    aria-label={`${RARITY_LABEL[r]} — коэффициент`}
                    className="w-24 rounded border border-gray-300 bg-white px-2 py-1 text-right font-mono text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                    data-rarity={r}
                  />
                  <span className="ml-1 text-xs text-gray-400">×</span>
                </td>
                <td className="py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={policy.approvalRequired[r] ?? false}
                    disabled={!canEdit}
                    onChange={(e) => setApproval(r, e.target.checked)}
                    aria-label={`${RARITY_LABEL[r]} — требует одобрения`}
                    className="h-4 w-4 disabled:opacity-50"
                    data-rarity={r}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs">
        {status === 'saving' && <span className="text-gray-400">Сохранение…</span>}
        {status === 'saved' && <span className="text-green-700">✓ Сохранено</span>}
        {status === 'error' && (
          <span className="text-red-700">Ошибка: {errorMsg}</span>
        )}
      </div>
    </div>
  )
}
