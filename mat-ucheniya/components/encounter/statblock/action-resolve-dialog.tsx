'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { Swords, X } from 'lucide-react'
import { HpBar } from './hp-bar'
import type { StatblockAction } from '@/lib/statblock'
import type { PickerParticipant } from './target-picker-dialog'

// Per-target outcome row
type Outcome = {
  hit: boolean
  damage: string         // raw string; blank = no damage
  note: string           // optional: "crit", "poisoned", etc.
}

export type ResolveResult = {
  // Structured: per target, what happened. Damage already parsed to a number.
  perTarget: { id: string; hit: boolean; damage: number; note: string }[]
  // Overall free-form comment (optional).
  comment: string
}

type Props = {
  action: StatblockAction
  /** Empty array = self-targeted (no cells). */
  targets: PickerParticipant[]
  onApply: (result: ResolveResult) => void
  onClose: () => void
}

/**
 * Shown AFTER target selection. The DM has rolled physical dice; this
 * dialog lets them record the outcome per target (hit/miss, damage) and
 * writes it to the encounter event log. Damage values, if non-zero,
 * are applied to the target's HP upstream.
 *
 * Flow:
 *   single/self action → skip target picker → this dialog directly
 *   area action        → target picker → this dialog (targets pre-filled)
 */
export function ActionResolveDialog({ action, targets, onApply, onClose }: Props) {
  const initial = useMemo<Record<string, Outcome>>(() => {
    const out: Record<string, Outcome> = {}
    for (const t of targets) out[t.id] = { hit: true, damage: '', note: '' }
    return out
  }, [targets])

  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>(initial)
  const [comment, setComment] = useState('')
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  // Recompute when targets change (rare, but safe)
  useEffect(() => setOutcomes(initial), [initial])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    closeBtnRef.current?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function patch(id: string, p: Partial<Outcome>) {
    setOutcomes((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }))
  }

  function handleApply() {
    const perTarget = targets.map((t) => {
      const o = outcomes[t.id] ?? { hit: true, damage: '', note: '' }
      const dmg = parseInt(o.damage, 10)
      return {
        id: t.id,
        hit: o.hit,
        damage: Number.isFinite(dmg) && dmg > 0 ? dmg : 0,
        note: o.note.trim(),
      }
    })
    onApply({ perTarget, comment: comment.trim() })
  }

  const isSelf = targets.length === 0

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(17,24,39,0.45)' }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`Исход действия: ${action.name}`}
    >
      <div
        className="w-[520px] max-w-[92vw] overflow-hidden rounded-lg bg-white"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 border-b px-3.5 py-3"
          style={{ borderColor: 'var(--gray-200)' }}
        >
          <Swords size={16} strokeWidth={1.5} style={{ color: 'var(--fg-2)' }} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold" style={{ color: 'var(--gray-900)' }}>
              {action.name}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--fg-3)' }}>
              {isSelf
                ? 'Самоприменение — зафиксируй эффект'
                : `Что получилось? Цели: ${targets.length}`}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
            style={{ color: 'var(--fg-3)' }}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>

        {/* Action formula / description (the same text as in the hover tooltip) */}
        {action.desc && (
          <div
            className="border-b px-3.5 py-2.5 text-[12px] leading-relaxed"
            style={{ borderColor: 'var(--gray-100)', background: 'var(--gray-50)', color: 'var(--fg-2)' }}
          >
            <FormulaLine text={action.desc} />
          </div>
        )}

        {/* Per-target outcome rows */}
        {!isSelf && (
          <div className="max-h-[320px] overflow-y-auto">
            {targets.map((t) => {
              const o = outcomes[t.id] ?? { hit: true, damage: '', note: '' }
              return (
                <div
                  key={t.id}
                  className="border-b px-3.5 py-2.5 last:border-b-0"
                  style={{ borderColor: 'var(--gray-100)' }}
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[13px] font-medium" style={{ color: 'var(--gray-900)' }}>
                      {t.display_name}
                    </span>
                    <div className="ml-auto w-28">
                      <HpBar current={t.current_hp} max={t.max_hp} tempHp={t.temp_hp} size="sm" />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Hit / miss toggle */}
                    <div
                      className="inline-flex rounded border text-[11px]"
                      style={{ borderColor: 'var(--gray-200)' }}
                    >
                      <button
                        type="button"
                        onClick={() => patch(t.id, { hit: true })}
                        className="px-2.5 py-1 transition-colors"
                        style={{
                          background: o.hit ? 'var(--blue-50)' : '#fff',
                          color: o.hit ? 'var(--blue-700)' : 'var(--fg-3)',
                          fontWeight: o.hit ? 600 : 400,
                        }}
                      >
                        Попал
                      </button>
                      <button
                        type="button"
                        onClick={() => patch(t.id, { hit: false, damage: '' })}
                        className="px-2.5 py-1 transition-colors"
                        style={{
                          background: !o.hit ? 'var(--gray-100)' : '#fff',
                          color: !o.hit ? 'var(--gray-900)' : 'var(--fg-3)',
                          fontWeight: !o.hit ? 600 : 400,
                          borderLeft: '1px solid var(--gray-200)',
                        }}
                      >
                        Промах
                      </button>
                    </div>

                    {/* Damage input */}
                    <label className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--fg-2)' }}>
                      Урон
                      <input
                        type="text"
                        inputMode="numeric"
                        value={o.damage}
                        onChange={(e) =>
                          patch(t.id, { damage: e.target.value.replace(/[^0-9]/g, '') })
                        }
                        disabled={!o.hit}
                        placeholder="—"
                        className="w-14 rounded border px-1.5 py-0.5 text-center font-mono text-[12px] disabled:bg-gray-50 disabled:text-gray-400"
                        style={{ borderColor: 'var(--gray-200)' }}
                      />
                    </label>

                    {/* Note (e.g. "крит", "отравлен", "спас на МДР") */}
                    <input
                      type="text"
                      value={o.note}
                      onChange={(e) => patch(t.id, { note: e.target.value })}
                      placeholder="заметка (крит, спас, и т.п.)"
                      className="min-w-[100px] flex-1 rounded border px-2 py-0.5 text-[11px] placeholder:text-gray-300"
                      style={{ borderColor: 'var(--gray-200)' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Overall comment */}
        <div className="border-b px-3.5 py-2" style={{ borderColor: 'var(--gray-100)' }}>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={1}
            placeholder={
              isSelf
                ? 'Что произошло? (обязательно)'
                : 'Общий комментарий (необязательно)'
            }
            className="w-full resize-none rounded border px-2 py-1 text-[12px] placeholder:text-gray-300"
            style={{ borderColor: 'var(--gray-200)' }}
          />
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
            onClick={handleApply}
            className="flex-1 rounded-md px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors"
            style={{ background: 'var(--blue-600)' }}
          >
            {isSelf ? 'Записать в лог' : 'Применить + в лог'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inline formula line (copied from action-button, light variant) ───

function FormulaLine({ text }: { text: string }) {
  const parts = text
    .split(/(\+\d+\s+to\s+hit|\d+d\d+(?:[+-]\d+)?|DC\s*\d+\s*\w+)/gi)
    .filter(Boolean)

  return (
    <span className="leading-relaxed">
      {parts.map((p, i) => {
        if (/^\+\d+\s+to\s+hit/i.test(p)) {
          return (
            <span
              key={i}
              className="mx-0.5 inline-block rounded font-mono"
              style={{
                padding: '1px 5px',
                fontSize: 11,
                background: 'rgba(251,191,36,0.25)',
                border: '1px solid rgba(251,191,36,0.45)',
                color: '#92400e',
              }}
            >
              {p}
            </span>
          )
        }
        if (/^\d+d\d+/i.test(p)) {
          return (
            <span
              key={i}
              className="mx-0.5 inline-block rounded font-mono"
              style={{
                padding: '1px 5px',
                fontSize: 11,
                background: 'rgba(239,68,68,0.18)',
                border: '1px solid rgba(239,68,68,0.35)',
                color: '#991b1b',
              }}
            >
              {p}
            </span>
          )
        }
        if (/^DC\s*\d+/i.test(p)) {
          return (
            <span
              key={i}
              className="mx-0.5 inline-block rounded font-mono"
              style={{
                padding: '1px 5px',
                fontSize: 11,
                background: 'rgba(96,165,250,0.18)',
                border: '1px solid rgba(96,165,250,0.4)',
                color: '#1e40af',
              }}
            >
              {p}
            </span>
          )
        }
        return <span key={i}>{p}</span>
      })}
    </span>
  )
}
