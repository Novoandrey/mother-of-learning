'use client'

import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type EdgeType = { id: string; slug: string; label: string }
type SearchResult = { id: string; title: string }

export function CreateEdgeForm({
  sourceId, campaignId, campaignSlug, onDone,
}: {
  sourceId: string; campaignId: string; campaignSlug: string; onDone: () => void
}) {
  const supabase = createClient()
  const router = useRouter()
  const [edgeTypes, setEdgeTypes] = useState<EdgeType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [targetId, setTargetId] = useState('')
  const [targetTitle, setTargetTitle] = useState('')
  const [label, setLabel] = useState('')
  const [direction, setDirection] = useState<'outgoing' | 'incoming'>('outgoing')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase
      .from('edge_types')
      .select('id, slug, label')
      .or(`is_base.eq.true,campaign_id.eq.${campaignId}`)
      .then(({ data }) => {
        if (data) {
          setEdgeTypes(data)
          if (data.length > 0) setSelectedTypeId(data[0].id)
        }
      })
  }, [campaignId, supabase])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return }
    const { data } = await supabase
      .from('nodes')
      .select('id, title')
      .eq('campaign_id', campaignId)
      .neq('id', sourceId)
      .ilike('title', `%${q}%`)
      .limit(5)

    if (data) setResults(data)
  }, [campaignId, sourceId, supabase])

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300)
    return () => clearTimeout(timer)
  }, [query, search])

  function selectTarget(node: SearchResult) {
    setTargetId(node.id)
    setTargetTitle(node.title)
    setQuery('')
    setResults([])
  }

  async function handleSubmit() {
    if (!selectedTypeId || !targetId) return
    setSaving(true)
    // For incoming: flip source/target so the other node points TO this node
    const finalSourceId = direction === 'outgoing' ? sourceId : targetId
    const finalTargetId = direction === 'outgoing' ? targetId : sourceId
    const { error } = await supabase.from('edges').insert({
      campaign_id: campaignId,
      source_id: finalSourceId,
      target_id: finalTargetId,
      type_id: selectedTypeId,
      label: label.trim() || null,
    })
    setSaving(false)
    if (error) {
      console.error('Failed to create edge:', error)
      const isPerms = /row-level security|permission denied|42501/i.test(
        error.message ?? '',
      )
      alert(
        isPerms
          ? 'Нет прав на создание этой связи.'
          : `Не удалось создать связь: ${error.message}`,
      )
      return
    }
    onDone()
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {/* Direction toggle */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Направление</label>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            onClick={() => setDirection('outgoing')}
            className={`flex-1 px-3 py-1.5 transition-colors ${direction === 'outgoing' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Исходящая →
          </button>
          <button
            onClick={() => setDirection('incoming')}
            className={`flex-1 px-3 py-1.5 transition-colors ${direction === 'incoming' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            ← Входящая
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Тип связи</label>
        <select
          value={selectedTypeId}
          onChange={(e) => setSelectedTypeId(e.target.value)}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        >
          {edgeTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">
          {direction === 'outgoing' ? 'Цель' : 'Источник'}
        </label>
        {targetId ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{targetTitle}</span>
            <button onClick={() => { setTargetId(''); setTargetTitle('') }} className="text-xs text-red-500 hover:underline">
              убрать
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск сущности..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            {results.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-sm">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => selectTarget(r)}
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                  >
                    {r.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Подпись (необязательно)</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="подруга, создатель, староста..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={saving || !targetId || !selectedTypeId}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Сохраняю...' : 'Добавить'}
      </button>
    </div>
  )
}
