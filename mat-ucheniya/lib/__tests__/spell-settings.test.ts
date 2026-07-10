import { describe, it, expect } from 'vitest'
import {
  parseSpellSettings,
  reprepCostGp,
  copyCostGp,
  copyHours,
  DEFAULT_SPELL_SETTINGS,
} from '../spell-settings'

describe('parseSpellSettings', () => {
  it('returns defaults for undefined/garbage', () => {
    for (const raw of [undefined, null, 7, 'x', []]) {
      expect(parseSpellSettings(raw)).toEqual(DEFAULT_SPELL_SETTINGS)
    }
    expect(DEFAULT_SPELL_SETTINGS).toEqual({
      reprepGpPerLevel: 50,
      copyGpPerLevel: 50,
      copyHoursPerLevel: 2,
    })
  })

  it('applies per-key overrides, falls back on invalid', () => {
    const s = parseSpellSettings({ reprepGpPerLevel: 75, copyGpPerLevel: -1 })
    expect(s.reprepGpPerLevel).toBe(75)
    expect(s.copyGpPerLevel).toBe(50) // invalid neg → default
    expect(s.copyHoursPerLevel).toBe(2) // missing → default
  })
})

describe('spell verb cost helpers', () => {
  const s = parseSpellSettings(undefined)
  it('reprep = 50 × level, cantrip free', () => {
    expect(reprepCostGp(s, 0)).toBe(0)
    expect(reprepCostGp(s, 3)).toBe(150)
    expect(reprepCostGp(s, 9)).toBe(450)
  })
  it('copy = 50 × level, cantrip free', () => {
    expect(copyCostGp(s, 0)).toBe(0)
    expect(copyCostGp(s, 5)).toBe(250)
  })
  it('copy hours = 2 × level', () => {
    expect(copyHours(s, 0)).toBe(0)
    expect(copyHours(s, 4)).toBe(8)
  })
})
