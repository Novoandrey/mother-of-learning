'use client'

import { useState } from 'react'
import { saveAsTemplate } from '@/lib/template-actions'

type Participant = {
  id: string
  display_name: string
  max_hp: number
  role: string
  sort_order: number
  node_id: string | null
}

type Props = {
  campaignId: string
  participants: Participant[]
  onSaved?: () => void
}

export function SaveAsTemplateButton({ campaignId, participants, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    try {
      await saveAsTemplate(campaignId, title.trim(), participants)
      setSaved(true)
      setTitle('')
      setTimeout(() => {
        setOpen(false)
        setSaved(false)
        onSaved?.()
      }, 1200)
    } catch (e) {
      console.error(e)
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
        title="Сохранить состав участников как шаблон"
      >
        <span>💾</span>
        <span>Сохранить шаблон</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
      {saved ? (
        <span className="text-sm text-green-700 font-medium">✓ Шаблон сохранён</span>
      ) : (
        <>
          <input
            autoFocus
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            placeholder="Название шаблона..."
            className="w-48 rounded border border-blue-200 bg-white px-2 py-1 text-sm focus:border-blue-400 focus:outline-none"
          />
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? '...' : 'Сохранить'}
          </button>
          <button
            onClick={() => { setOpen(false); setTitle('') }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </>
      )}
    </div>
  )
}
