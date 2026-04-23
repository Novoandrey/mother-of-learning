'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCampaignPCs, type CampaignPC } from '@/app/actions/characters'

type Props = {
  campaignId: string
  /** Sender PC id — excluded from the list. */
  excludeId: string
  value: string | null
  onChange: (pcId: string) => void
  disabled?: boolean
}

/**
 * Recipient picker for transfers — native `<select>`.
 *
 * MVP uses the native control on every viewport for reliable OS
 * integration (mobile shows its own picker UI). Reuses
 * `getCampaignPCs` from spec-009.
 */
export default function TransferRecipientPicker({
  campaignId,
  excludeId,
  value,
  onChange,
  disabled,
}: Props) {
  const [pcs, setPcs] = useState<CampaignPC[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getCampaignPCs(campaignId)
      setPcs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список')
      setPcs([])
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => {
    load()
  }, [load])

  const options = (pcs ?? []).filter((pc) => pc.id !== excludeId)

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Получатель
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || loading || !pcs}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      >
        <option value="" disabled>
          {loading ? 'Загрузка…' : 'Выберите персонажа'}
        </option>
        {options.map((pc) => (
          <option key={pc.id} value={pc.id}>
            {pc.title}
            {pc.owner_display_name ? ` — ${pc.owner_display_name}` : ''}
          </option>
        ))}
      </select>
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
    </div>
  )
}
