'use client'

import { Zap, Crown, Minus, Plus } from 'lucide-react'

// Counter chip: "Реакция 0/1" or "Легендарки 1/3" with +/− buttons.
// `spent` = all used up → gray out icon + numbers.

type Props = {
  label: string
  used: number
  max: number
  icon: 'zap' | 'crown'
  onDec: () => void
  onInc: () => void
  disabled?: boolean
}

export function CounterChip({ label, used, max, icon, onDec, onInc, disabled }: Props) {
  const spent = used >= max
  const IconCmp = icon === 'zap' ? Zap : Crown

  return (
    <div
      className="flex items-center gap-1.5 rounded-md border py-1 pl-2 pr-1"
      style={{
        borderColor: 'var(--gray-200)',
        background: spent ? 'var(--gray-50)' : '#fff',
      }}
    >
      <IconCmp
        size={14}
        strokeWidth={1.5}
        style={{ color: spent ? 'var(--fg-mute)' : 'var(--fg-2)' }}
      />
      <span className="text-[11px] font-medium" style={{ color: 'var(--fg-2)' }}>
        {label}
      </span>
      <span
        className="font-mono text-[12px] font-semibold tabular"
        style={{ color: spent ? 'var(--fg-mute)' : 'var(--gray-900)' }}
      >
        {used}
        <span style={{ color: 'var(--fg-3)' }} className="font-normal">
          /{max}
        </span>
      </span>
      <div className="ml-1 flex gap-[2px]">
        <button
          type="button"
          onClick={onDec}
          disabled={disabled || used <= 0}
          aria-label={`Уменьшить ${label}`}
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded border bg-white text-[12px] disabled:opacity-40"
          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-2)' }}
        >
          <Minus size={10} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={onInc}
          disabled={disabled || used >= max}
          aria-label={`Увеличить ${label}`}
          className="inline-flex h-[18px] w-[18px] items-center justify-center rounded border bg-white text-[12px] disabled:opacity-40"
          style={{ borderColor: 'var(--gray-200)', color: 'var(--fg-2)' }}
        >
          <Plus size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
