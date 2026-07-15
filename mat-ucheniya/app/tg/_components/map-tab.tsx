'use client'

import { useCallback, useEffect, useState } from 'react'
import { moveMapToken } from '@/app/actions/maps'
import { MapCanvas } from '@/components/map-workbench'
import { getCampaignMapData } from '@/lib/queries/maps'
import type { MapTokenView, MapView } from '@/lib/maps'
import { Centered } from './primitives'
import type { TgTabProps } from './shell'

/**
 * Mobile map tab. It shares the same RLS-scoped read model and interactive
 * canvas as desktop, so a token means the same thing on both surfaces.
 */
export function MapTab({ app }: TgTabProps) {
  const [maps, setMaps] = useState<MapView[]>([])
  const [activeId, setActiveId] = useState('')
  const [tokens, setTokens] = useState<MapTokenView[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setMessage(null)
    try {
      const data = await getCampaignMapData(app.supabase, app.campaignId)
      setMaps(data.maps)
      const next = data.maps.find((map) => map.id === activeId) ?? data.maps[0]
      setActiveId(next?.id ?? '')
      setTokens(next?.tokens ?? [])
      setStatus('ready')
    } catch (error) {
      console.error('[map] load failed', error)
      setStatus('error')
      setMessage('Не удалось загрузить карту. Проверьте соединение и повторите.')
    }
  }, [activeId, app.campaignId, app.supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const active = maps.find((map) => map.id === activeId) ?? maps[0]

  function selectMap(map: MapView) {
    setActiveId(map.id)
    setTokens(map.tokens)
    setMessage(null)
  }

  function moveOptimistically(tokenId: string, x: number, y: number) {
    setTokens((current) => current.map((token) => token.id === tokenId ? { ...token, x, y } : token))
    void moveMapToken(app.campaignId, tokenId, x, y)
      .then((result) => {
        if (result.error) {
          setMessage(`${result.error} Положение возвращено к сохранённому.`)
          void load()
        }
      })
      .catch(() => {
        setMessage('Сеть не ответила. Положение возвращено к сохранённому.')
        void load()
      })
  }

  if (status === 'loading') return <Centered>Загружаем карту…</Centered>
  if (status === 'error') return <Centered><div className="space-y-3 text-center"><p>{message}</p><button type="button" onClick={() => void load()} className="rounded-lg bg-neutral-800 px-3 py-2 text-sm">Повторить</button></div></Centered>
  if (!active) return <Centered><div className="space-y-2 text-center"><p className="text-2xl">🗺️</p><p>Ведущий ещё не добавил карту.</p><p className="text-xs text-neutral-500">Карта появится здесь автоматически.</p></div></Centered>

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div><h1 className="text-lg font-semibold">Карта</h1><p className="text-xs text-neutral-500">Перетаскивайте токены пальцем.</p></div>
        <button type="button" onClick={() => void load()} className="min-h-[40px] rounded-lg px-3 text-sm text-neutral-300 hover:bg-neutral-900">Обновить</button>
      </div>
      {maps.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">{maps.map((map) => <button key={map.id} type="button" onClick={() => selectMap(map)} className={`min-h-[36px] shrink-0 rounded-full px-3 text-sm ${map.id === active.id ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-300'}`}>{map.title}</button>)}</div>}
      {message && <p role="alert" className="rounded-lg border border-amber-800 bg-amber-950 px-3 py-2 text-sm text-amber-100">{message}</p>}
      <MapCanvas key={active.id} map={active} tokens={tokens} onMove={moveOptimistically} />
    </section>
  )
}
