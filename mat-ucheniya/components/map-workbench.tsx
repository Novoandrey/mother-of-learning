'use client'

/* eslint-disable @next/next/no-img-element -- interactive canvas needs natural image dimensions and runtime-configured R2 URLs. */

import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { addMapToken, createMap, moveMapToken } from '@/app/actions/maps'
import { useToast } from '@/components/toast-provider'
import type { CharacterOption, MapTokenView, MapView } from '@/lib/maps'

export type { CharacterOption, MapTokenView, MapView } from '@/lib/maps'

type Props = {
  campaignId: string
  campaignSlug: string
  canManage: boolean
  maps: MapView[]
  characters: CharacterOption[]
}

function avatarStyle(crop: NonNullable<MapTokenView['portrait']>) {
  const zoom = crop.cropZoom
  return {
    width: `${zoom * 100}%`, height: `${zoom * 100}%`, maxWidth: 'none',
    left: `${50 - crop.cropX * zoom * 100}%`, top: `${50 - crop.cropY * zoom * 100}%`,
  }
}

export function MapWorkbench({ campaignId, campaignSlug, canManage, maps, characters }: Props) {
  const { toast } = useToast()
  const [activeId, setActiveId] = useState(maps[0]?.id ?? '')
  const [localTokens, setLocalTokens] = useState<Record<string, MapTokenView[]>>(
    () => Object.fromEntries(maps.map((map) => [map.id, map.tokens])),
  )
  const [showUpload, setShowUpload] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const active = maps.find((m) => m.id === activeId) ?? maps[0]
  const tokens = active ? (localTokens[active.id] ?? active.tokens) : []

  async function uploadMap(form: FormData) {
    const title = String(form.get('title') ?? '').trim()
    const file = form.get('file')
    if (!title || !(file instanceof File) || file.size === 0) { setMessage('Укажите название и файл карты.'); return }
    setBusy(true); setMessage(null)
    const upload = new FormData(); upload.set('campaignId', campaignId); upload.set('file', file)
    try {
      const response = await fetch('/api/maps/upload', { method: 'POST', body: upload })
      const payload = await response.json().catch(() => ({})) as { key?: string; error?: string }
      if (!response.ok || !payload.key) { setMessage(payload.error ?? 'Не удалось загрузить карту.'); return }
      const result = await createMap(campaignId, campaignSlug, title, payload.key)
      if (result.error) setMessage(result.error)
      else { toast('Карта добавлена.', { variant: 'success' }); window.location.reload() }
    } catch { setMessage('Ошибка сети при загрузке карты.') } finally { setBusy(false) }
  }

  async function addToken(characterId: string) {
    if (!active) return
    const result = await addMapToken(campaignId, campaignSlug, active.id, characterId)
    if (result.error) setMessage(result.error)
    else { toast('Токен добавлен на карту.', { variant: 'success' }); window.location.reload() }
  }

  function moveOptimistically(tokenId: string, x: number, y: number) {
    if (!active) return
    setLocalTokens((all) => ({ ...all, [active.id]: (all[active.id] ?? tokens).map((t) => t.id === tokenId ? { ...t, x, y } : t) }))
    void moveMapToken(campaignId, tokenId, x, y)
      .then((result) => {
        if (result.error) {
          setMessage(result.error)
          toast('Положение токена не сохранено. Карта обновлена.', { variant: 'error' })
          window.location.reload()
        }
      })
      .catch(() => {
        setMessage('Сеть не ответила. Положение токена не сохранено.')
        toast('Сеть не ответила. Положение токена не сохранено.', { variant: 'error' })
        window.location.reload()
      })
  }

  if (maps.length === 0) return (
    <section className="mx-auto max-w-xl rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
      <div className="text-4xl">🗺️</div><h1 className="mt-3 text-xl font-semibold">Карты локаций</h1>
      <p className="mt-2 text-sm text-gray-500">Здесь будет свободная карта с круглыми токенами персонажей — без клеток и гексов.</p>
      {canManage ? <button onClick={() => setShowUpload(true)} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">Загрузить первую карту</button> : <p className="mt-5 text-sm text-gray-400">Ведущий ещё не добавил карту.</p>}
      {showUpload && <UploadDialog onClose={() => setShowUpload(false)} onSubmit={uploadMap} busy={busy} message={message} />}
    </section>
  )

  return <div className="mx-auto max-w-6xl space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-xl font-semibold text-gray-900">Карты</h1>
      {maps.map((map) => <button key={map.id} onClick={() => setActiveId(map.id)} className={`rounded-full px-3 py-1.5 text-sm ${map.id === active?.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'}`}>{map.title}</button>)}
      {canManage && <button onClick={() => setShowUpload(true)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700">+ Карта</button>}
    </div>
    {message && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}
    {active && <MapCanvas key={active.id} map={active} tokens={tokens} onMove={moveOptimistically} />}
    {canManage && active && <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-800">Токены игроков</h2>
      <p className="mt-1 text-xs text-gray-500">Добавьте персонажа, затем перетащите токен на нужное место. Касание на телефоне работает так же.</p>
      <div className="mt-3 flex flex-wrap gap-2">{characters.filter((c) => !tokens.some((t) => t.characterNodeId === c.id)).map((c) => <button key={c.id} onClick={() => void addToken(c.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:border-blue-400">+ {c.title}</button>)}
      {characters.length === 0 && <span className="text-sm text-gray-400">В кампании пока нет персонажей игроков.</span>}</div>
    </section>}
    {tokens.some((t) => t.portrait) && <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">Кадрирование портрета меняется в карточке персонажа; на карте всегда используется сохранённый круглый кадр.</p>}
    {showUpload && <UploadDialog onClose={() => setShowUpload(false)} onSubmit={uploadMap} busy={busy} message={message} />}
  </div>
}

export function MapCanvas({ map, tokens, onMove }: { map: MapView; tokens: MapTokenView[]; onMove: (id: string, x: number, y: number) => void }) {
  const fullscreenHost = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string } | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [ratio, setRatio] = useState<number | null>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    const sync = () => {
      setIsFullscreen(document.fullscreenElement === fullscreenHost.current)
      setViewport({ width: window.innerWidth, height: window.innerHeight })
    }
    document.addEventListener('fullscreenchange', sync)
    window.addEventListener('resize', sync)
    sync()
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await fullscreenHost.current?.requestFullscreen()
    } catch {
      // Embedded browsers may deny the API; the map remains usable in-place.
    }
  }

  function position(event: PointerEvent) {
    const r = surface.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (event.clientY - r.top) / r.height)) }
  }
  function down(event: PointerEvent, id: string) { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id }; event.preventDefault() }
  function up(event: PointerEvent) { if (!drag.current) return; const p = position(event); onMove(drag.current.id, p.x, p.y); drag.current = null }
  const mapAreaStyle = isFullscreen && ratio
    ? { width: Math.min(viewport.width, viewport.height * ratio), aspectRatio: String(ratio) }
    : ratio ? { aspectRatio: String(ratio) } : undefined
  return <div ref={fullscreenHost} className={`relative isolate overflow-hidden bg-slate-800 shadow-sm ${isFullscreen ? 'flex h-dvh w-dvw items-center justify-center bg-black' : 'min-h-[360px] rounded-xl'}`}>
    <div ref={surface} onPointerUp={up} onPointerCancel={() => { drag.current = null }} style={mapAreaStyle} className={`relative touch-none ${isFullscreen ? 'max-h-dvh' : 'min-h-[360px] w-full'}`}>
    {map.imageUrl && !imageFailed ? <img src={map.imageUrl} alt={`Карта: ${map.title}`} onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} onError={() => setImageFailed(true)} className={ratio ? 'absolute inset-0 h-full w-full object-fill' : 'block h-auto min-h-[360px] w-full'} draggable={false} /> : <div role="alert" className="grid min-h-[360px] place-items-center px-6 text-center text-sm text-slate-300">Изображение карты недоступно. Проверьте публичный URL хранилища или загрузите карту заново.</div>}
    {tokens.map((token) => <button key={token.id} type="button" onPointerDown={(e) => down(e, token.id)} style={{ left: `${token.x * 100}%`, top: `${token.y * 100}%` }} className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-white bg-slate-600 shadow-lg ring-2 ring-black/30 active:scale-110" title={token.title} aria-label={`Передвинуть ${token.title}`}>
      {token.portrait?.url ? <span className="absolute inset-0 overflow-hidden rounded-full"><img src={token.portrait.url} alt="" draggable={false} className="absolute max-w-none" style={avatarStyle(token.portrait)} /></span> : <span className="text-lg text-white">{token.title.slice(0, 1).toUpperCase()}</span>}
      <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-black/65 px-1.5 py-0.5 text-[10px] text-white">{token.title}</span>
    </button>)}</div>
    <button type="button" onClick={() => void toggleFullscreen()} className="absolute right-3 top-3 z-10 rounded-lg bg-black/60 px-3 py-2 text-sm font-medium text-white shadow hover:bg-black/80" aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Развернуть карту'}>{isFullscreen ? '⤢ Свернуть' : '⛶ На весь экран'}</button>
  </div>
}

function UploadDialog({ onClose, onSubmit, busy, message }: { onClose: () => void; onSubmit: (form: FormData) => Promise<void>; busy: boolean; message: string | null }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"><form action={onSubmit} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"><h2 className="text-lg font-semibold">Новая карта</h2><p className="mt-1 text-sm text-gray-500">PNG, JPEG или WebP до 12 МБ.</p><label className="mt-4 block text-sm font-medium">Название<input name="title" required maxLength={120} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" /></label><label className="mt-3 block text-sm font-medium">Изображение<input name="file" type="file" accept="image/png,image/jpeg,image/webp" required className="mt-1 block w-full text-sm" /></label>{message && <p className="mt-3 text-sm text-red-600">{message}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-sm">Отмена</button><button disabled={busy} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Загрузка…' : 'Загрузить'}</button></div></form></div>
}
