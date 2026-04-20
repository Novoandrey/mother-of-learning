'use client'

import { EdgeList } from './edge-list'
import { CreateEdgeForm } from './create-edge-form'
import { MarkdownContent } from './markdown-content'
import { Chronicles } from './chronicles'
import { NodeOwnerSection, type OwnerContext } from './node-owner-section'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Edge = {
  id: string
  type_label: string
  label: string | null
  direction: 'outgoing' | 'incoming'
  related_id: string
  related_title: string
}

type Chronicle = {
  id: string
  title: string
  content: string
  loop_number: number | null
  game_date: string | null
  created_at: string
  updated_at: string
}

type ChildNode = {
  id: string
  title: string
  typeIcon?: string
  typeLabel?: string
}

type Props = {
  node: {
    id: string
    title: string
    fields: Record<string, unknown>
    content: string
    type: { slug: string; label: string; icon: string | null }
  }
  edges: Edge[]
  childNodes: ChildNode[]
  chronicles: Chronicle[]
  campaignSlug: string
  campaignId: string
  /**
   * Only present for character-nodes. Drives the "Owner" section visibility
   * (manage / self-read / hidden).
   */
  ownerContext?: OwnerContext
  /**
   * Spec-006 increment 3: infrastructure only. When false, write-capable UI
   * is suppressed (edit/delete buttons, tag editor, create-edge form).
   * Call-sites currently always pass `true` — the switch will be flipped
   * for players in increment 4 together with RLS.
   */
  canEdit?: boolean
}

const HIDDEN_FIELDS = ['tags']

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  description: 'Описание',
  status: 'Статус',
  player: 'Игрок',
  number: 'Номер петли',
  session_number: 'Номер сессии',
  loop_number: 'Петля',
  recap: 'Рекап',
  dm_notes: 'Заметки ДМа',
  played_at: 'Дата игры',
  game_date: 'Игровая дата',
  notes: 'Заметки',
  title: 'Подзаголовок',
  max_hp: 'Макс. HP',
  statblock_url: 'Ссылка на статблок',
  armor_class: 'Класс брони',
  challenge_rating: 'Показатель опасности',
}

const STATUS_LABELS: Record<string, string> = {
  past: 'Прошедшая',
  current: 'Текущая',
  future: 'Будущая',
}

function formatFieldValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—'
  const str = String(value)
  if (key === 'status' && STATUS_LABELS[str]) return STATUS_LABELS[str]
  if (key === 'played_at' && str) {
    try { return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) }
    catch { return str }
  }
  if (key === 'loop_number' && str) return `Петля ${str}`
  return str
}

const URL_FIELDS = ['statblock_url', 'link', 'url']

function isComplex(value: unknown): boolean {
  return value !== null && typeof value === 'object'
}

function isUrl(key: string, value: unknown): boolean {
  if (value == null || value === '') return false
  const str = String(value)
  if (URL_FIELDS.includes(key)) return str.startsWith('http')
  return false
}

function prettifyUrl(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/$/, '')
    return u.hostname + (path.length > 1 ? path : '')
  } catch {
    return url
  }
}

export function NodeDetail({
  node,
  edges,
  childNodes,
  chronicles,
  campaignSlug,
  campaignId,
  ownerContext,
  canEdit = true,
}: Props) {
  const router = useRouter()
  const [showEdgeForm, setShowEdgeForm] = useState(false)
  const [tags, setTags] = useState<string[]>((node.fields?.tags as string[]) || [])
  const [tagInput, setTagInput] = useState('')
  const [savingTags, setSavingTags] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fields = Object.entries(node.fields || {}).filter(
    ([key]) => !HIDDEN_FIELDS.includes(key)
  )
  
  const saveTags = useCallback(async (newTags: string[]) => {
    setSavingTags(true)
    try {
      const res = await fetch(`/api/nodes/${node.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { tags: newTags } }),
      })
      if (!res.ok) {
        const msg =
          res.status === 403
            ? 'Нет прав на изменение этой ноды.'
            : `Не удалось сохранить теги (HTTP ${res.status}).`
        alert(msg)
        return
      }
      setTags(newTags)
    } catch (err) {
      console.error('Failed to save tags:', err)
      alert('Не удалось сохранить теги — проверь подключение.')
    } finally {
      setSavingTags(false)
    }
  }, [node.id])

  function handleAddTag() {
    const tag = tagInput.trim().toLowerCase()
    if (!tag || tags.includes(tag)) { setTagInput(''); return }
    saveTags([...tags, tag])
    setTagInput('')
  }

  function handleRemoveTag(tag: string) {
    saveTags(tags.filter((t) => t !== tag))
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleAddTag() }
  }

  async function handleDelete() {
    if (!confirm(`Удалить «${node.title}»? Все связи тоже будут удалены.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/nodes/${node.id}`, { method: 'DELETE' })
      if (res.ok) {
        router.push(`/c/${campaignSlug}/catalog`)
        router.refresh()
        return
      }
      const msg =
        res.status === 403
          ? 'Нет прав на удаление этой ноды. Обычно это чужой PC.'
          : `Не удалось удалить (HTTP ${res.status}).`
      alert(msg)
      setDeleting(false)
    } catch (err) {
      console.error('Failed to delete:', err)
      alert('Не удалось удалить — проверь подключение.')
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-1 flex items-center gap-2">
          {node.type.icon && <span>{node.type.icon}</span>}
          <span className="text-sm font-medium text-gray-500">{node.type.label}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-gray-900">{node.title}</h1>
          {canEdit && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/c/${campaignSlug}/catalog/${node.id}/edit`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Редактировать
              </Link>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? '…' : 'Удалить'}
              </button>
            </div>
          )}
        </div>
        {/* Tags — editable when canEdit; read-only pills otherwise */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="group inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
            >
              {tag}
              {canEdit && (
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hidden group-hover:inline text-gray-400 hover:text-red-500"
                  title="Удалить тег"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => { if (tagInput.trim()) handleAddTag() }}
              placeholder="+ тег"
              className="w-20 border-none bg-transparent px-1 py-0.5 text-xs text-gray-500 placeholder:text-gray-300 focus:outline-none focus:w-28 transition-all"
              disabled={savingTags}
            />
          )}
        </div>
      </div>

      {/* Children (contains) */}
      {childNodes.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Содержит
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {childNodes.map((child) => (
              <Link
                key={child.id}
                href={`/c/${campaignSlug}/catalog/${child.id}`}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 hover:border-gray-300 hover:bg-white transition-colors"
              >
                {child.typeIcon && <span className="text-sm">{child.typeIcon}</span>}
                <span className="font-medium text-sm text-gray-900">{child.title}</span>
                {child.typeLabel && (
                  <span className="ml-auto text-xs text-gray-400">{child.typeLabel}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Link to specialized view for loops and sessions */}
      {node.type.slug === 'loop' && (
        <Link
          href={`/c/${campaignSlug}/loops?loop=${node.fields?.number ?? ''}`}
          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-100 transition-colors"
        >
          🔄 Открыть на странице петли →
        </Link>
      )}
      {node.type.slug === 'session' && (
        <Link
          href={`/c/${campaignSlug}/sessions/${node.id}`}
          className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-100 transition-colors"
        >
          📋 Открыть на странице сессии →
        </Link>
      )}

      {fields.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="space-y-3">
            {fields.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {FIELD_LABELS[key] || key}
                </dt>
                <dd className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">
                  {isUrl(key, value) ? (
                    <a
                      href={String(value)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline break-all"
                    >
                      {prettifyUrl(String(value))}
                      <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  ) : isComplex(value) ? (
                    <pre className="mt-1 max-h-96 overflow-auto rounded border border-gray-100 bg-gray-50 p-2 text-xs font-mono text-gray-600">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  ) : (
                    formatFieldValue(key, value)
                  )}
                </dd>
              </div>
            ))}
          </div>
        </div>
      )}

      {node.type.slug === 'character' && ownerContext && (
        <NodeOwnerSection
          nodeId={node.id}
          campaignSlug={campaignSlug}
          ctx={ownerContext}
        />
      )}

      <MarkdownContent
        nodeId={node.id}
        initialContent={node.content || ''}
        campaignSlug={campaignSlug}
      />

      <Chronicles
        nodeId={node.id}
        campaignId={campaignId}
        campaignSlug={campaignSlug}
        initialChronicles={chronicles}
      />

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Связи</h2>
          {canEdit && (
            <button
              onClick={() => setShowEdgeForm(!showEdgeForm)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showEdgeForm ? 'Отмена' : '+ Добавить связь'}
            </button>
          )}
        </div>
        {canEdit && showEdgeForm && (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
            <CreateEdgeForm
              sourceId={node.id}
              campaignId={campaignId}
              campaignSlug={campaignSlug}
              onDone={() => setShowEdgeForm(false)}
            />
          </div>
        )}
        <EdgeList edges={edges} campaignSlug={campaignSlug} />
        {edges.length === 0 && !showEdgeForm && (
          <p className="text-sm text-gray-400">Нет связей</p>
        )}
      </div>
    </div>
  )
}
