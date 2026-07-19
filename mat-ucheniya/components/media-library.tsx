'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { MediaPage, MediaPageItem } from '@/lib/media'

type Props = {
  initialPage: MediaPage
  campaignId: string
  campaignSlug: string
  canManage: boolean
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} КБ`
  return `${(value / (1024 * 1024)).toFixed(1).replace('.0', '')} МБ`
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(value))
}

function AssetCard({ asset, campaignSlug, canManage, onRetry }: {
  asset: MediaPageItem
  campaignSlug: string
  canManage: boolean
  onRetry: (assetId: string) => Promise<void>
}) {
  const status = asset.variantState
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="aspect-square bg-gray-100">
        {asset.thumbnail?.url ? (
          <img src={asset.thumbnail.url} alt={asset.originalFilename} loading="lazy" width={asset.thumbnail.width} height={asset.thumbnail.height} className="h-full w-full object-cover" />
        ) : status === 'failed' ? (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-red-600">Превью не подготовлено</div>
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-gray-400">Готовим превью…</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-gray-900" title={asset.originalFilename}>{asset.originalFilename}</h3>
        <p className="mt-1 text-xs text-gray-400">{formatBytes(asset.sizeBytes)} · {formatCreatedAt(asset.createdAt)}</p>
        {status === 'failed' && canManage && (
          <button type="button" onClick={() => void onRetry(asset.id)} className="mt-2 text-xs font-medium text-blue-600 hover:text-blue-700">Повторить обработку</button>
        )}
        {asset.linkedNodes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs">
            {asset.linkedNodes.map((node) => (
              <Link
                key={node.id}
                href={`/c/${campaignSlug}/catalog/${node.id}`}
                className="text-blue-600 hover:underline"
              >
                {node.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

export function MediaLibrary({ initialPage, campaignId, campaignSlug, canManage }: Props) {
  const [items, setItems] = useState(initialPage.items)
  const [total, setTotal] = useState(initialPage.total)
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadMore() {
    if (!nextCursor || loading) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ campaignId, cursor: nextCursor })
      const response = await fetch(`/api/media?${params}`)
      const payload = await response.json() as MediaPage & { error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Не удалось загрузить следующую страницу.')
      setItems((previous) => [...previous, ...payload.items.filter((asset) => !previous.some((known) => known.id === asset.id))])
      setTotal(payload.total)
      setNextCursor(payload.nextCursor)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!items.some((asset) => asset.variantState === 'queued' || asset.variantState === 'processing')) return

    const refreshFirstPage = async () => {
      try {
        const response = await fetch(`/api/media?${new URLSearchParams({ campaignId })}`)
        if (!response.ok) return
        const page = await response.json() as MediaPage
        const newestById = new Map(page.items.map((asset) => [asset.id, asset]))
        setItems((previous) => previous.map((asset) => newestById.get(asset.id) ?? asset))
        setTotal(page.total)
      } catch {
        // Background preview refresh is best-effort; the explicit load-more path reports errors.
      }
    }

    const interval = window.setInterval(() => void refreshFirstPage(), 3_000)
    return () => window.clearInterval(interval)
  }, [campaignId, items])

  async function retry(assetId: string) {
    const response = await fetch(`/api/media/${assetId}/retry-variants`, { method: 'POST' })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      setError(payload.error ?? 'Не удалось повторить обработку.')
      return
    }
    setItems((previous) => previous.map((asset) => asset.id === assetId ? { ...asset, variantState: 'queued', variantErrorCode: null } : asset))
  }

  if (items.length === 0) {
    return <section className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center"><div className="text-4xl" aria-hidden>🖼️</div><h2 className="mt-3 text-lg font-semibold text-gray-900">Медиатека пуста</h2><p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">{canManage ? 'Загрузите первое изображение. Превью подготовится автоматически.' : 'Ведущий ещё не добавил изображения в общую библиотеку кампании.'}</p></section>
  }

  return <section aria-label="Изображения кампании"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-gray-800">Изображения <span className="font-normal text-gray-400">{items.length} / {total}</span></h2><p className="text-xs text-gray-400">Сначала новые</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((asset) => <AssetCard key={asset.id} asset={asset} campaignSlug={campaignSlug} canManage={canManage} onRetry={retry} />)}</div>{nextCursor && <div className="mt-5 text-center"><button type="button" disabled={loading} onClick={() => void loadMore()} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{loading ? 'Загружаем…' : 'Загрузить ещё'}</button></div>}{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}</section>
}
