'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createEncounter } from '@/lib/encounter-actions'
import { listTemplates, createEncounterFromTemplate, deleteTemplate, EncounterTemplate } from '@/lib/template-actions'

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
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EncounterTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!showCreate) return
    setLoadingTemplates(true)
    listTemplates(campaignId)
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoadingTemplates(false))
  }, [showCreate, campaignId])

  async function handleCreate() {
    if (!title.trim()) return
    setCreating(true)
    try {
      let enc: { id: string }
      if (selectedTemplateId) {
        enc = await createEncounterFromTemplate(campaignId, title.trim(), selectedTemplateId)
      } else {
        enc = await createEncounter(campaignId, title.trim())
      }
      router.push(`/c/${campaignSlug}/encounters/${enc.id}`)
    } catch (e) {
      console.error(e)
      setCreating(false)
    }
  }

  async function handleDeleteTemplate(e: React.MouseEvent, templateId: string) {
    e.stopPropagation()
    if (!confirm('Удалить шаблон?')) return
    setDeletingId(templateId)
    try {
      await deleteTemplate(templateId)
      setTemplates((prev) => prev.filter((t) => t.id !== templateId))
      if (selectedTemplateId === templateId) setSelectedTemplateId(null)
    } catch (e) {
      console.error(e)
    } finally {
      setDeletingId(null)
    }
  }

  function handleCancel() {
    setShowCreate(false)
    setTitle('')
    setSelectedTemplateId(null)
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
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
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
              {creating ? '...' : selectedTemplateId ? 'Создать из шаблона' : 'Создать'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Отмена
            </button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
              Шаблон (необязательно)
            </p>
            {loadingTemplates ? (
              <p className="text-sm text-gray-400">Загрузка шаблонов...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-400 italic">
                Шаблонов пока нет — сохрани состав участников во время боя
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {templates.map((t) => {
                  const isSelected = selectedTemplateId === t.id
                  const count = t.encounter_template_participants?.length ?? 0
                  return (
                    <div
                      key={t.id}
                      className={`group flex items-center gap-1.5 rounded-lg border px-3 py-1.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100'
                      }`}
                      onClick={() => setSelectedTemplateId(isSelected ? null : t.id)}
                    >
                      <span className="text-sm font-medium">{t.title}</span>
                      <span className="text-xs text-gray-400">{count} уч.</span>
                      <button
                        onClick={(e) => handleDeleteTemplate(e, t.id)}
                        disabled={deletingId === t.id}
                        className="ml-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity text-xs leading-none"
                        title="Удалить шаблон"
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {selectedTemplateId && (() => {
            const t = templates.find((t) => t.id === selectedTemplateId)
            if (!t || !t.encounter_template_participants?.length) return null
            return (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                <p className="text-xs font-medium text-blue-600 mb-1">Состав: {t.title}</p>
                <p className="text-xs text-blue-700">
                  {t.encounter_template_participants.map((p) => p.display_name).join(', ')}
                </p>
              </div>
            )
          })()}
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
