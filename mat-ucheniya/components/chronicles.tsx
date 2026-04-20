'use client'

import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Chronicle = {
  id: string
  title: string
  content: string
  loop_number: number | null
  game_date: string | null
  created_at: string
  updated_at: string
}

type Props = {
  nodeId: string
  campaignId: string
  campaignSlug: string
  initialChronicles: Chronicle[]
}

export function Chronicles({ nodeId, campaignId, campaignSlug, initialChronicles }: Props) {
  const [chronicles, setChronicles] = useState(initialChronicles)
  const [showForm, setShowForm] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Летопись {chronicles.length > 0 && <span className="text-gray-400">({chronicles.length})</span>}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-blue-600 hover:underline"
        >
          {showForm ? 'Отмена' : '+ Добавить запись'}
        </button>
      </div>

      {showForm && (
        <div className="border-b border-blue-100 bg-blue-50/30 p-4">
          <ChronicleForm
            nodeId={nodeId}
            campaignId={campaignId}
            onSaved={(entry) => {
              setChronicles([entry, ...chronicles])
              setShowForm(false)
            }}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {chronicles.length === 0 && !showForm && (
        <div className="p-4">
          <p className="text-sm italic text-gray-400">
            Пока записей нет. Добавьте рассказ, заметку или фанфик с привязкой к петле.
          </p>
        </div>
      )}

      {chronicles.length > 0 && (
        <div className="divide-y divide-gray-50">
          {chronicles.map((entry) => (
            <ChronicleEntry
              key={entry.id}
              entry={entry}
              isExpanded={expanded === entry.id}
              isEditing={editingId === entry.id}
              onToggle={() => setExpanded(expanded === entry.id ? null : entry.id)}
              onEdit={() => setEditingId(entry.id)}
              onCancelEdit={() => setEditingId(null)}
              onUpdated={(updated) => {
                setChronicles(chronicles.map((c) => (c.id === updated.id ? updated : c)))
                setEditingId(null)
              }}
              onDeleted={(id) => {
                setChronicles(chronicles.filter((c) => c.id !== id))
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// --- Chronicle Entry ---

function ChronicleEntry({
  entry,
  isExpanded,
  isEditing,
  onToggle,
  onEdit,
  onCancelEdit,
  onUpdated,
  onDeleted,
}: {
  entry: Chronicle
  isExpanded: boolean
  isEditing: boolean
  onToggle: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onUpdated: (entry: Chronicle) => void
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!confirm('Удалить запись из летописи?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/chronicles/${entry.id}`, { method: 'DELETE' })
      if (res.ok) {
        onDeleted(entry.id)
        return
      }
      const msg =
        res.status === 403
          ? 'Нет прав на удаление этой записи.'
          : `Не удалось удалить запись (HTTP ${res.status}).`
      alert(msg)
    } catch (err) {
      console.error('Failed to delete chronicle:', err)
      alert('Не удалось удалить — проверь подключение.')
    } finally {
      setDeleting(false)
    }
  }

  if (isEditing) {
    return (
      <div className="bg-blue-50/30 p-4">
        <ChronicleForm
          initial={entry}
          nodeId=""
          campaignId=""
          onSaved={onUpdated}
          onCancel={onCancelEdit}
        />
      </div>
    )
  }

  return (
    <div className="px-4 py-3">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className={`text-xs text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
          ▸
        </span>
        <span className="font-medium text-gray-800">{entry.title}</span>
        {entry.loop_number != null && (
          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
            Петля {entry.loop_number}
          </span>
        )}
        {entry.game_date && (
          <span className="text-xs text-gray-400">{entry.game_date}</span>
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 pl-5">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.content}</ReactMarkdown>
          </div>
          <div className="mt-3 flex gap-3">
            <button
              onClick={onEdit}
              className="text-xs text-blue-600 hover:underline"
            >
              Редактировать
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-red-500 hover:underline disabled:opacity-50"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Chronicle Form (create + edit) ---

function ChronicleForm({
  nodeId,
  campaignId,
  initial,
  onSaved,
  onCancel,
}: {
  nodeId: string
  campaignId: string
  initial?: Chronicle
  onSaved: (entry: Chronicle) => void
  onCancel: () => void
}) {
  const isEdit = !!initial
  const [title, setTitle] = useState(initial?.title || '')
  const [content, setContent] = useState(initial?.content || '')
  const [loopNumber, setLoopNumber] = useState(initial?.loop_number?.toString() || '')
  const [gameDate, setGameDate] = useState(initial?.game_date || '')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      const url = isEdit ? `/api/chronicles/${initial!.id}` : '/api/chronicles'
      const method = isEdit ? 'PUT' : 'POST'
      const body: Record<string, unknown> = {
        title: title.trim(),
        content,
        loop_number: loopNumber ? parseInt(loopNumber) : null,
        game_date: gameDate.trim() || null,
      }
      if (!isEdit) {
        body.node_id = nodeId
        body.campaign_id = campaignId
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()
      onSaved(data)
    } catch (err) {
      console.error('Failed to save chronicle:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Заголовок записи"
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        autoFocus
      />
      <div className="flex gap-2">
        <input
          type="number"
          value={loopNumber}
          onChange={(e) => setLoopNumber(e.target.value)}
          placeholder="Петля №"
          className="w-24 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          type="text"
          value={gameDate}
          onChange={(e) => setGameDate(e.target.value)}
          placeholder="Дата (напр. День 15)"
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Текст записи (Markdown)..."
        className="min-h-[150px] w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Сохраняю...' : isEdit ? 'Обновить' : 'Добавить'}
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
