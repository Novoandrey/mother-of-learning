'use client'

import { useCallback, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useToast } from './toast-provider'
import { useFormDraft } from '@/hooks/use-form-draft'

type ChronicleDraft = {
  title: string
  content: string
  loopNumber: string
  gameDate: string
}

function formatDraftTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
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

type Props = {
  nodeId: string
  campaignId: string
  initialChronicles: Chronicle[]
}

export function Chronicles({ nodeId, campaignId, initialChronicles }: Props) {
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
  const { toast } = useToast()

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
      toast(msg, { variant: 'error' })
    } catch (err) {
      console.error('Failed to delete chronicle:', err)
      toast('Не удалось удалить — проверь подключение.', { variant: 'error' })
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

  // ── Local autosave for the chronicle form ──────────────────────────
  // Two key spaces:
  //  - edit mode keys by chronicle id (one draft per existing entry)
  //  - create mode keys by host node id (one draft per "+ Добавить" UI)
  // Pristine state (matches `initial`) is treated as empty so we don't
  // pollute storage with a snapshot identical to what's already in DB.
  const initialSnapshot = useMemo<ChronicleDraft>(
    () => ({
      title: initial?.title || '',
      content: initial?.content || '',
      loopNumber: initial?.loop_number?.toString() || '',
      gameDate: initial?.game_date || '',
    }),
    [initial],
  )
  const draftSnapshot = useMemo<ChronicleDraft>(
    () => ({ title, content, loopNumber, gameDate }),
    [title, content, loopNumber, gameDate],
  )
  const isDraftEmpty = useCallback(
    (v: ChronicleDraft) =>
      v.title === initialSnapshot.title &&
      v.content === initialSnapshot.content &&
      v.loopNumber === initialSnapshot.loopNumber &&
      v.gameDate === initialSnapshot.gameDate,
    [initialSnapshot],
  )
  const draftKey = isEdit
    ? `mat-uch:draft:chr:edit:${initial!.id}`
    : `mat-uch:draft:chr:new:${nodeId}`
  const draftHook = useFormDraft<ChronicleDraft>({
    key: draftKey,
    value: draftSnapshot,
    isEmpty: isDraftEmpty,
    onRestore: (v) => {
      setTitle(v.title)
      setContent(v.content)
      setLoopNumber(v.loopNumber)
      setGameDate(v.gameDate)
    },
  })

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
      // Server has it now — drop the local snapshot.
      draftHook.clearDraft()
      onSaved(data)
    } catch (err) {
      console.error('Failed to save chronicle:', err)
    } finally {
      setSaving(false)
    }
  }

  // Cancel = explicit "I don't want this". Wipe the local draft so
  // the next time this form mounts (re-open / refresh) we don't show
  // a stale Restore prompt for content the user has already abandoned.
  const handleCancel = () => {
    draftHook.discardDraft()
    onCancel()
  }

  return (
    <div className="space-y-3">
      {draftHook.pendingDraft && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
          <span className="min-w-0 text-amber-900">
            📝 Найден несохранённый черновик от{' '}
            <span className="font-medium">
              {formatDraftTime(draftHook.pendingDraft.savedAt)}
            </span>
          </span>
          <div className="flex flex-shrink-0 gap-2">
            <button
              onClick={draftHook.restoreDraft}
              className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700"
            >
              Восстановить
            </button>
            <button
              onClick={draftHook.discardDraft}
              className="rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-800 transition-colors hover:bg-amber-100"
            >
              Отбросить
            </button>
          </div>
        </div>
      )}
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
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving || !title.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Сохраняю...' : isEdit ? 'Обновить' : 'Добавить'}
        </button>
        <button
          onClick={handleCancel}
          className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Отмена
        </button>
        {draftHook.lastSavedAt && !draftHook.pendingDraft && (
          <span
            className="text-xs text-gray-400"
            title={`Локальный черновик · ${new Date(draftHook.lastSavedAt).toLocaleString('ru-RU')}`}
          >
            Автосохранено
          </span>
        )}
      </div>
    </div>
  )
}
