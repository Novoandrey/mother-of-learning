import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CRAFT_SETTINGS,
  parseCraftSettings,
  rateForPb,
  craftRowFor,
  weaveSurchargeGp,
  requiredRateHours,
} from '@/lib/craft-settings'
import { parsePartyLevel, pbForLevel } from '@/lib/party-level'

describe('parsePartyLevel', () => {
  it('parses numbers and numeric strings', () => {
    expect(parsePartyLevel(9)).toBe(9)
    expect(parsePartyLevel('9')).toBe(9)
    expect(parsePartyLevel(' 12 ')).toBe(12)
    expect(parsePartyLevel(9.7)).toBe(9)
  })
  it('returns null when missing/invalid — craft must refuse, not default', () => {
    expect(parsePartyLevel(undefined)).toBeNull()
    expect(parsePartyLevel(null)).toBeNull()
    expect(parsePartyLevel('')).toBeNull()
    expect(parsePartyLevel('abc')).toBeNull()
    expect(parsePartyLevel(0)).toBeNull()
    expect(parsePartyLevel(-3)).toBeNull()
  })
})

describe('pbForLevel — standard D&D PB', () => {
  it('maps level bands to PB', () => {
    expect(pbForLevel(1)).toBe(2)
    expect(pbForLevel(4)).toBe(2)
    expect(pbForLevel(5)).toBe(3)
    expect(pbForLevel(8)).toBe(3)
    expect(pbForLevel(9)).toBe(4) // текущая петля 7 → уровень 9 → БМ 4
    expect(pbForLevel(12)).toBe(4)
    expect(pbForLevel(13)).toBe(5)
    expect(pbForLevel(17)).toBe(6)
    expect(pbForLevel(20)).toBe(6)
  })
})

describe('parseCraftSettings', () => {
  it('falls back to full defaults on garbage', () => {
    for (const raw of [undefined, null, 'x', 42, []]) {
      expect(parseCraftSettings(raw)).toEqual(DEFAULT_CRAFT_SETTINGS)
    }
  })
  it('overrides key-by-key, keeps the rest default', () => {
    const s = parseCraftSettings({
      ratePerPbGpHour: { '4': 60, '9': 999, '3': -5 },
      rarity: { rare: { workCostGp: 300 } },
      weave: { cellCap: 6 },
      shopMarkup: 1.5,
    })
    expect(s.ratePerPbGpHour['4']).toBe(60)
    expect(s.ratePerPbGpHour['3']).toBe(10) // -5 отвергнут
    expect(s.rarity.rare.workCostGp).toBe(300)
    expect(s.rarity.rare.fullCostGp).toBe(500) // не тронут
    expect(s.rarity.legendary).toEqual(DEFAULT_CRAFT_SETTINGS.rarity.legendary)
    expect(s.weave.cellCap).toBe(6)
    expect(s.weave.perLevelStepGp).toBe(37.5)
    expect(s.shopMarkup).toBe(1.5)
  })
  it('custom.minPartyLevel accepts explicit null (no gate)', () => {
    expect(parseCraftSettings({ custom: { minPartyLevel: null } }).custom.minPartyLevel).toBeNull()
    expect(parseCraftSettings({ custom: { minPartyLevel: 5 } }).custom.minPartyLevel).toBe(5)
  })
})

describe('таблицы Andrey (дефолты)', () => {
  const s = DEFAULT_CRAFT_SETTINGS
  it('ставка зм/час по БМ', () => {
    expect(rateForPb(s, 2)).toBe(3.125)
    expect(rateForPb(s, 4)).toBe(50)
    expect(rateForPb(s, 6)).toBe(100)
    expect(rateForPb(s, 1)).toBe(3.125) // клампится вниз
    expect(rateForPb(s, 7)).toBe(100) // клампится вверх
  })
  it('цены/уровни по редкостям + кастомная (rarity=null)', () => {
    expect(craftRowFor(s, 'common')).toEqual({ fullCostGp: 100, workCostGp: 50, minPartyLevel: 3 })
    expect(craftRowFor(s, 'very-rare')).toEqual({ fullCostGp: 5000, workCostGp: 2500, minPartyLevel: 11 })
    expect(craftRowFor(s, null)).toEqual({ fullCostGp: 500, workCostGp: 250, minPartyLevel: null })
  })
  it('время = рабочая цена / ставка (колонка E при БМ 4)', () => {
    const rate = rateForPb(s, pbForLevel(9)) // уровень 9 → БМ 4 → 50
    expect(requiredRateHours(craftRowFor(s, 'common').workCostGp, rate)).toBe(1)
    expect(requiredRateHours(craftRowFor(s, 'uncommon').workCostGp, rate)).toBe(1.5)
    expect(requiredRateHours(craftRowFor(s, 'rare').workCostGp, rate)).toBe(5)
    expect(requiredRateHours(craftRowFor(s, 'very-rare').workCostGp, rate)).toBe(50)
    expect(requiredRateHours(craftRowFor(s, 'legendary').workCostGp, rate)).toBe(500)
  })
  it('вплетение: оба датапоинта Andrey сходятся', () => {
    // плащ: база 75 + надбавка(ур.1)=75 → 150
    expect(75 + weaveSurchargeGp(s, 1)).toBe(150)
    // кольцо: база 75 + надбавка(ур.3)=150 → 225
    expect(75 + weaveSurchargeGp(s, 3)).toBe(225)
    expect(weaveSurchargeGp(s, 0)).toBe(0)
  })
})
