import { describe, expect, it } from 'vitest'

import { computeSoldGp, netStashQty } from '../resources'

describe('computeSoldGp (spec-055 — resource sale income)', () => {
  it('multiplies nominal price by quantity', () => {
    expect(computeSoldGp(3000, 2)).toBe(6000)
    expect(computeSoldGp(300, 1)).toBe(300)
  })

  it('rounds fractional totals to whole gp', () => {
    // 300.5 × 3 = 901.5 → 902
    expect(computeSoldGp(300.5, 3)).toBe(902)
  })

  it('is 0 for non-positive or non-finite price/qty (never NaN, never negative)', () => {
    expect(computeSoldGp(0, 5)).toBe(0)
    expect(computeSoldGp(-100, 5)).toBe(0)
    expect(computeSoldGp(100, 0)).toBe(0)
    expect(computeSoldGp(100, -2)).toBe(0)
    expect(computeSoldGp(Number.NaN, 2)).toBe(0)
    expect(computeSoldGp(100, Number.POSITIVE_INFINITY)).toBe(0)
  })
})

describe('netStashQty (spec-055 — net общак holdings)', () => {
  it('sums signed item_qty (deposits +, withdrawals −)', () => {
    expect(netStashQty([{ item_qty: 5 }, { item_qty: 3 }, { item_qty: -2 }])).toBe(6)
  })

  it('is 0 for an empty list', () => {
    expect(netStashQty([])).toBe(0)
  })

  it('nets to exactly zero when fully withdrawn', () => {
    expect(netStashQty([{ item_qty: 4 }, { item_qty: -4 }])).toBe(0)
  })

  it('ignores non-finite quantities', () => {
    expect(netStashQty([{ item_qty: 5 }, { item_qty: Number.NaN }])).toBe(5)
  })
})
