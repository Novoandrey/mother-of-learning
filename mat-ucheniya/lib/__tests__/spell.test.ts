import { describe, it, expect } from 'vitest'
import { parseSpellLevel, spellLevelLabel, scrollTitle } from '../spell'
import { maxSpellLevel } from '../party-level'

describe('parseSpellLevel', () => {
  it('parses numbers in 0..9', () => {
    expect(parseSpellLevel(0)).toBe(0)
    expect(parseSpellLevel(3)).toBe(3)
    expect(parseSpellLevel(9)).toBe(9)
    expect(parseSpellLevel(3.7)).toBe(3) // trunc
  })
  it('parses strings incl. «Заговор»/cantrip', () => {
    expect(parseSpellLevel('3')).toBe(3)
    expect(parseSpellLevel('Заговор')).toBe(0)
    expect(parseSpellLevel('cantrip')).toBe(0)
  })
  it('returns null for unknown/out-of-range', () => {
    expect(parseSpellLevel(10)).toBeNull()
    expect(parseSpellLevel(-1)).toBeNull()
    expect(parseSpellLevel('')).toBeNull()
    expect(parseSpellLevel(null)).toBeNull()
    expect(parseSpellLevel({})).toBeNull()
  })
})

describe('spellLevelLabel + scrollTitle', () => {
  it('labels level', () => {
    expect(spellLevelLabel(0)).toBe('заговор')
    expect(spellLevelLabel(3)).toBe('3 ур.')
  })
  it('builds scroll title', () => {
    expect(scrollTitle('Огненный шар', 3)).toBe('Свиток: Огненный шар (3 ур.)')
    expect(scrollTitle('  Свет  ', 0)).toBe('Свиток: Свет (заговор)')
  })
})

describe('maxSpellLevel', () => {
  it('full-caster progression min(9, ceil(pl/2))', () => {
    expect(maxSpellLevel(1)).toBe(1)
    expect(maxSpellLevel(9)).toBe(5) // party 9 → 5th circle
    expect(maxSpellLevel(17)).toBe(9)
    expect(maxSpellLevel(20)).toBe(9)
  })
})
