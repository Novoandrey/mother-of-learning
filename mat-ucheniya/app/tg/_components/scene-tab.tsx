'use client'

import { useCallback, useEffect, useState } from 'react'
import { createInitialSceneRoom, sendSceneMessage } from '@/app/actions/scene'
import { getActiveSceneRoomTg, getSceneBackgroundAssetsTg, type ActiveSceneRoom, type SceneBackgroundAsset } from '@/lib/queries/scene-tg'
import { Centered, FIELD } from './primitives'
import { useTgRefresh, type TgTabProps } from './shell'

type SpeakerChoice = 'character' | 'dm'

/** First functional scene screen: intentionally ordinary controls before VN skin. */
export function SceneTab({ app }: TgTabProps) {
  const { supabase, campaignId } = app
  const { refreshKey } = useTgRefresh()
  const [room, setRoom] = useState<ActiveSceneRoom | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [backgrounds, setBackgrounds] = useState<SceneBackgroundAsset[]>([])
  const [title, setTitle] = useState('Общая сцена')
  const [backgroundAssetId, setBackgroundAssetId] = useState('')
  const [crop, setCrop] = useState({ x: 50, y: 50, zoom: 1 })

  const load = useCallback(async () => {
    try {
      setError(null)
      setRoom(await getActiveSceneRoomTg(supabase, campaignId))
    } catch {
      setError('Не удалось загрузить комнату.')
    }
  }, [supabase, campaignId])

  useEffect(() => {
    let alive = true
    void getActiveSceneRoomTg(supabase, campaignId)
      .then((nextRoom) => {
        if (!alive) return
        setError(null)
        setRoom(nextRoom)
      })
      .catch(() => {
        if (alive) setError('Не удалось загрузить комнату.')
      })
    return () => { alive = false }
  }, [supabase, campaignId, refreshKey])

  useEffect(() => {
    void getSceneBackgroundAssetsTg(supabase, campaignId).then(setBackgrounds).catch(() => setBackgrounds([]))
  }, [supabase, campaignId])

  const create = async () => {
    setCreating(true)
    const result = await createInitialSceneRoom(campaignId, { title, backgroundAssetId: backgroundAssetId || null, crop })
    setCreating(false)
    if (!result.ok) { setError(result.error); return }
    await load()
  }

  if (room === undefined) return <Centered>Загружаю комнату…</Centered>
  if (error && !room) return <Centered>{error}</Centered>
  if (!room) {
    return (
      <section className="rounded-xl bg-neutral-900 p-4">
        <h1 className="text-lg font-semibold">Сцена</h1>
        <p className="mt-2 text-sm text-neutral-400">Задайте комнату и, по желанию, фон для мобильной сцены.</p>
        <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="scene-title">Название</label>
        <input id="scene-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} className={FIELD + ' mt-1'} />
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="scene-background">Фон</label>
        <select id="scene-background" value={backgroundAssetId} onChange={(event) => setBackgroundAssetId(event.target.value)} className={FIELD + ' mt-1'}>
          <option value="">Без фона</option>
          {backgrounds.map((asset) => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
        </select>
        {backgroundAssetId && <div className="mt-3 rounded-lg bg-neutral-800 p-3"><p className="text-xs text-neutral-400">Мобильная обрезка: прямоугольное окно поверх выбранного фона.</p><CropRange label="Горизонталь" value={crop.x} min={0} max={100} onChange={(x) => setCrop((current) => ({ ...current, x }))} /><CropRange label="Вертикаль" value={crop.y} min={0} max={100} onChange={(y) => setCrop((current) => ({ ...current, y }))} /><CropRange label="Масштаб" value={crop.zoom} min={1} max={3} step={0.1} onChange={(zoom) => setCrop((current) => ({ ...current, zoom }))} /></div>}
        <button onClick={() => void create()} disabled={creating} className="mt-4 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {creating ? 'Открываю…' : 'Открыть общую сцену'}
        </button>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </section>
    )
  }

  return <RoomDialogue room={room} campaignId={campaignId} onSent={load} />
}

function CropRange({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void }) {
  return <label className="mt-3 block text-sm text-neutral-300">{label}: {value}<input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-1 w-full" /></label>
}

function RoomDialogue({
  room,
  campaignId,
  onSent,
}: {
  room: ActiveSceneRoom
  campaignId: string
  onSent: () => Promise<void>
}) {
  const [speakerKind, setSpeakerKind] = useState<SpeakerChoice>('character')
  const [characterId, setCharacterId] = useState(room.speakers[0]?.characterId ?? '')
  const [messageKind, setMessageKind] = useState<'speech' | 'description'>('speech')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canDm = true

  // A just-created room can have no characters. Do not leave the user on an
  // invalid character choice; DMs may still write an environmental description.
  const characterAvailable = room.speakers.length > 0
  const effectiveKind: SpeakerChoice = !characterAvailable && canDm ? 'dm' : speakerKind

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const result = await sendSceneMessage({
      roomId: room.id,
      speakerKind: effectiveKind,
      characterId: effectiveKind === 'character' ? characterId : undefined,
      messageKind,
      body,
    })
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setBody('')
    await onSent()
  }

  return (
    <section>
      <header className="mb-4">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Комната</p>
        <h1 className="text-xl font-semibold">{room.title}</h1>
      </header>
      {room.backgroundAssetId && <RoomBackground campaignId={campaignId} assetId={room.backgroundAssetId} crop={room.backgroundMobileCrop} />}

      <ol className="space-y-3" aria-label="Диалог комнаты">
        {room.messages.length === 0 ? (
          <li className="rounded-xl bg-neutral-900 px-4 py-5 text-sm text-neutral-400">Диалог ещё не начат.</li>
        ) : room.messages.map((message) => (
          <li key={message.id} className="rounded-xl bg-neutral-900 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <strong className="text-sm">{message.speakerName}</strong>
              <time className="shrink-0 text-xs text-neutral-500">{new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</time>
            </div>
            <p className={message.messageKind === 'description' ? 'mt-1 whitespace-pre-wrap text-sm italic text-neutral-300' : 'mt-1 whitespace-pre-wrap text-sm text-neutral-100'}>{message.body}</p>
          </li>
        ))}
      </ol>

      <form onSubmit={(event) => void submit(event)} className="mt-4 rounded-xl bg-neutral-900 p-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="scene-speaker">Писать за</label>
        <select id="scene-speaker" value={effectiveKind === 'dm' ? 'dm' : characterId} onChange={(event) => {
          if (event.target.value === 'dm') setSpeakerKind('dm')
          else { setSpeakerKind('character'); setCharacterId(event.target.value) }
        }} className={FIELD + ' mt-1'} disabled={!characterAvailable && !canDm}>
          {characterAvailable && room.speakers.map((speaker) => <option key={speaker.characterId} value={speaker.characterId}>{speaker.title}</option>)}
          {canDm && <option value="dm">ДМ / окружение</option>}
        </select>
        {effectiveKind === 'dm' && (
          <label className="mt-3 block text-sm text-neutral-300"><input type="checkbox" checked={messageKind === 'description'} onChange={(event) => setMessageKind(event.target.checked ? 'description' : 'speech')} className="mr-2" />Описание окружения</label>
        )}
        <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-neutral-500" htmlFor="scene-body">Сообщение</label>
        <textarea id="scene-body" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={8000} rows={4} placeholder="Напишите реплику или описание…" className={FIELD + ' mt-1 resize-y'} />
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={busy || (!characterAvailable && !canDm)} className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Отправляю…' : 'Отправить'}</button>
      </form>
    </section>
  )
}

function RoomBackground({ campaignId, assetId, crop }: { campaignId: string; assetId: string; crop: { x: number; y: number; zoom: number } }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void fetch(`/api/media/renditions?campaignId=${encodeURIComponent(campaignId)}&rendition=scene&assetIds=${encodeURIComponent(assetId)}`)
      .then((response) => response.ok ? response.json() as Promise<{ items?: Array<{ status: string; url?: string }> }> : null)
      .then((data) => { if (alive) setUrl(data?.items?.[0]?.status === 'ready' ? data.items[0].url ?? null : null) })
      .catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [campaignId, assetId])
  if (!url) return null
  return <div className="mb-4 h-36 overflow-hidden rounded-xl bg-neutral-900"><img src={url} alt="Фон комнаты" className="h-full w-full object-cover" style={{ objectPosition: `${crop.x}% ${crop.y}%`, transform: `scale(${crop.zoom})` }} /></div>
}
