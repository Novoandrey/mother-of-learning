'use client'

/**
 * DeathSavesCell — three green dots (successes) and three red dots (failures).
 * Click empty dot → fill it (next tick). Right-click anywhere → reset.
 * Rendered only for character nodes that are currently at 0 HP.
 * Non-PC rows get a blank cell (keeps the column slot stable for alignment).
 */

type Props = {
  successes: number
  failures: number
  visible: boolean
  onTick: (kind: 'successes' | 'failures') => void
  onReset: () => void
  disabled?: boolean
}

export function DeathSavesCell({ successes, failures, visible, onTick, onReset, disabled }: Props) {
  if (!visible) {
    return <span className="text-[10px]" style={{ color: 'var(--fg-mute)' }}>—</span>
  }

  const dead = failures >= 3
  const stable = successes >= 3

  return (
    <div
      className="flex items-center justify-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!disabled) onReset()
      }}
      title={dead ? 'Мёртв (3 провала)' : stable ? 'Стабилизирован (3 успеха)' : 'Клик — провал/успех, ПКМ — сбросить'}
    >
      <DotGroup
        filled={successes}
        color="var(--green-500)"
        emptyColor="var(--gray-200)"
        label="успех"
        onClick={() => !disabled && onTick('successes')}
        disabled={disabled || successes >= 3}
      />
      <span className="text-[10px]" style={{ color: 'var(--gray-300)' }}>|</span>
      <DotGroup
        filled={failures}
        color="var(--red-500)"
        emptyColor="var(--gray-200)"
        label="провал"
        onClick={() => !disabled && onTick('failures')}
        disabled={disabled || failures >= 3}
      />
    </div>
  )
}

function DotGroup({
  filled, color, emptyColor, label, onClick, disabled,
}: {
  filled: number
  color: string
  emptyColor: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] px-0.5 py-0.5 transition-colors disabled:cursor-default enabled:hover:bg-[var(--gray-100)]"
      title={`${label}: ${filled}/3`}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: i < filled ? color : emptyColor }}
        />
      ))}
    </button>
  )
}
