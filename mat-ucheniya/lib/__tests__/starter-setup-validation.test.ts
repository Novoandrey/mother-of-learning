import { describe, it, expect } from 'vitest'
import {
  validateCoinSet,
  validateStarterItems,
  isKnownWizardKey,
} from '../starter-setup-validation'

describe('validateCoinSet', () => {
  it('accepts a complete non-negative integer CoinSet', () => {
    const r = validateCoinSet({ cp: 50, sp: 1, gp: 100, pp: 0 })
    expect(r).toEqual({ ok: true, value: { cp: 50, sp: 1, gp: 100, pp: 0 } })
  })

  it('fills in zeros for missing fields', () => {
    const r = validateCoinSet({ gp: 50 })
    expect(r).toEqual({ ok: true, value: { cp: 0, sp: 0, gp: 50, pp: 0 } })
  })

  it('rejects non-object input', () => {
    expect(validateCoinSet(null).ok).toBe(false)
    expect(validateCoinSet(undefined).ok).toBe(false)
    expect(validateCoinSet(42).ok).toBe(false)
    expect(validateCoinSet('gold').ok).toBe(false)
  })

  it('rejects negative amounts', () => {
    const r = validateCoinSet({ cp: 0, sp: 0, gp: -1, pp: 0 })
    expect(r.ok).toBe(false)
  })

  it('rejects non-integer amounts', () => {
    const r = validateCoinSet({ cp: 0, sp: 0, gp: 1.5, pp: 0 })
    expect(r.ok).toBe(false)
  })

  it('rejects string amounts', () => {
    const r = validateCoinSet({ cp: 0, sp: 0, gp: '100', pp: 0 })
    expect(r.ok).toBe(false)
  })
})

describe('validateStarterItems', () => {
  it('accepts an empty array', () => {
    const r = validateStarterItems([])
    expect(r).toEqual({ ok: true, value: [] })
  })

  it('accepts a valid array with multiple items', () => {
    const r = validateStarterItems([
      { name: 'longsword', qty: 1 },
      { name: 'arrows', qty: 20 },
      { name: 'Документы на дом', qty: 1 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toHaveLength(3)
      expect(r.value[2].name).toBe('Документы на дом')
    }
  })

  it('trims whitespace from item names', () => {
    const r = validateStarterItems([{ name: '  longsword  ', qty: 1 }])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value[0].name).toBe('longsword')
  })

  it('rejects non-array', () => {
    expect(validateStarterItems(null).ok).toBe(false)
    expect(validateStarterItems({}).ok).toBe(false)
    expect(validateStarterItems('items').ok).toBe(false)
  })

  it('rejects empty item name', () => {
    const r = validateStarterItems([{ name: '', qty: 1 }])
    expect(r.ok).toBe(false)
  })

  it('rejects whitespace-only item name', () => {
    const r = validateStarterItems([{ name: '   ', qty: 1 }])
    expect(r.ok).toBe(false)
  })

  it('rejects qty = 0', () => {
    const r = validateStarterItems([{ name: 'thing', qty: 0 }])
    expect(r.ok).toBe(false)
  })

  it('rejects negative qty', () => {
    const r = validateStarterItems([{ name: 'thing', qty: -1 }])
    expect(r.ok).toBe(false)
  })

  it('rejects non-integer qty', () => {
    const r = validateStarterItems([{ name: 'thing', qty: 1.5 }])
    expect(r.ok).toBe(false)
  })

  it('rejects missing qty', () => {
    const r = validateStarterItems([{ name: 'thing' }])
    expect(r.ok).toBe(false)
  })

  it('rejects missing name', () => {
    const r = validateStarterItems([{ qty: 1 }])
    expect(r.ok).toBe(false)
  })
})

describe('isKnownWizardKey', () => {
  it('accepts all four spec-012 keys', () => {
    expect(isKnownWizardKey('starting_money')).toBe(true)
    expect(isKnownWizardKey('starting_loan')).toBe(true)
    expect(isKnownWizardKey('stash_seed')).toBe(true)
    expect(isKnownWizardKey('starting_items')).toBe(true)
  })

  it('accepts spec-013 encounter_loot key', () => {
    expect(isKnownWizardKey('encounter_loot')).toBe(true)
  })

  it('rejects arbitrary strings', () => {
    expect(isKnownWizardKey('')).toBe(false)
    expect(isKnownWizardKey('starting')).toBe(false)
    expect(isKnownWizardKey('STARTING_MONEY')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isKnownWizardKey(null)).toBe(false)
    expect(isKnownWizardKey(undefined)).toBe(false)
    expect(isKnownWizardKey(42)).toBe(false)
    expect(isKnownWizardKey({})).toBe(false)
  })
})
