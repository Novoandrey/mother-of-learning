'use client'

import { useCallback, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useFormDraft } from '@/hooks/use-form-draft'

type Props = {
  nodeId: string
  initialContent: string
}

type DraftSnapshot = { draft: string }

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

export function MarkdownContent({ nodeId, initialContent }: Props) {
  const [content, setContent] = useState(initialContent)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)
  const [saving, setSaving] = useState(false)

  // ── Local autosave for the markdown editor ─────────────────────────
  // Only enabled while the user is in editing mode — that's the only
  // window when state can outlive the next save. The "isEmpty" predicate
  // compares against the currently-saved `content` rather than blank
  // string: when the user reverts manually, the draft is dropped from
  // storage instead of being re-saved as a no-op snapshot.
  const draftSnapshot = useMemo<DraftSnapshot>(() => ({ draft }), [draft])
  const isDraftEmpty = useCallback(
    (v: DraftSnapshot) => v.draft === content,
    [content],
  )
  const draftHook = useFormDraft<DraftSnapshot>({
    key: `mat-uch:draft:md:${nodeId}`,
    value: draftSnapshot,
    enabled: editing,
    isEmpty: isDraftEmpty,
    onRestore: (v) => setDraft(v.draft),
  })

  const handleEdit = () => {
    setDraft(content)
    setEditing(true)
  }

  const handleCancel = () => {
    // Cancel = explicit "I don't want this". Wipe the local draft so
    // the next Edit click doesn't surface a stale Restore prompt.
    draftHook.discardDraft()
    setDraft(content)
    setEditing(false)
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/nodes/${nodeId}/content`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (!res.ok) throw new Error('Save failed')
      setContent(draft)
      // Server has it now — drop the local snapshot.
      draftHook.clearDraft()
      setEditing(false)
    } catch (err) {
      console.error('Failed to save content:', err)
    } finally {
      setSaving(false)
    }
  }, [nodeId, draft, draftHook])

  const isEmpty = !content.trim()

  if (editing) {
    return (
      <div className="rounded-lg border border-blue-200 bg-white">
        <div className="flex items-center justify-between border-b border-blue-100 px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Контент</h2>
          <div className="flex items-center gap-2">
            {draftHook.lastSavedAt && !draftHook.pendingDraft && (
              <span
                className="text-xs text-gray-400"
                title={`Локальный черновик · ${new Date(draftHook.lastSavedAt).toLocaleString('ru-RU')}`}
              >
                Автосохранено
              </span>
            )}
            <button
              onClick={handleCancel}
              className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Отмена
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
        {draftHook.pendingDraft && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm">
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
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Markdown: # Заголовок, **жирный**, *курсив*, - списки, | таблицы |..."
          className="min-h-[300px] w-full resize-y p-4 font-mono text-sm text-gray-700 focus:outline-none"
          autoFocus
        />
        {draft.trim() && (
          <div className="border-t border-gray-100 p-4">
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Превью</div>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft}</ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Контент</h2>
        <button
          onClick={handleEdit}
          className="text-sm text-blue-600 hover:underline"
        >
          {isEmpty ? '+ Написать' : 'Редактировать'}
        </button>
      </div>
      {isEmpty ? (
        <div className="p-4">
          <p className="text-sm italic text-gray-400">
            Пока пусто. Нажмите «Написать» чтобы добавить описание, статы или заметки в Markdown.
          </p>
        </div>
      ) : (
        <div className="prose prose-sm max-w-none p-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  )
}
