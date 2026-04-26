'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCampaignPCs, type CampaignPC } from '@/app/actions/characters'

type Props = {
  campaignId: string
  /** Sender PC id — excluded from the list. */
  excludeId: string
  value: string | null
  /**
   * Receives `null` when the user picks the clearable empty option
   * (only possible when `clearLabel` is set), otherwise the picked
   * PC id.
   */
  onChange: (pcId: string | null) => void
  disabled?: boolean
  /** Override the default «Получатель» label. */
  label?: string
  /** Override the placeholder. */
  placeholder?: string
  /**
   * When set, render a clearable empty option at the top of the list
   * with this label (e.g. «— без получателя —»). Use for optional
   * counterparty pickers; omit to keep the picker required.
   */
  clearLabel?: string
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
  label = 'Получатель',
  placeholder = 'Выберите персонажа',
  clearLabel,
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
        {label}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        disabled={disabled || loading || !pcs}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      >
        {clearLabel ? (
          <option value="">{loading ? 'Загрузка…' : clearLabel}</option>
        ) : (
          <option value="" disabled>
            {loading ? 'Загрузка…' : placeholder}
          </option>
        )}
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
