import { describe, expect, it } from 'vitest'

import { computeConsumablesCostGp } from '../expeditions'

describe('computeConsumablesCostGp (spec-055 — общак consumables spend)', () => {
  it('sums unit price × qty across priced lines', () => {
    expect(
      computeConsumablesCostGp([
        { unitPriceGp: 25, qty: 2 }, // 50
        { unitPriceGp: 10, qty: 3 }, // 30
      ]),
    ).toBe(80)
  })

  it('treats a null unit price (free-text / unpriced item) as 0', () => {
    expect(
      computeConsumablesCostGp([
        { unitPriceGp: null, qty: 5 },
        { unitPriceGp: 15, qty: 1 },
      ]),
    ).toBe(15)
  })

  it('is 0 for an empty list', () => {
    expect(computeConsumablesCostGp([])).toBe(0)
  })

  it('ignores non-positive and non-finite quantities', () => {
    expect(
      computeConsumablesCostGp([
        { unitPriceGp: 40, qty: 0 },
        { unitPriceGp: 40, qty: -3 },
        { unitPriceGp: 40, qty: Number.NaN },
        { unitPriceGp: 40, qty: 2 }, // only this one counts → 80
      ]),
    ).toBe(80)
  })

  it('ignores non-positive / non-finite unit prices', () => {
    expect(
      computeConsumablesCostGp([
        { unitPriceGp: 0, qty: 4 },
        { unitPriceGp: -10, qty: 4 },
        { unitPriceGp: Number.POSITIVE_INFINITY, qty: 4 },
        { unitPriceGp: 12, qty: 2 }, // only this one counts → 24
      ]),
    ).toBe(24)
  })

  it('rounds the total to whole gp', () => {
    // 12.5 × 3 = 37.5 → 38
    expect(computeConsumablesCostGp([{ unitPriceGp: 12.5, qty: 3 }])).toBe(38)
  })

  it('never returns NaN even when every line is unpriced', () => {
    const total = computeConsumablesCostGp([
      { unitPriceGp: null, qty: 2 },
      { unitPriceGp: null, qty: 7 },
    ])
    expect(total).toBe(0)
    expect(Number.isNaN(total)).toBe(false)
  })
})
