'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { addLogEntry, deleteLogEntry, updateLogEntry, type LogEntry } from '@/lib/log-actions'

type Props = {
  encounterId: string
  initialEntries: LogEntry[]
  disabled?: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function EncounterLog({ encounterId, initialEntries, disabled = false }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [entries.length])

  async function handleSend() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const entry = await addLogEntry(encounterId, text)
      setEntries((prev) => [...prev, entry])
      setDraft('')
      inputRef.current?.focus()
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  async function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    try { await deleteLogEntry(id) } catch (e) { console.error(e) }
  }

  function startEdit(entry: LogEntry) {
    setEditingId(entry.id)
    setEditDraft(entry.content)
  }

  async function commitEdit(id: string) {
    const text = editDraft.trim()
    setEditingId(null)
    if (!text) return
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, content: text } : e))
    try { await updateLogEntry(id, text) } catch (e) { console.error(e) }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function handleEditKeyDown(e: KeyboardEvent<HTMLTextAreaElement>, id: string) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commitEdit(id)
    }
    if (e.key === 'Escape') setEditingId(null)
  }

  return (
    <div className="border border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Лог действий
        </span>
      </div>

      {/* Entries */}
      <div className="max-h-[400px] min-h-[120px] overflow-y-auto px-3 py-2 space-y-1">
        {entries.length === 0 && (
          <p className="py-4 text-center text-xs text-gray-300">
            Пусто. Записывайте ход боя.
          </p>
        )}
        {entries.map((entry) => (
          <div key={entry.id} className="group flex items-start gap-2 py-0.5 hover:bg-gray-50/50 -mx-1 px-1 rounded">
            {/* Timestamp */}
            <span className="flex-shrink-0 pt-0.5 font-mono text-[10px] text-gray-300 select-none">
              {formatTime(entry.created_at)}
            </span>

            {/* Author */}
            <span className="flex-shrink-0 pt-0.5 text-[10px] font-semibold text-gray-400 min-w-[24px]">
              {entry.author_name}
            </span>

            {/* Content */}
            {editingId === entry.id ? (
              <textarea
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                onBlur={() => commitEdit(entry.id)}
                onKeyDown={(e) => handleEditKeyDown(e, entry.id)}
                rows={1}
                className="flex-1 rounded border border-blue-400 px-1.5 py-0.5 text-sm focus:outline-none resize-none"
              />
            ) : (
              <span className="flex-1 text-sm text-gray-800 whitespace-pre-wrap break-words">
                {entry.content}
              </span>
            )}

            {/* Actions (hover) */}
            {!disabled && editingId !== entry.id && (
              <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => startEdit(entry)}
                  className="h-5 w-5 rounded text-[10px] text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                  title="Редактировать">✎</button>
                <button onClick={() => handleDelete(entry.id)}
                  className="h-5 w-5 rounded text-[10px] text-gray-300 hover:bg-red-50 hover:text-red-500"
                  title="Удалить">✕</button>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {!disabled && (
        <div className="border-t border-gray-200 flex items-end gap-2 px-3 py-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Записать действие... (Enter — отправить, Shift+Enter — перенос)"
            rows={1}
            disabled={sending}
            className="flex-1 rounded border border-gray-200 px-2.5 py-1.5 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none disabled:opacity-50"
          />
          <button onClick={handleSend} disabled={!draft.trim() || sending}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0">
            ↵
          </button>
        </div>
      )}
    </div>
  )
}
