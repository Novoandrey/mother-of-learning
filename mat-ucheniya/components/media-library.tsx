'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { MediaAssetUsage, MediaPage, MediaPageItem } from '@/lib/media'

type Props = {
  initialPage: MediaPage
  campaignId: string
  campaignSlug: string
  canRetry: boolean
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

type DeletionState =
  | { assetId: string; status: 'loading' }
  | { assetId: string; status: 'ready'; usages: MediaAssetUsage[] }
  | { assetId: string; status: 'error'; message: string }

function AssetCard({ asset, campaignSlug, canRetry, onRetry, deletion, onOpenDelete, onConfirmDelete, onCloseDelete }: {
  asset: MediaPageItem
  campaignSlug: string
  canRetry: boolean
  onRetry: (assetId: string) => Promise<void>
  deletion: DeletionState | null
  onOpenDelete: (assetId: string) => void
  onConfirmDelete: (assetId: string) => void
  onCloseDelete: () => void
}) {
  const status = asset.variantState
  const isDeleting = deletion?.assetId === asset.id
  return (
    <article className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="aspect-square bg-gray-100">
        {asset.thumbnail?.url ? (
          <img src={asset.thumbnail.url} alt={asset.originalFilename} loading="lazy" width={asset.thumbnail.width} height={asset.thumbnail.height} className="h-full w-full object-contain" />
        ) : status === 'failed' ? (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-red-600">Превью не подготовлено</div>
        ) : (
          <div className="grid h-full place-items-center px-3 text-center text-xs text-gray-400">Готовим превью…</div>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate text-sm font-medium text-gray-900" title={asset.originalFilename}>{asset.originalFilename}</h3>
        <p className="mt-1 text-xs text-gray-400">{formatBytes(asset.sizeBytes)} · {formatCreatedAt(asset.createdAt)}</p>
        {status === 'failed' && canRetry && (
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
        {isDeleting ? (
          <div className="mt-3 border-t border-gray-100 pt-3 text-xs">
            {deletion.status === 'loading' && <p className="text-gray-500">Проверяем использования…</p>}
            {deletion.status === 'error' && <p role="alert" className="text-red-600">{deletion.message}</p>}
            {deletion.status === 'ready' && deletion.usages.length > 0 && (
              <div>
                <p className="font-medium text-gray-800">Удалить нельзя: ассет используется</p>
                <ul className="mt-1 space-y-1">
                  {deletion.usages.map((usage) => (
                    <li key={`${usage.kind}-${usage.nodeId}`}>
                      <Link href={`/c/${campaignSlug}/catalog/${usage.nodeId}`} className="text-blue-600 hover:underline">
                        Портрет: {usage.nodeTitle}{usage.count > 1 ? ` (${usage.count})` : ''}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {deletion.status === 'ready' && deletion.usages.length === 0 && (
              <div>
                <p className="text-gray-700">Удалить «{asset.originalFilename}» из медиатеки? Это действие нельзя отменить.</p>
                {asset.linkedNodes.length > 0 && <p className="mt-1 text-gray-500">Связи импорта с нодами будут очищены вместе с ассетом.</p>}
                <button type="button" onClick={() => onConfirmDelete(asset.id)} className="mt-2 font-medium text-red-600 hover:text-red-700">Удалить ассет</button>
              </div>
            )}
            <button type="button" onClick={onCloseDelete} className="ml-3 mt-2 text-gray-500 hover:text-gray-700">Закрыть</button>
          </div>
        ) : (
          <button type="button" onClick={() => onOpenDelete(asset.id)} className="mt-3 text-xs font-medium text-red-600 hover:text-red-700">Удалить…</button>
        )}
      </div>
    </article>
  )
}

export function MediaLibrary({ initialPage, campaignId, campaignSlug, canRetry }: Props) {
  const [items, setItems] = useState(initialPage.items)
  const [total, setTotal] = useState(initialPage.total)
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletion, setDeletion] = useState<DeletionState | null>(null)

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

  async function openDelete(assetId: string) {
    setDeletion({ assetId, status: 'loading' })
    try {
      const response = await fetch(`/api/media/${assetId}/usage?${new URLSearchParams({ campaignId })}`)
      const payload = await response.json() as { usages?: MediaAssetUsage[]; error?: string }
      if (!response.ok) throw new Error(payload.error ?? 'Не удалось проверить использования ассета.')
      setDeletion({ assetId, status: 'ready', usages: payload.usages ?? [] })
    } catch (cause) {
      setDeletion({ assetId, status: 'error', message: cause instanceof Error ? cause.message : 'Не удалось проверить использования ассета.' })
    }
  }

  async function confirmDelete(assetId: string) {
    setDeletion({ assetId, status: 'loading' })
    try {
      const response = await fetch(`/api/media/${assetId}?${new URLSearchParams({ campaignId })}`, { method: 'DELETE' })
      const payload = await response.json() as { usages?: MediaAssetUsage[]; error?: string }
      if (response.status === 409) {
        setDeletion({ assetId, status: 'ready', usages: payload.usages ?? [] })
        return
      }
      if (!response.ok) throw new Error(payload.error ?? 'Не удалось удалить ассет.')
      setItems((previous) => previous.filter((asset) => asset.id !== assetId))
      setTotal((previous) => Math.max(0, previous - 1))
      setDeletion(null)
    } catch (cause) {
      setDeletion({ assetId, status: 'error', message: cause instanceof Error ? cause.message : 'Не удалось удалить ассет.' })
    }
  }

  if (items.length === 0) {
    return <section className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center"><div className="text-4xl" aria-hidden>🖼️</div><h2 className="mt-3 text-lg font-semibold text-gray-900">Медиатека пуста</h2><p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">Загрузите первое изображение. Превью подготовится автоматически.</p></section>
  }

  return <section aria-label="Изображения кампании"><div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-gray-800">Изображения <span className="font-normal text-gray-400">{items.length} / {total}</span></h2><p className="text-xs text-gray-400">Сначала новые</p></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map((asset) => <AssetCard key={asset.id} asset={asset} campaignSlug={campaignSlug} canRetry={canRetry} onRetry={retry} deletion={deletion} onOpenDelete={openDelete} onConfirmDelete={confirmDelete} onCloseDelete={() => setDeletion(null)} />)}</div>{nextCursor && <div className="mt-5 text-center"><button type="button" disabled={loading} onClick={() => void loadMore()} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{loading ? 'Загружаем…' : 'Загрузить ещё'}</button></div>}{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}</section>
}
