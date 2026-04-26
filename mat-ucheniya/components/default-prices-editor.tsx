'use client'

/**
 * Spec-015 follow-up (chat 70). DM-facing editor for per-rarity
 * default prices. Two tables side by side — magic items vs
 * consumables — because consumables traditionally cost ~half of
 * an equivalent-rarity wondrous item (DMG variants table).
 *
 * Edits are debounced (400ms) and persisted via `updateItemDefaultPrices`.
 * Empty input means "no default" — null in storage, no auto-prefill.
 *
 * The form prefills are wired in the item form itself (this component
 * just owns the per-rarity numbers).
 */

import { useEffect, useRef, useState } from 'react'

import { updateItemDefaultPrices } from '@/app/c/[slug]/settings/actions'
import {
  RARITY_KEYS,
  type ItemDefaultPrices,
  type RarityKey,
  type RarityPriceMap,
} from '@/lib/item-default-prices'

const RARITY_LABEL: Record<RarityKey, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
}

type Props = {
  campaignSlug: string
  initial: ItemDefaultPrices
  canEdit: boolean
}

export default function DefaultPricesEditor({
  campaignSlug,
  initial,
  canEdit,
}: Props) {
  const [prices, setPrices] = useState<ItemDefaultPrices>(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  )
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Hide "Сохранено" tag after a short delay so it doesn't linger.
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function schedulePersist(next: ItemDefaultPrices) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (fadeRef.current) clearTimeout(fadeRef.current)
    setStatus('saving')
    debounceRef.current = setTimeout(async () => {
      const r = await updateItemDefaultPrices(campaignSlug, next)
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

  function updateValue(
    bucket: 'magic' | 'consumable',
    rarity: RarityKey,
    raw: string,
  ) {
    const trimmed = raw.trim()
    let parsed: number | null
    if (trimmed === '') {
      parsed = null
    } else {
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) {
        // Reject: keep prior value.
        return
      }
      parsed = n
    }

    const nextBucket: RarityPriceMap = { ...prices[bucket], [rarity]: parsed }
    const next: ItemDefaultPrices = { ...prices, [bucket]: nextBucket }
    setPrices(next)
    schedulePersist(next)
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Когда ДМ создаёт новый Образец и выбирает редкость, поле «Цена» автоматически заполнится этим значением (если поле пустое). Введи руками — перезапишет. Оставь пустым, чтобы автозаполнение не срабатывало.
      </p>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PriceTable
          title="Магические предметы"
          subtitle="Категория «магический» / «чудесный»."
          bucket="magic"
          values={prices.magic}
          canEdit={canEdit}
          onChange={(rarity, raw) => updateValue('magic', rarity, raw)}
        />
        <PriceTable
          title="Расходники"
          subtitle="Категория «расходник». Обычно вдвое дешевле."
          bucket="consumable"
          values={prices.consumable}
          canEdit={canEdit}
          onChange={(rarity, raw) => updateValue('consumable', rarity, raw)}
        />
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

function PriceTable({
  title,
  subtitle,
  bucket,
  values,
  canEdit,
  onChange,
}: {
  title: string
  subtitle: string
  bucket: 'magic' | 'consumable'
  values: RarityPriceMap
  canEdit: boolean
  onChange: (rarity: RarityKey, raw: string) => void
}) {
  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="mb-1 text-sm font-medium text-gray-900">{title}</div>
      <div className="mb-3 text-xs text-gray-500">{subtitle}</div>
      <table className="w-full text-sm">
        <tbody>
          {RARITY_KEYS.map((r) => (
            <tr key={r} className="border-b border-gray-100 last:border-b-0">
              <td className="py-1.5 pr-2 text-gray-700">{RARITY_LABEL[r]}</td>
              <td className="py-1.5 text-right">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={values[r] ?? ''}
                  placeholder="—"
                  disabled={!canEdit}
                  onChange={(e) => onChange(r, e.target.value)}
                  aria-label={`${title} — ${RARITY_LABEL[r]} (gp)`}
                  className="w-28 rounded border border-gray-300 bg-white px-2 py-1 text-right font-mono text-sm text-gray-900 disabled:bg-gray-50 disabled:text-gray-500"
                  data-bucket={bucket}
                  data-rarity={r}
                />
                <span className="ml-1 text-xs text-gray-400">gp</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
