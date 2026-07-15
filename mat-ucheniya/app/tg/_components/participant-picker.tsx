'use client'

import { useState, type Dispatch, type SetStateAction } from 'react'
import type { CampaignCharacter } from '@/lib/queries/campaign-characters'
import { FIELD } from './primitives'

export type ParticipantPickerLabels = {
  empty: string
  countPrefix: string
  dialogTitle: string
  dialogAriaLabel: string
}

const DEFAULT_LABELS: ParticipantPickerLabels = {
  empty: 'Выбрать участников',
  countPrefix: 'Участников',
  dialogTitle: 'Участники',
  dialogAriaLabel: 'Выбор участников',
}

/** Compact dark-theme multi-select used by expedition, craft, and scribe forms. */
export function ParticipantPicker({
  characters,
  selected,
  setSelected,
  labels = DEFAULT_LABELS,
}: {
  characters: CampaignCharacter[]
  selected: Set<string>
  setSelected: Dispatch<SetStateAction<Set<string>>>
  labels?: ParticipantPickerLabels
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')

  const ordered = [...characters].sort(
    (a, b) => Number(b.isOwn) - Number(a.isOwn) || a.title.localeCompare(b.title, 'ru'),
  )
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const q = filter.trim().toLowerCase()
  const filtered = q ? ordered.filter((c) => c.title.toLowerCase().includes(q)) : ordered
  const selectedRows = filtered.filter((c) => selected.has(c.id))
  const unselectedRows = filtered.filter((c) => !selected.has(c.id))

  const count = selected.size
  const label = (() => {
    if (count === 0) return labels.empty
    if (count <= 3) {
      const names = ordered.filter((c) => selected.has(c.id)).map((c) => c.title)
      if (names.length === count) return names.join(', ')
    }
    return `${labels.countPrefix}: ${count}`
  })()

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-700"
      >
        <span className={`min-w-0 truncate ${count === 0 ? 'text-neutral-500' : 'text-neutral-100'}`}>
          {label}
        </span>
        <span className="shrink-0 text-neutral-500">▾</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/60"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="fixed inset-x-0 bottom-0 z-[71] mx-auto flex max-h-[80vh] w-full max-w-sm flex-col rounded-t-2xl bg-neutral-900"
            role="dialog"
            aria-label={labels.dialogAriaLabel}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <div className="text-sm font-medium text-neutral-200">
                {labels.dialogTitle} · {count}/{ordered.length}
              </div>
              <div className="flex items-center gap-3">
                {count > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
                  >
                    Очистить
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-neutral-300 transition-colors hover:text-neutral-100"
                >
                  Готово
                </button>
              </div>
            </div>
            <div className="px-4 pb-2">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Поиск по имени…"
                className={FIELD}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {ordered.length === 0 && (
                <div className="px-3 py-3 text-sm text-neutral-500">В кампании нет персонажей.</div>
              )}
              {ordered.length > 0 && filtered.length === 0 && (
                <div className="px-3 py-3 text-sm text-neutral-500">Ничего не найдено.</div>
              )}
              {selectedRows.length > 0 && (
                <>
                  <div className="px-2 pt-1 text-[11px] uppercase tracking-wide text-neutral-600">
                    Выбрано
                  </div>
                  {selectedRows.map((c) => (
                    <ParticipantRow key={c.id} c={c} checked onToggle={() => toggle(c.id)} />
                  ))}
                  {unselectedRows.length > 0 && (
                    <div className="mt-2 px-2 pb-1 text-[11px] uppercase tracking-wide text-neutral-600">
                      Остальные
                    </div>
                  )}
                </>
              )}
              {unselectedRows.map((c) => (
                <ParticipantRow key={c.id} c={c} checked={false} onToggle={() => toggle(c.id)} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function ParticipantRow({
  c,
  checked,
  onToggle,
}: {
  c: CampaignCharacter
  checked: boolean
  onToggle: () => void
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-neutral-800">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 accent-blue-600"
      />
      <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">{c.title}</span>
      {c.isOwn && <span className="shrink-0 text-[11px] text-neutral-500">ваш</span>}
    </label>
  )
}
