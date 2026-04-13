'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Session = {
  id?: string
  session_number?: number
  loop_number?: number | null
  title?: string | null
  recap?: string
  dm_notes?: string
  played_at?: string | null
}

type Loop = { number: number; title: string | null; status: string }

type Props = {
  campaignId: string
  campaignSlug: string
  session?: Session
  loops?: Loop[]
  defaultLoopNumber?: number
  nextSessionNumber?: number
}

export default function SessionForm({
  campaignId,
  campaignSlug,
  session,
  loops,
  defaultLoopNumber,
  nextSessionNumber,
}: Props) {
  const router = useRouter()
  const supabase = createClient()
  const isEdit = !!session?.id

  const [sessionNumber, setSessionNumber] = useState(
    String(session?.session_number ?? nextSessionNumber ?? 1)
  )
  const [loopNumber, setLoopNumber] = useState(
    String(session?.loop_number ?? defaultLoopNumber ?? '')
  )
  const [title, setTitle] = useState(session?.title ?? '')
  const [recap, setRecap] = useState(session?.recap ?? '')
  const [dmNotes, setDmNotes] = useState(session?.dm_notes ?? '')
  const [playedAt, setPlayedAt] = useState(session?.played_at ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const payload = {
      campaign_id: campaignId,
      session_number: parseInt(sessionNumber),
      loop_number: loopNumber ? parseInt(loopNumber) : null,
      title: title.trim() || null,
      recap: recap.trim(),
      dm_notes: dmNotes.trim(),
      played_at: playedAt || null,
    }

    let id: string | undefined = session?.id
    let err

    if (isEdit && session?.id) {
      const { error: e } = await supabase.from('sessions').update(payload).eq('id', session.id)
      err = e
    } else {
      const { data, error: e } = await supabase.from('sessions').insert(payload).select('id').single()
      err = e
      id = data?.id
    }

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }

    router.push(`/c/${campaignSlug}/sessions/${id}`)
    router.refresh()
  }

  async function handleDelete() {
    if (!session?.id || !confirm('Удалить эту сессию?')) return
    await supabase.from('sessions').delete().eq('id', session.id)
    router.push(`/c/${campaignSlug}/sessions`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Top row: session number + loop + date */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            № сессии <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min={1}
            required
            value={sessionNumber}
            onChange={(e) => setSessionNumber(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Петля</label>
          <select
            value={loopNumber}
            onChange={(e) => setLoopNumber(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          >
            <option value="">— без петли —</option>
            {loops?.map((l) => (
              <option key={l.number} value={l.number}>
                Петля {l.number}{l.title ? ` — ${l.title}` : ''}
                {l.status === 'current' ? ' ✦' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Дата игры</label>
          <input
            type="date"
            value={playedAt}
            onChange={(e) => setPlayedAt(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Название (необязательно)</label>
        <input
          type="text"
          placeholder='Например: "Бой в Гадком Койоте"'
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Рекап сессии
          <span className="ml-1 text-xs font-normal text-gray-400">(виден игрокам)</span>
        </label>
        <textarea
          rows={10}
          placeholder="Что произошло на этой сессии? Кратко или подробно — как удобно."
          value={recap}
          onChange={(e) => setRecap(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-y font-mono"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Заметки ДМа
          <span className="ml-1 text-xs font-normal text-gray-400">(только для ДМа)</span>
        </label>
        <textarea
          rows={5}
          placeholder="Что важно помнить? Крючки на следующую сессию, скрытые мотивы НПС…"
          value={dmNotes}
          onChange={(e) => setDmNotes(e.target.value)}
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
          {saving ? 'Сохраняю…' : isEdit ? 'Сохранить' : 'Создать сессию'}
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
            Удалить сессию
          </button>
        )}
      </div>
    </form>
  )
}
