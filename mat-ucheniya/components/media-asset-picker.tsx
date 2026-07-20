'use client'

import { useEffect, useState } from 'react'
import type { MediaPage } from '@/lib/media'

type Props = {
  campaignId: string
  assignedAssetIds: string[]
  onSelect: (assetId: string) => Promise<{ ok?: boolean; error?: string; alreadyAssigned?: boolean }>
}

export function MediaAssetPicker({ campaignId, assignedAssetIds, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState<MediaPage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || page) return
    void (async () => {
      setError(null)
      const response = await fetch(`/api/media?${new URLSearchParams({ campaignId })}`)
      const payload = await response.json() as MediaPage & { error?: string }
      if (!response.ok) { setError(payload.error ?? 'Не удалось открыть медиатеку.'); return }
      setPage(payload)
    })()
  }, [campaignId, open, page])

  async function choose(assetId: string) {
    setBusy(assetId); setError(null)
    const result = await onSelect(assetId)
    if (result.error) setError(result.error)
    else setOpen(false)
    setBusy(null)
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100">Из медиатеки</button>
    {open && <div role="dialog" aria-modal="true" aria-label="Выбрать портрет из медиатеки" className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
      <div className="mx-auto max-w-3xl rounded-xl bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Выбрать портрет</h2><p className="text-sm text-gray-500">Готовые изображения кампании. Уже назначенное изображение выбрать повторно нельзя.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm hover:bg-gray-100">Закрыть</button></div>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        {!page && !error && <p className="mt-6 text-sm text-gray-500">Загружаем медиатеку…</p>}
        {page && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{page.items.map((asset) => {
          const assigned = assignedAssetIds.includes(asset.id)
          const ready = asset.variantState === 'ready' && !!asset.thumbnail
          return <button key={asset.id} type="button" disabled={!ready || assigned || busy === asset.id} onClick={() => void choose(asset.id)} className="overflow-hidden rounded-lg border border-gray-200 text-left disabled:cursor-not-allowed disabled:opacity-50 hover:border-blue-400">
            <div className="aspect-square bg-gray-100">{asset.thumbnail ? <img src={asset.thumbnail.url} alt="" className="h-full w-full object-contain" /> : <span className="grid h-full place-items-center px-2 text-center text-xs text-gray-500">{asset.variantState === 'failed' ? 'Превью недоступно' : 'Готовим превью…'}</span>}</div>
            <span className="block truncate p-2 text-xs text-gray-700">{assigned ? 'Уже назначено' : asset.originalFilename}</span>
          </button>
        })}</div>}
      </div>
    </div>}
  </>
}
