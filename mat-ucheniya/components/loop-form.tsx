'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Loop = {
  id?: string
  number?: number
  title?: string | null
  status?: string
  notes?: string | null
}

type Props = {
  campaignId: string
  campaignSlug: string
  loop?: Loop         // if editing existing
  nextNumber?: number // if creating new
}

export default function LoopForm({ campaignId, campaignSlug, loop, nextNumber }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const isEdit = !!loop?.id

  const [number, setNumber] = useState(String(loop?.number ?? nextNumber ?? 1))
  const [title, setTitle] = useState(loop?.title ?? '')
  const [status, setStatus] = useState(loop?.status ?? 'past')
  const [notes, setNotes] = useState(loop?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const payload = {
      campaign_id: campaignId,
      number: parseInt(number),
      title: title.trim() || null,
      status,
      notes: notes.trim() || null,
    }

    let err
    if (isEdit && loop?.id) {
      const { error: e } = await supabase.from('loops').update(payload).eq('id', loop.id)
      err = e
    } else {
      const { error: e } = await supabase.from('loops').insert(payload)
      err = e
    }

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    router.push(`/c/${campaignSlug}/loops?loop=${number}`)
    router.refresh()
  }

  async function handleDelete() {
    if (!loop?.id || !confirm('Удалить эту петлю? Сессии не удалятся.')) return
    await supabase.from('loops').delete().eq('id', loop.id)
    router.push(`/c/${campaignSlug}/loops`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Номер петли <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            required
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          >
            <option value="past">Прошедшая</option>
            <option value="current">Текущая</option>
            <option value="future">Будущая</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Название (необязательно)</label>
        <input
          type="text"
          placeholder='Например: "Петля пожара"'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>


      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Заметки ДМа</label>
        <textarea
          rows={6}
          placeholder="Что важного произошло в этой петле? Что узнали путешественники?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-y"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Сохраняю…' : isEdit ? 'Сохранить' : 'Создать петлю'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Отмена
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto text-sm text-red-500 hover:text-red-700"
          >
            Удалить петлю
          </button>
        )}
      </div>
    </form>
  )
}
