'use client'

import { useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Props = {
  nodeId: string
  initialContent: string
}

export function MarkdownContent({ nodeId, initialContent }: Props) {
  const [content, setContent] = useState(initialContent)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialContent)
  const [saving, setSaving] = useState(false)

  const handleEdit = () => {
    setDraft(content)
    setEditing(true)
  }

  const handleCancel = () => {
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
      setEditing(false)
    } catch (err) {
      console.error('Failed to save content:', err)
    } finally {
      setSaving(false)
    }
  }, [nodeId, draft])

  const isEmpty = !content.trim()

  if (editing) {
    return (
      <div className="rounded-lg border border-blue-200 bg-white">
        <div className="flex items-center justify-between border-b border-blue-100 px-4 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Контент</h2>
          <div className="flex gap-2">
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
