'use client'

// HP bar with optional temp-HP overlay.
// Color thresholds (design doc): >50% green, 25-50% yellow, 1-25% red, 0 gray.
// `size='big'` used in statblock panel header. `size='sm'` used in target picker.

type Props = {
  current: number
  max: number
  tempHp?: number
  size?: 'sm' | 'md' | 'big'
}

export function HpBar({ current, max, tempHp = 0, size = 'md' }: Props) {
  const safeMax = max > 0 ? max : 1
  const pct = Math.max(0, Math.min(100, (current / safeMax) * 100))
  const tempPct = tempHp > 0 ? Math.max(0, Math.min(100 - pct, (tempHp / safeMax) * 100)) : 0

  const color =
    pct > 50 ? 'var(--green-500)'
    : pct > 25 ? 'var(--yellow-500)'
    : pct > 0 ? 'var(--red-500)'
    : 'var(--gray-300)'

  const numSize = size === 'big' ? 24 : size === 'sm' ? 11 : 14
  const subSize = size === 'big' ? 14 : size === 'sm' ? 10 : 12
  const barH = size === 'big' ? 7 : 4

  return (
    <div className="w-full">
      <div className="flex items-baseline gap-1 font-mono tabular">
        <span
          style={{ fontSize: numSize, color: current === 0 ? 'var(--red-600)' : 'var(--gray-900)' }}
          className="font-bold"
        >
          {current}
        </span>
        <span style={{ fontSize: subSize, color: 'var(--fg-3)' }}>/{max}</span>
        {tempHp > 0 && (
          <span
            className="ml-1 rounded font-semibold"
            style={{
              fontSize: 11,
              padding: '0 5px',
              background: '#e0f2fe',
              color: '#0369a1',
            }}
          >
            +{tempHp}
          </span>
        )}
      </div>
      <div
        className="mt-1 flex overflow-hidden rounded-full"
        style={{ height: barH, background: 'var(--gray-200)' }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            transition: 'width 220ms var(--ease)',
          }}
        />
        {tempPct > 0 && (
          <div style={{ height: '100%', width: `${tempPct}%`, background: '#7dd3fc' }} />
        )}
      </div>
    </div>
  )
}
