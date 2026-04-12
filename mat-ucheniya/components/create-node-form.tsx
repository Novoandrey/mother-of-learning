'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

type NodeType = { id: string; slug: string; label: string; icon: string | null; default_fields: Record<string, string> }

export function CreateNodeForm({ campaignId, campaignSlug }: { campaignId: string; campaignSlug: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [types, setTypes] = useState<NodeType[]>([])
  const [selectedType, setSelectedType] = useState<NodeType | null>(null)
  const [title, setTitle] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('node_types')
      .select('id, slug, label, icon, default_fields')
      .eq('campaign_id', campaignId)
      .order('sort_order')
      .then(({ data }) => {
        if (data) setTypes(data as NodeType[])
      })
  }, [campaignId, supabase])

  function selectType(t: NodeType) {
    setSelectedType(t)
    const defaults: Record<string, string> = {}
    if (t.default_fields) {
      Object.keys(t.default_fields).forEach((k) => { if (k !== 'tags') defaults[k] = '' })
    }
    setFields(defaults)
  }

  async function handleSubmit() {
    if (!title.trim() || !selectedType) return
    setSaving(true)
    setError('')

    const cleanFields: Record<string, unknown> = {}
    Object.entries(fields).forEach(([k, v]) => { if (v.trim()) cleanFields[k] = v.trim() })

    const { data, error: err } = await supabase
      .from('nodes')
      .insert({ campaign_id: campaignId, type_id: selectedType.id, title: title.trim(), fields: cleanFields })
      .select('id')
      .single()

    if (err || !data) {
      setError(err?.message || 'Ошибка сохранения')
      setSaving(false)
      return
    }
    router.push(`/c/${campaignSlug}/catalog/${data.id}`)
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {!selectedType ? (
        <div>
          <h2 className="mb-3 text-lg font-semibold">Выберите тип</h2>
          <div className="grid grid-cols-2 gap-2">
            {types.map((t) => (
              <button
                key={t.id}
                onClick={() => selectType(t)}
                className="rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-gray-400"
              >
                <span className="mr-2">{t.icon}</span>
                <span className="font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button onClick={() => setSelectedType(null)} className="text-sm text-gray-400 hover:text-gray-600">
              ← назад
            </button>
            <span className="text-sm text-gray-500">
              {selectedType.icon} {selectedType.label}
            </span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Название *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Имя персонажа, название локации..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {Object.entries(fields).map(([key, value]) => (
            <div key={key}>
              <label className="mb-1 block text-sm font-medium text-gray-700">{key}</label>
              {key === 'description' ? (
                <textarea
                  value={value}
                  onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setFields({ ...fields, [key]: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
            </div>
          ))}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Сохраняю...' : 'Создать'}
          </button>
        </div>
      )}
    </div>
  )
}
