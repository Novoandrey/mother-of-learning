import { describe, it, expect } from 'vitest'
import {
  parseScribeSettings,
  scribeRowFor,
  DEFAULT_SCRIBE_SETTINGS,
  SPELL_LEVEL_KEYS,
} from '../scribe-settings'

describe('parseScribeSettings', () => {
  it('returns defaults for undefined/garbage/null', () => {
    for (const raw of [undefined, null, 42, 'x', [], NaN]) {
      const s = parseScribeSettings(raw)
      expect(s.hoursPerDay).toBe(8)
      expect(s.hoursPerWeek).toBe(40)
      expect(s.table['3']).toEqual({ hours: 40, costGp: 500 })
      expect(s.table['9']).toEqual({ hours: 1920, costGp: 250000 })
      expect(s.table['0']).toEqual({ hours: 8, costGp: 15 })
    }
  })

  it('deep-copies defaults (no shared table aliasing)', () => {
    const a = parseScribeSettings(undefined)
    const b = parseScribeSettings(undefined)
    a.table['3'].costGp = 999
    expect(b.table['3'].costGp).toBe(500)
    expect(DEFAULT_SCRIBE_SETTINGS.table['3'].costGp).toBe(500)
  })

  it('applies per-key overrides', () => {
    const s = parseScribeSettings({
      table: { '3': { hours: 32, costGp: 600 } },
      hoursPerDay: 6,
      hoursPerWeek: 30,
    })
    expect(s.table['3']).toEqual({ hours: 32, costGp: 600 })
    expect(s.hoursPerDay).toBe(6)
    expect(s.hoursPerWeek).toBe(30)
    // untouched rows keep defaults
    expect(s.table['5']).toEqual({ hours: 160, costGp: 5000 })
  })

  it('silently falls back on invalid values, keeps valid siblings', () => {
    const s = parseScribeSettings({
      table: { '3': { hours: -1, costGp: 600 } },
      hoursPerDay: 'bad',
    })
    expect(s.table['3'].hours).toBe(40) // invalid neg → default
    expect(s.table['3'].costGp).toBe(600) // valid override kept
    expect(s.hoursPerDay).toBe(8) // invalid → default
  })

  it('covers all 10 spell levels', () => {
    expect(SPELL_LEVEL_KEYS).toHaveLength(10)
    const s = parseScribeSettings(undefined)
    for (const k of SPELL_LEVEL_KEYS) {
      expect(typeof s.table[k].hours).toBe('number')
      expect(typeof s.table[k].costGp).toBe('number')
    }
  })
})

describe('scribeRowFor', () => {
  it('returns the row for a level', () => {
    const s = parseScribeSettings(undefined)
    expect(scribeRowFor(s, 3)).toEqual({ hours: 40, costGp: 500 })
    expect(scribeRowFor(s, 0)).toEqual({ hours: 8, costGp: 15 })
  })

  it('clamps out-of-range levels to 0..9', () => {
    const s = parseScribeSettings(undefined)
    expect(scribeRowFor(s, -5)).toEqual(s.table['0'])
    expect(scribeRowFor(s, 42)).toEqual(s.table['9'])
    expect(scribeRowFor(s, 3.9)).toEqual(s.table['3']) // trunc
  })
})
