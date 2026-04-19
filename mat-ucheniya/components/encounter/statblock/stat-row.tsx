'use client'

import { abilityMod, formatMod, type AbilityScores } from '@/lib/statblock'

const KEYS: [keyof AbilityScores, string][] = [
  ['str', 'STR'],
  ['dex', 'DEX'],
  ['con', 'CON'],
  ['int', 'INT'],
  ['wis', 'WIS'],
  ['cha', 'CHA'],
]

type Props = {
  stats: AbilityScores
}

export function StatRow({ stats }: Props) {
  return (
    <div
      className="grid overflow-hidden rounded-md border bg-white"
      style={{ gridTemplateColumns: 'repeat(6, 1fr)', borderColor: 'var(--gray-200)' }}
    >
      {KEYS.map(([k, lbl], i) => {
        const v = stats[k]
        const mod = abilityMod(v)
        return (
          <div
            key={k}
            className="py-1.5 text-center"
            style={{
              borderLeft: i === 0 ? 'none' : '1px solid var(--gray-200)',
            }}
          >
            <div
              className="font-semibold tracking-wider"
              style={{ fontSize: 9, color: 'var(--fg-3)', letterSpacing: '0.08em' }}
            >
              {lbl}
            </div>
            <div
              className="mt-0.5 font-mono font-bold tabular"
              style={{ fontSize: 14, color: 'var(--gray-900)' }}
            >
              {v}
            </div>
            <div className="font-mono tabular" style={{ fontSize: 11, color: 'var(--fg-2)' }}>
              {formatMod(mod)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
