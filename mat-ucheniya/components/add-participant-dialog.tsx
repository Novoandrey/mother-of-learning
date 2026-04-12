'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  campaignId: string
  onAddFromCatalog: (nodeId: string, displayName: string, maxHp: number, quantity: number) => void
  onAddManual: (displayName: string, maxHp: number) => void
  onClose: () => void
}

type NodeResult = {
  id: string
  title: string
  fields: Record<string, unknown>
  type: { slug: string } | null
}

export function AddParticipantDialog({ campaignId, onAddFromCatalog, onAddManual, onClose }: Props) {
  const [tab, setTab] = useState<'catalog' | 'manual'>('catalog')

  // Catalog state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NodeResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<NodeResult | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [catalogHp, setCatalogHp] = useState(0)

  // Manual state
  const [manualName, setManualName] = useState('')
  const [manualHp, setManualHp] = useState(0)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }

    const timeout = setTimeout(async () => {
      setSearching(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('nodes')
        .select('id, title, fields, type:node_types(slug)')
        .eq('campaign_id', campaignId)
        .ilike('title', `%${query}%`)
        .limit(10)
      setResults((data as any[]) || [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [query, campaignId])

  function handleSelectNode(node: NodeResult) {
    setSelected(node)
    const hp = parseInt(String(node.fields?.max_hp ?? node.fields?.hp ?? '0'))
    setCatalogHp(isNaN(hp) ? 0 : hp)
    setQuantity(1)
  }

  function handleAddFromCatalog() {
    if (!selected) return
    onAddFromCatalog(selected.id, selected.title, catalogHp, quantity)
    setSelected(null)
    setQuery('')
    setResults([])
  }

  function handleAddManual() {
    if (!manualName.trim()) return
    onAddManual(manualName.trim(), manualHp)
    setManualName('')
    setManualHp(0)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-gray-200 bg-white shadow-xl">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setTab('catalog')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'catalog' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Из каталога
          </button>
          <button
            onClick={() => setTab('manual')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Вручную
          </button>
        </div>

        <div className="p-4">
          {tab === 'catalog' ? (
            <div className="space-y-3">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSelected(null) }}
                placeholder="Поиск по имени..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />

              {!selected && results.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-200">
                  {results.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => handleSelectNode(node)}
                      className="w-full border-b border-gray-100 px-3 py-2 text-left last:border-b-0 hover:bg-gray-50"
                    >
                      <span className="text-sm font-medium">{node.title}</span>
                      {node.type && <span className="ml-2 text-xs text-gray-400">{node.type.slug}</span>}
                    </button>
                  ))}
                </div>
              )}

              {searching && <p className="text-sm text-gray-400">Поиск...</p>}

              {selected && (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{selected.title}</span>
                    <button onClick={() => setSelected(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  <div className="flex gap-3">
                    <label className="flex-1">
                      <span className="text-xs text-gray-500">Макс. ХП</span>
                      <input
                        type="number"
                        value={catalogHp}
                        onChange={(e) => setCatalogHp(parseInt(e.target.value) || 0)}
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                      />
                    </label>
                    <label className="w-24">
                      <span className="text-xs text-gray-500">Кол-во</span>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="mt-0.5 w-full rounded border border-gray-200 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
                      />
                    </label>
                  </div>
                  <button
                    onClick={handleAddFromCatalog}
                    className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    Добавить{quantity > 1 ? ` ×${quantity}` : ''}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label>
                <span className="text-xs text-gray-500">Имя</span>
                <input
                  autoFocus
                  type="text"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                  placeholder="Тролль, Паук-воитель..."
                  className="mt-0.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </label>
              <label>
                <span className="text-xs text-gray-500">Макс. ХП</span>
                <input
                  type="number"
                  value={manualHp}
                  onChange={(e) => setManualHp(parseInt(e.target.value) || 0)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddManual()}
                  className="mt-0.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </label>
              <button
                onClick={handleAddManual}
                disabled={!manualName.trim()}
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Добавить
              </button>
            </div>
          )}
        </div>

        <div className="px-4 pb-4">
          <button onClick={onClose} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
