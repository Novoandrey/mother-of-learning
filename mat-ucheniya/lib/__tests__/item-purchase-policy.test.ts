import { describe, expect, it } from 'vitest'

import { parseItemDefaultPrices } from '../item-default-prices'
import {
  DEFAULT_ITEM_PURCHASE_POLICY,
  approvalRequiredFor,
  chargedPriceGp,
  coefficientFor,
  normalizeRarity,
  parseItemPurchasePolicy,
  resolveBuyUnitPriceGp,
  setBuyRequiresApproval,
} from '../item-purchase-policy'

describe('parseItemPurchasePolicy', () => {
  it('returns defaults for junk input', () => {
    expect(parseItemPurchasePolicy(null)).toEqual(DEFAULT_ITEM_PURCHASE_POLICY)
    expect(parseItemPurchasePolicy(undefined)).toEqual(DEFAULT_ITEM_PURCHASE_POLICY)
    expect(parseItemPurchasePolicy('nope')).toEqual(DEFAULT_ITEM_PURCHASE_POLICY)
    expect(parseItemPurchasePolicy([1, 2])).toEqual(DEFAULT_ITEM_PURCHASE_POLICY)
  })

  it('default approval gates very-rare and legendary only', () => {
    const p = DEFAULT_ITEM_PURCHASE_POLICY
    expect(p.approvalRequired.common).toBe(false)
    expect(p.approvalRequired.uncommon).toBe(false)
    expect(p.approvalRequired.rare).toBe(false)
    expect(p.approvalRequired['very-rare']).toBe(true)
    expect(p.approvalRequired.legendary).toBe(true)
  })

  it('default coefficients are all 1', () => {
    expect(Object.values(DEFAULT_ITEM_PURCHASE_POLICY.coefficient)).toEqual([
      1, 1, 1, 1, 1,
    ])
  })

  it('back-fills missing rarity keys with defaults', () => {
    const parsed = parseItemPurchasePolicy({
      coefficient: { rare: 2 },
      approvalRequired: { rare: true },
    })
    expect(parsed.coefficient.rare).toBe(2)
    expect(parsed.coefficient.common).toBe(1) // back-filled
    expect(parsed.approvalRequired.rare).toBe(true)
    expect(parsed.approvalRequired['very-rare']).toBe(true) // default kept
  })

  it('rejects negative / non-finite coefficients, keeping the default', () => {
    const parsed = parseItemPurchasePolicy({
      coefficient: { common: -1, uncommon: Infinity, rare: 'x' },
    })
    expect(parsed.coefficient.common).toBe(1)
    expect(parsed.coefficient.uncommon).toBe(1)
    expect(parsed.coefficient.rare).toBe(1)
  })

  it('accepts a zero coefficient (free)', () => {
    const parsed = parseItemPurchasePolicy({ coefficient: { common: 0 } })
    expect(parsed.coefficient.common).toBe(0)
  })
})

describe('coefficientFor / approvalRequiredFor', () => {
  it('reads the per-rarity values', () => {
    const p = parseItemPurchasePolicy({
      coefficient: { 'very-rare': 1.5 },
      approvalRequired: { rare: true },
    })
    expect(coefficientFor(p, 'very-rare')).toBe(1.5)
    expect(approvalRequiredFor(p, 'rare')).toBe(true)
    expect(approvalRequiredFor(p, 'common')).toBe(false)
  })
})

describe('chargedPriceGp', () => {
  const p = parseItemPurchasePolicy({ coefficient: { rare: 2, 'very-rare': 1.5 } })

  it('applies the coefficient and rounds to whole gp', () => {
    expect(chargedPriceGp(40, 'rare', p)).toBe(80)
    expect(chargedPriceGp(101, 'very-rare', p)).toBe(152) // 151.5 → 152
  })

  it('coefficient 1 leaves the base untouched', () => {
    expect(chargedPriceGp(15, 'common', DEFAULT_ITEM_PURCHASE_POLICY)).toBe(15)
  })

  it('returns null when there is no base price (not buyable)', () => {
    expect(chargedPriceGp(null, 'rare', p)).toBeNull()
  })
})

describe('normalizeRarity', () => {
  it('passes through the five canonical slugs', () => {
    for (const r of ['common', 'uncommon', 'rare', 'very-rare', 'legendary']) {
      expect(normalizeRarity(r)).toBe(r)
    }
  })

  it('defaults unknown / empty rarity to common', () => {
    expect(normalizeRarity('artifact')).toBe('common')
    expect(normalizeRarity(null)).toBe('common')
    expect(normalizeRarity('')).toBe('common')
  })
})

describe('setBuyRequiresApproval (max-rarity aggregation, C-16)', () => {
  const p = DEFAULT_ITEM_PURCHASE_POLICY

  it('needs approval if any constituent rarity requires it', () => {
    expect(setBuyRequiresApproval(p, ['common', 'rare', 'very-rare'])).toBe(true)
  })

  it('auto-approves when all constituents are below threshold', () => {
    expect(setBuyRequiresApproval(p, ['common', 'uncommon', 'rare'])).toBe(false)
  })

  it('an empty set does not require approval', () => {
    expect(setBuyRequiresApproval(p, [])).toBe(false)
  })
})

describe('resolveBuyUnitPriceGp (createPurchase price resolution, C-13)', () => {
  // magic bucket priced at rare; consumable bucket priced at common.
  const defaults = parseItemDefaultPrices({
    magic: { rare: 200, 'very-rare': 1000 },
    consumable: { common: 25 },
  })
  const flat = DEFAULT_ITEM_PURCHASE_POLICY // all coefficients 1
  const doubled = parseItemPurchasePolicy({ coefficient: { rare: 2 } })

  it("uses the item's own price when present (ignores the default)", () => {
    expect(
      resolveBuyUnitPriceGp({
        priceGp: 50,
        categorySlug: 'weapon',
        rarity: 'rare',
        defaults,
        policy: flat,
      }),
    ).toBe(50)
  })

  it('applies the coefficient to the item price', () => {
    expect(
      resolveBuyUnitPriceGp({
        priceGp: 50,
        categorySlug: 'weapon',
        rarity: 'rare',
        defaults,
        policy: doubled,
      }),
    ).toBe(100)
  })

  it('falls back to the magic-bucket default for a priceless magic item', () => {
    expect(
      resolveBuyUnitPriceGp({
        priceGp: null,
        categorySlug: 'magic-item',
        rarity: 'rare',
        defaults,
        policy: flat,
      }),
    ).toBe(200)
  })

  it('routes consumables to the consumable bucket default', () => {
    expect(
      resolveBuyUnitPriceGp({
        priceGp: null,
        categorySlug: 'consumable',
        rarity: 'common',
        defaults,
        policy: flat,
      }),
    ).toBe(25)
  })

  it('applies the coefficient to a bucket default too', () => {
    expect(
      resolveBuyUnitPriceGp({
        priceGp: null,
        categorySlug: 'weapon',
        rarity: 'rare',
        defaults,
        policy: doubled,
      }),
    ).toBe(400)
  })

  it('returns null when neither an item price nor a bucket default exists', () => {
    expect(
      resolveBuyUnitPriceGp({
        priceGp: null,
        categorySlug: 'weapon',
        rarity: 'legendary', // no magic-bucket default set
        defaults,
        policy: flat,
      }),
    ).toBeNull()
  })
})
