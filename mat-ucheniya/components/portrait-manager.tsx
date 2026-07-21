'use client'

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { addPortrait, deletePortrait, savePortraitCrop, setPrimaryPortrait } from '@/app/actions/portraits'
import { PortraitCropEditor } from '@/components/portrait-crop-editor'
import { portraitUrl, type Portrait } from '@/lib/portraits'
import { MediaAssetPicker } from './media-asset-picker'

type Props = {
  campaignId: string
  campaignSlug: string
  nodeId: string
  portraits: Portrait[]
}

export function PortraitManager({ campaignId, campaignSlug, nodeId, portraits }: Props) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState(portraits[0]?.id ?? '')
  const selected = portraits.find((p) => p.id === selectedId) ?? portraits[0]
  const [crop, setCrop] = useState<Portrait | null>(selected ?? null)

  async function upload(form: FormData) {
    const file = form.get('file')
    if (!(file instanceof File) || !file.size) return
    setUploading(true); setError(null)
    try {
      const body = new FormData(); body.set('campaignId', campaignId); body.set('file', file)
      const response = await fetch('/api/media/upload', { method: 'POST', body })
      const payload = await response.json() as { asset?: { id?: string }; error?: string }
      if (!response.ok || !payload.asset?.id) { setError(payload.error ?? 'Не удалось загрузить портрет.'); return }
      const result = await addPortrait(campaignId, campaignSlug, nodeId, payload.asset.id)
      if (result.error) setError(result.error); else window.location.reload()
    } catch { setError('Ошибка сети при загрузке портрета.') } finally { setUploading(false) }
  }

  async function run(action: () => Promise<{ ok?: boolean; error?: string }>) {
    setError(null)
    const result = await action()
    if (result.error) setError(result.error); else window.location.reload()
    return result
  }

  return <section className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Портреты</h2><p className="mt-1 text-xs text-gray-500">Первый загруженный портрет становится основным. Круглый кадр используется для токена карты.</p></div>
      <div className="flex flex-wrap gap-2"><MediaAssetPicker campaignId={campaignId} assignedAssetIds={portraits.flatMap((portrait) => portrait.media_asset_id ? [portrait.media_asset_id] : [])} onSelect={(assetId) => run(() => addPortrait(campaignId, campaignSlug, nodeId, assetId))} /><form action={upload}><label className="cursor-pointer rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"><input name="file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { if (e.target.files?.[0]) e.currentTarget.form?.requestSubmit() }} />{uploading ? 'Загрузка…' : '+ Загрузить'}</label></form></div>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    {portraits.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr]">
      <div className="flex gap-2 overflow-x-auto sm:flex-col">{portraits.map((p) => <button key={p.id} type="button" onClick={() => { setSelectedId(p.id); setCrop(p) }} className={`relative h-20 w-20 flex-none overflow-hidden rounded-lg border-2 ${p.id === selected?.id ? 'border-blue-500' : 'border-transparent'}`} aria-label="Выбрать портрет">{portraitUrl(p.r2_key) && <img src={portraitUrl(p.r2_key)!} alt="" className="h-full w-full object-cover" />}{p.is_primary && <span className="absolute bottom-0 left-0 right-0 bg-black/60 py-0.5 text-[10px] text-white">Основной</span>}</button>)}</div>
      {selected && crop && <div className="space-y-3"><PortraitCropEditor portrait={selected} crop={crop} onChange={(next) => setCrop({ ...selected, ...next })} /><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void run(() => savePortraitCrop(campaignId, campaignSlug, nodeId, selected.id, crop.crop_x, crop.crop_y, crop.crop_zoom))} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm text-blue-700">Сохранить кадр</button>{!selected.is_primary && <button type="button" onClick={() => void run(() => setPrimaryPortrait(campaignId, campaignSlug, nodeId, selected.id))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">Сделать основным</button>}<button type="button" onClick={() => { if (confirm('Удалить этот портрет?')) void run(() => deletePortrait(campaignId, campaignSlug, nodeId, selected.id)) }} className="rounded-lg border border-red-100 px-3 py-1.5 text-sm text-red-600">Удалить</button></div></div>}
    </div>}
  </section>
}
