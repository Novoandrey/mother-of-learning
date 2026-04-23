'use client'

import { useCallback, useEffect, useState } from 'react'
import { getCampaignPCs, type CampaignPC } from '@/app/actions/characters'

type Props = {
  campaignId: string
  /** Sender PC id — excluded from the list of valid recipients. */
  excludeId: string
  value: string | null
  onChange: (pcId: string) => void
  disabled?: boolean
}

/**
 * Recipient picker for transfers — single-select, filterable.
 *
 * Sender PC is excluded from the list via `excludeId`. Fetch happens
 * once on mount via the campaign-wide `getCampaignPCs` action
 * (reused from spec-009 participants picker).
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
  const [query, setQuery] = useState('')

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

  const filtered = (pcs ?? []).filter(
    (pc) =>
      pc.id !== excludeId &&
      pc.title.toLowerCase().includes(query.trim().toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        Получатель
      </label>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск персонажа…"
        disabled={disabled || loading}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none disabled:opacity-50"
      />
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="px-3 py-2 text-sm text-gray-400">Загрузка…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-400">
            {query ? 'Ничего не найдено' : 'Нет доступных получателей'}
          </div>
        ) : (
          <ul className="flex flex-col">
            {filtered.map((pc) => {
              const active = pc.id === value
              return (
                <li key={pc.id}>
                  <button
                    type="button"
                    onClick={() => onChange(pc.id)}
                    disabled={disabled}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 ${
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{pc.title}</span>
                    {pc.owner_display_name && (
                      <span className="text-xs text-gray-400">
                        {pc.owner_display_name}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
