/* eslint-disable @next/next/no-img-element -- R2 public base is deployment-configured and assets have no stored dimensions in MEDIA-01. */

import type { MediaAssetView } from '@/lib/media'

type Props = {
  assets: MediaAssetView[]
  canManage: boolean
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} КБ`
  return `${(value / (1024 * 1024)).toFixed(1).replace('.0', '')} МБ`
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

export function MediaLibrary({ assets, canManage }: Props) {
  if (assets.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center">
        <div className="text-4xl" aria-hidden>🖼️</div>
        <h2 className="mt-3 text-lg font-semibold text-gray-900">Медиатека пуста</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-gray-500">
          {canManage
            ? 'Загрузите первое изображение. Позже отсюда можно будет выбирать портреты, фоны и карты без повторной загрузки.'
            : 'Ведущий ещё не добавил изображения в общую библиотеку кампании.'}
        </p>
      </section>
    )
  }

  return (
    <section aria-label="Изображения кампании">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-800">
          Изображения <span className="font-normal text-gray-400">{assets.length}</span>
        </h2>
        <p className="text-xs text-gray-400">Сначала новые</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {assets.map((asset) => (
          <article
            key={asset.id}
            className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="aspect-square bg-gray-100">
              {asset.url ? (
                <img
                  src={asset.url}
                  alt={asset.originalFilename}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center px-3 text-center text-xs text-gray-400">
                  Превью недоступно: не настроен публичный адрес хранилища
                </div>
              )}
            </div>
            <div className="p-3">
              <h3 className="truncate text-sm font-medium text-gray-900" title={asset.originalFilename}>
                {asset.originalFilename}
              </h3>
              <p className="mt-1 text-xs text-gray-400">
                {formatBytes(asset.sizeBytes)} · {formatCreatedAt(asset.createdAt)}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
