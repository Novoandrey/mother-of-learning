'use client'

import { Swords, Target, Sparkles } from 'lucide-react'
import type { StatblockAction } from '@/lib/statblock'

// ── Formula rendering inside tooltips ──────────────────────────────
// Splits "+14 to hit … 2d10+8 … DC 21 Dex" into coloured chips.

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
                background: 'rgba(251,191,36,0.18)',
                border: '1px solid rgba(251,191,36,0.35)',
                color: '#fef3c7',
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
                background: 'rgba(239,68,68,0.22)',
                border: '1px solid rgba(239,68,68,0.4)',
                color: '#fecaca',
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
                background: 'rgba(96,165,250,0.2)',
                border: '1px solid rgba(96,165,250,0.4)',
                color: '#dbeafe',
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

// ── Action tooltip (dark, to the left of the button) ───────────────

export function ActionTooltip({
  action,
  anchor,
}: {
  action: StatblockAction
  anchor: HTMLElement
}) {
  const r = anchor.getBoundingClientRect()
  const style: React.CSSProperties = {
    position: 'fixed',
    top: r.top,
    left: r.left - 12,
    transform: 'translateX(-100%)',
    width: 300,
    padding: 10,
    background: 'var(--gray-900)',
    color: '#fff',
    borderRadius: 6,
    boxShadow: 'var(--shadow-lg)',
    fontSize: 12,
    lineHeight: 1.5,
    zIndex: 100,
    pointerEvents: 'none',
  }
  return (
    <div style={style} role="tooltip">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[13px] font-semibold">{action.name}</span>
        <span
          className="ml-auto rounded text-[10px]"
          style={{
            padding: '1px 5px',
            color: '#9ca3af',
            background: 'rgba(255,255,255,0.08)',
          }}
        >
          {action.source ?? 'статблок'}
        </span>
      </div>
      <div style={{ color: '#e5e7eb' }}>
        <FormulaLine text={action.desc || '—'} />
      </div>
    </div>
  )
}

// ── Action button ──────────────────────────────────────────────────

type BtnProps = {
  action: StatblockAction
  active?: boolean
  disabled?: boolean
  onClick: (a: StatblockAction) => void
  onHover?: (a: StatblockAction | null, el: HTMLElement | null) => void
}

export function ActionButton({ action, active, disabled, onClick, onHover }: BtnProps) {
  const isArea = action.targeting === 'area'
  const TIcon = isArea ? Target : Swords

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onClick(action)}
      onMouseEnter={(e) => onHover?.(action, e.currentTarget)}
      onMouseLeave={() => onHover?.(null, null)}
      onFocus={(e) => onHover?.(action, e.currentTarget)}
      onBlur={() => onHover?.(null, null)}
      className="flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors disabled:opacity-50"
      style={{
        background: active ? 'var(--blue-50)' : '#fff',
        borderColor: active ? 'var(--blue-400)' : 'var(--gray-200)',
      }}
    >
      <TIcon
        size={14}
        strokeWidth={1.5}
        style={{ color: isArea ? 'var(--orange-500)' : 'var(--fg-2)', flexShrink: 0 }}
      />
      <span
        className="flex-1 truncate text-[13px] font-medium"
        style={{ color: 'var(--gray-900)' }}
      >
        {action.name}
      </span>
      {isArea && (
        <span
          className="font-mono text-[10px]"
          style={{ color: 'var(--fg-3)' }}
        >
          area
        </span>
      )}
      {action.cost !== undefined && action.cost > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full border"
          style={{
            padding: '1px 6px',
            background: 'var(--yellow-50)',
            borderColor: '#fde68a',
            color: 'var(--yellow-700)',
          }}
        >
          <Sparkles size={10} strokeWidth={1.5} />
          <span className="font-mono text-[10px] font-semibold">{action.cost}</span>
        </span>
      )}
    </button>
  )
}
