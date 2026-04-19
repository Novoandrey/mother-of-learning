'use client'

import { Zap, Crown, Sparkles, Minus, Plus } from 'lucide-react'

// Resource-pool chip. Shows REMAINING / MAX so it reads like any pool
// (HP, spell slots, sorcery points, action surge charges). `−` spends
// one, `+` restores one (undo / long rest). When `remaining === 0` the
// chip greys out.
//
// Storage is kept as "used" (count of spent charges) so diffs are tiny
// and negative values are impossible. UI converts via remaining = max − used.

type Props = {
  label: string
  used: number
  max: number
  icon: 'zap' | 'crown' | 'sparkles'
  /** Spend one charge (callbacks are in "used" semantics for DB parity). */
  onSpend: () => void
  /** Restore one charge. */
  onRestore: () => void
  disabled?: boolean
}

export function CounterChip({ label, used, max, icon, onSpend, onRestore, disabled }: Props) {
  const remaining = Math.max(0, max - used)
  const exhausted = remaining === 0
  const IconCmp = icon === 'zap' ? Zap : icon === 'crown' ? Crown : Sparkles

  return (
    <div
      className="flex items-center gap-1.5 rounded-md border py-1 pl-2 pr-1"
      style={{
        borderColor: 'var(--gray-200)',
        background: exhausted ? 'var(--gray-50)' : '#fff',
      }}
      title={`${label}: осталось ${remaining} из ${max}`}
    >
      <IconCmp
        size={14}
        strokeWidth={1.5}
        style={{ color: exhausted ? 'var(--fg-mute)' : 'var(--fg-2)' }}
      />
      <span className="text-[11px] font-medium" style={{ color: 'var(--fg-2)' }}>
        {label}
      </span>
      <span
        className="font-mono text-[12px] font-semibold tabular"
        style={{ color: exhausted ? 'var(--fg-mute)' : 'var(--gray-900)' }}
      >
        {remaining}
        <span style={{ color: 'var(--fg-3)' }} className="font-normal">
          /{max}
        </span>
      </span>
      <div className="ml-1 flex gap-[2px]">
        {/* − = spend one (the primary button — most frequent action) */}
        <button
          type="button"
          onClick={onSpend}
          disabled={disabled || exhausted}
          aria-label={`Потратить: ${label}`}
          title="Потратить"
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded border bg-white text-[12px] disabled:opacity-40"
          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-2)' }}
        >
          <Minus size={10} strokeWidth={2} />
        </button>
        {/* + = restore / undo */}
        <button
          type="button"
          onClick={onRestore}
          disabled={disabled || used <= 0}
          aria-label={`Восстановить: ${label}`}
          title="Восстановить"
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded border bg-white text-[12px] disabled:opacity-40"
          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-2)' }}
        >
          <Plus size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
