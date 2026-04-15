'use client'

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { addLogEntry, deleteLogEntry, updateLogEntry, type LogEntry } from '@/lib/log-actions'
import {
  deleteEvent,
  renderEvent,
  type EncounterEvent,
  type TimelineItem,
} from '@/lib/event-actions'

type Props = {
  encounterId: string
  logEntries: LogEntry[]
  onLogEntriesChange: (entries: LogEntry[]) => void
  events: EncounterEvent[]
  onEventsChange: (events: EncounterEvent[]) => void
  timeline: TimelineItem[]
  disabled?: boolean
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// ── Event styling by action type ──────────────────

const EVENT_STYLE: Record<string, { icon: string; color: string }> = {
  hp_damage:        { icon: '💔', color: 'text-red-600' },
  hp_heal:          { icon: '💚', color: 'text-green-600' },
  condition_add:    { icon: '🔻', color: 'text-orange-600' },
  condition_remove: { icon: '🔺', color: 'text-gray-500' },
  effect_add:       { icon: '✦',  color: 'text-purple-600' },
  effect_remove:    { icon: '✧',  color: 'text-gray-500' },
  round_start:      { icon: '⏱',  color: 'text-blue-600' },
  turn_start:       { icon: '▶',  color: 'text-blue-500' },
  custom:           { icon: '📝', color: 'text-gray-700' },
}

function getEventStyle(action: string) {
  return EVENT_STYLE[action] || { icon: '•', color: 'text-gray-600' }
}

// ── Component ─────────────────────────────────────

export function EncounterLog({
  encounterId,
  logEntries,
  onLogEntriesChange,
  events,
  onEventsChange,
  timeline,
  disabled = false,
}: Props) {
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevLenRef = useRef(timeline.length)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (timeline.length > prevLenRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevLenRef.current = timeline.length
  }, [timeline.length])

  // ── Manual log handlers ─────────────────────────

  async function handleSend() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const entry = await addLogEntry(encounterId, text)
      onLogEntriesChange([...logEntries, entry])
      setDraft('')
      inputRef.current?.focus()
    } catch (e) {
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  async function handleDeleteLog(id: string) {
    onLogEntriesChange(logEntries.filter((e) => e.id !== id))
    try { await deleteLogEntry(id) } catch (e) { console.error(e) }
  }

  async function handleDeleteEvent(id: string) {
    onEventsChange(events.filter((e) => e.id !== id))
    try { await deleteEvent(id) } catch (e) { console.error(e) }
  }

  function startEdit(entry: LogEntry) {
    setEditingId(entry.id)
    setEditDraft(entry.content)
  }

  async function commitEdit(id: string) {
    const text = editDraft.trim()
    setEditingId(null)
    if (!text) return
    onLogEntriesChange(logEntries.map((e) => e.id === id ? { ...e, content: text } : e))
    try { await updateLogEntry(id, text) } catch (e) { console.error(e) }
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
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

  // ── Render a timeline item ──────────────────────

  function renderTimelineItem(item: TimelineItem) {
    if (item.kind === 'log') {
      const entry = item.data
      const isAuto = entry.author_name === '⚙'
      return (
        <div key={`log-${entry.id}`} className={`group flex items-start gap-2 py-0.5 hover:bg-gray-50/50 -mx-1 px-1 rounded ${isAuto ? 'opacity-70' : ''}`}>
          <span className="flex-shrink-0 pt-0.5 font-mono text-[10px] text-gray-300 select-none">
            {formatTime(entry.created_at)}
          </span>
          <span className={`flex-shrink-0 pt-0.5 text-[10px] font-semibold min-w-[24px] ${isAuto ? 'text-gray-300' : 'text-gray-400'}`}>
            {entry.author_name}
          </span>

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
            <span className={`flex-1 text-sm whitespace-pre-wrap break-words ${isAuto ? 'text-gray-500 italic' : 'text-gray-800'}`}>
              {entry.content}
            </span>
          )}

          {!disabled && editingId !== entry.id && (
            <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => startEdit(entry)}
                className="h-5 w-5 rounded text-[10px] text-gray-300 hover:bg-gray-100 hover:text-gray-500"
                title="Редактировать">✎</button>
              <button onClick={() => handleDeleteLog(entry.id)}
                className="h-5 w-5 rounded text-[10px] text-gray-300 hover:bg-red-50 hover:text-red-500"
                title="Удалить">✕</button>
            </div>
          )}
        </div>
      )
    }

    // Event
    const evt = item.data
    const style = getEventStyle(evt.action)
    const text = renderEvent(evt)

    return (
      <div key={`evt-${evt.id}`} className="group flex items-start gap-2 py-0.5 hover:bg-gray-50/50 -mx-1 px-1 rounded">
        <span className="flex-shrink-0 pt-0.5 font-mono text-[10px] text-gray-300 select-none">
          {formatTime(evt.created_at)}
        </span>
        <span className="flex-shrink-0 pt-0.5 text-[11px] min-w-[24px] select-none" title={evt.action}>
          {style.icon}
        </span>
        <span className={`flex-1 text-sm ${style.color}`}>
          {text}
        </span>

        {!disabled && (
          <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={() => handleDeleteEvent(evt.id)}
              className="h-5 w-5 rounded text-[10px] text-gray-300 hover:bg-red-50 hover:text-red-500"
              title="Удалить">✕</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="border border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
          Лог действий
        </span>
      </div>

      {/* Timeline */}
      <div className="max-h-[400px] min-h-[120px] overflow-y-auto px-3 py-2 space-y-1">
        {timeline.length === 0 && (
          <p className="py-4 text-center text-xs text-gray-300">
            Пусто. Записывайте ход боя.
          </p>
        )}
        {timeline.map(renderTimelineItem)}
        <div ref={bottomRef} />
      </div>

      {/* Input (manual DM text) */}
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
