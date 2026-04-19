'use client'

import { useState, useEffect, useRef } from 'react'
import { Target, X } from 'lucide-react'
import { HpBar } from './hp-bar'
import type { StatblockAction } from '@/lib/statblock'

// Target shape — minimal fields the picker needs.
// Grid's Participant has more; we accept a narrowed slice.
export type PickerParticipant = {
  id: string
  display_name: string
  current_hp: number
  max_hp: number
  temp_hp: number
  role: string
  is_dead?: boolean    // derived flag: e.g. condition "dead" present
}

type Props = {
  action: StatblockAction
  participants: PickerParticipant[]
  onApply: (targetIds: string[]) => void
  onClose: () => void
}

export function TargetPickerDialog({ action, participants, onApply, onClose }: Props) {
  // Selectable = not dead. KO'd (hp=0 but alive) is selectable.
  const selectable = participants.filter((p) => !p.is_dead)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const firstBtnRef = useRef<HTMLButtonElement | null>(null)

  // Close on Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    firstBtnRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (id: string) => {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
  }
  const allSelected = selected.size === selectable.length && selectable.length > 0
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(selectable.map((p) => p.id)))

  const roleDot = (role: string) => {
    if (role === 'pc') return 'var(--blue-500)'
    if (role === 'ally') return 'var(--green-500)'
    if (role === 'enemy') return 'var(--red-500)'
    return 'var(--gray-400)'
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(17,24,39,0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Выбор целей для ${action.name}`}
    >
      <div
        className="w-[460px] max-w-[92vw] overflow-hidden rounded-lg bg-white"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 border-b px-3.5 py-3"
          style={{ borderColor: 'var(--gray-200)' }}
        >
          <Target size={16} strokeWidth={1.5} style={{ color: 'var(--orange-500)' }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold" style={{ color: 'var(--gray-900)' }}>
              {action.name}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>
              Выбери цели · {selectable.length} досягаемо
            </div>
          </div>
          <button
            ref={firstBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
            style={{ color: 'var(--fg-3)' }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Select-all */}
        <div
          className="flex items-center gap-2 border-b px-3.5 py-2"
          style={{ borderColor: 'var(--gray-200)', background: 'var(--gray-50)' }}
        >
          <label className="flex cursor-pointer items-center gap-2 text-[12px]" style={{ color: 'var(--fg-2)' }}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-blue-600"
            />
            Все досягаемые ({selectable.length})
          </label>
        </div>

        {/* List */}
        <div className="max-h-[320px] overflow-y-auto">
          {participants.length === 0 && (
            <div className="p-4 text-center text-[12px]" style={{ color: 'var(--fg-3)' }}>
              Нет участников в бою.
            </div>
          )}
          {participants.map((p) => {
            const isDead = !!p.is_dead
            const isKO = p.current_hp === 0 && !isDead
            const checked = selected.has(p.id)
            return (
              <div
                key={p.id}
                className="border-b last:border-b-0"
                style={{
                  borderColor: 'var(--gray-100)',
                  background: checked ? 'var(--blue-50)' : 'transparent',
                  opacity: isDead ? 0.35 : 1,
                }}
              >
                <label
                  className="flex items-center gap-2.5 px-3.5 py-2"
                  style={{ cursor: isDead ? 'not-allowed' : 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isDead}
                    onChange={() => toggle(p.id)}
                    className="accent-blue-600"
                  />
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: roleDot(p.role) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="text-[13px] font-medium"
                        style={{
                          color: isDead ? 'var(--fg-3)' : 'var(--gray-900)',
                          textDecoration: isDead ? 'line-through' : 'none',
                        }}
                      >
                        {p.display_name}
                      </span>
                      {isDead && (
                        <span
                          className="rounded text-[10px] font-semibold"
                          style={{ padding: '1px 5px', background: 'var(--gray-900)', color: '#fff' }}
                        >
                          DEAD
                        </span>
                      )}
                      {isKO && (
                        <span
                          className="rounded font-mono text-[10px] font-semibold"
                          style={{
                            padding: '1px 5px',
                            background: 'var(--red-100)',
                            color: 'var(--red-700)',
                          }}
                        >
                          KO
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5">
                      <HpBar
                        current={p.current_hp}
                        max={p.max_hp}
                        tempHp={p.temp_hp}
                        size="sm"
                      />
                    </div>
                  </div>
                </label>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div
          className="flex gap-2 border-t px-3.5 py-2.5"
          style={{ borderColor: 'var(--gray-200)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border bg-white px-3.5 py-1.5 text-[13px]"
            style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-2)' }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onApply(Array.from(selected))}
            disabled={selected.size === 0}
            className="flex-1 rounded-md px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors disabled:opacity-40"
            style={{ background: 'var(--blue-600)' }}
          >
            Применить к {selected.size}
          </button>
        </div>
      </div>
    </div>
  )
}
