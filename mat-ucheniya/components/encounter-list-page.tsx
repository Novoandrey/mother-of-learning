'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createEncounter } from '@/lib/encounter-actions'

type EncounterItem = {
  id: string
  title: string
  status: 'active' | 'completed'
  current_round: number
  participant_count: number
}

type Props = {
  encounters: EncounterItem[]
  campaignId: string
  campaignSlug: string
}

export function EncounterListPage({ encounters, campaignId, campaignSlug }: Props) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    if (!title.trim()) return
    setCreating(true)
    try {
      const enc = await createEncounter(campaignId, title.trim())
      router.push(`/c/${campaignSlug}/encounters/${enc.id}`)
    } catch (e) {
      console.error(e)
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Энкаунтеры</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Создать
        </button>
      </div>

      {showCreate && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Название энкаунтера..."
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleCreate}
              disabled={creating || !title.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {creating ? '...' : 'Создать'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setTitle('') }}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {encounters.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
          <p className="text-gray-500">Нет энкаунтеров</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Создать первый
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {encounters.map((enc) => (
            <Link
              key={enc.id}
              href={`/c/${campaignSlug}/encounters/${enc.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-gray-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-gray-900">{enc.title}</span>
                  <span className="text-sm text-gray-400">
                    {enc.participant_count} участников
                  </span>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    enc.status === 'active'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {enc.status === 'active' ? 'Активен' : 'Завершён'}
                </span>
              </div>
              {enc.current_round > 0 && enc.status === 'active' && (
                <p className="mt-1 text-sm text-gray-400">Раунд {enc.current_round}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
