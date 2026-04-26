import { describe, expect, it } from 'vitest'

import {
  canReduceTotal,
  sharesMatchTotal,
  splitEqual,
  sumShares,
} from '../contribution-split'

describe('splitEqual', () => {
  it('clean division: 4500 / 6 → six 750s', () => {
    expect(splitEqual(4500, 6)).toEqual([750, 750, 750, 750, 750, 750])
  })

  it('non-divisible: 100 / 3 → first row gets the cent remainder', () => {
    // 100.00 = 10000 cents. 10000 / 3 = 3333 base, remainder 1.
    // Первая строка = 3334 cents = 33.34. Остальные = 33.33.
    expect(splitEqual(100, 3)).toEqual([33.34, 33.33, 33.33])
  })

  it('tiny total non-divisible: 0.05 / 3 → first gets 0.05, rest 0', () => {
    // 5 cents / 3 = 1 base, remainder 2. Первая = 3 cents = 0.03,
    // остальные = 1 cent = 0.01.
    expect(splitEqual(0.05, 3)).toEqual([0.03, 0.01, 0.01])
  })

  it('n=1: single recipient gets the full total', () => {
    expect(splitEqual(1, 1)).toEqual([1])
    expect(splitEqual(750, 1)).toEqual([750])
    expect(splitEqual(0.01, 1)).toEqual([0.01])
  })

  it('large n: 100 recipients, total 10 → 0.10 each', () => {
    // 1000 cents / 100 = 10 cents each, no remainder.
    const result = splitEqual(10, 100)
    expect(result).toHaveLength(100)
    expect(result.every((s) => s === 0.1)).toBe(true)
  })

  it('throws on n=0', () => {
    expect(() => splitEqual(100, 0)).toThrow(/positive integer/)
  })

  it('throws on negative n', () => {
    expect(() => splitEqual(100, -1)).toThrow(/positive integer/)
  })

  it('throws on non-integer n', () => {
    expect(() => splitEqual(100, 2.5)).toThrow(/positive integer/)
  })

  it('throws on zero total', () => {
    expect(() => splitEqual(0, 3)).toThrow(/positive/)
  })

  it('throws on negative total', () => {
    expect(() => splitEqual(-100, 3)).toThrow(/positive/)
  })

  it('IEEE precision: 0.1 + 0.2 case — sum back equals total', () => {
    // splitEqual(0.3, 3) — 30 cents / 3 = 10 each. Без помощи cents-
    // math мы бы получили [0.09999..., 0.1, 0.1] и т.п.
    const shares = splitEqual(0.3, 3)
    expect(shares).toEqual([0.1, 0.1, 0.1])
    expect(sumShares(shares)).toBe(0.3)
  })

  it('always sums back to total exactly (cent-precision)', () => {
    // Свойство: для любого валидного входа sum(splitEqual(t, n)) === t.
    const cases: Array<[number, number]> = [
      [4500, 6],
      [100, 3],
      [0.05, 3],
      [1, 1],
      [10, 100],
      [13.37, 7],
      [999.99, 13],
    ]
    for (const [total, n] of cases) {
      expect(sumShares(splitEqual(total, n))).toBe(total)
    }
  })
})

describe('sumShares', () => {
  it('empty array → 0', () => {
    expect(sumShares([])).toBe(0)
  })

  it('single share → identity', () => {
    expect(sumShares([750])).toBe(750)
    expect(sumShares([0.01])).toBe(0.01)
  })

  it('multi-decimal sum without IEEE drift', () => {
    expect(sumShares([0.1, 0.2])).toBe(0.3)
    expect(sumShares([33.34, 33.33, 33.33])).toBe(100)
    expect(sumShares([100.01, 100.02, 100.03])).toBe(300.06)
  })
})

describe('sharesMatchTotal', () => {
  it('exact match: true', () => {
    expect(sharesMatchTotal([750, 750, 750, 750, 750, 750], 4500)).toBe(true)
    expect(sharesMatchTotal([33.34, 33.33, 33.33], 100)).toBe(true)
  })

  it('off by one cent: false', () => {
    expect(sharesMatchTotal([33.33, 33.33, 33.33], 100)).toBe(false)
  })

  it('IEEE float drift handled: 0.1 + 0.2 vs 0.3 → true', () => {
    expect(sharesMatchTotal([0.1, 0.2], 0.3)).toBe(true)
  })

  it('empty shares vs 0: depends on total', () => {
    // Edge case: total > 0, shares = [] → mismatch.
    expect(sharesMatchTotal([], 100)).toBe(false)
  })
})

describe('canReduceTotal', () => {
  it('newTotal ≥ paidSum: ok', () => {
    const result = canReduceTotal(1000, [
      { share: 300, paid: true },
      { share: 400, paid: false },
    ])
    expect(result.ok).toBe(true)
  })

  it('newTotal < paidSum: rejected with reason and paidSum', () => {
    const result = canReduceTotal(500, [
      { share: 300, paid: true },
      { share: 400, paid: true },
      { share: 100, paid: false },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.paidSum).toBe(700)
      expect(result.reason).toMatch(/собрано/)
    }
  })

  it('all paid, newTotal = current total: ok', () => {
    const result = canReduceTotal(1000, [
      { share: 500, paid: true },
      { share: 500, paid: true },
    ])
    expect(result.ok).toBe(true)
  })

  it('empty participants: ok (paidSum is 0)', () => {
    expect(canReduceTotal(100, []).ok).toBe(true)
  })

  it('all unpaid: any newTotal ≥ 0 ok', () => {
    const result = canReduceTotal(1, [
      { share: 500, paid: false },
      { share: 500, paid: false },
    ])
    expect(result.ok).toBe(true)
  })

  it('cent-precision boundary: newTotal exactly equal paidSum → ok', () => {
    // 33.34 + 33.33 = 66.67. newTotal = 66.67 ровно.
    const result = canReduceTotal(66.67, [
      { share: 33.34, paid: true },
      { share: 33.33, paid: true },
      { share: 33.33, paid: false },
    ])
    expect(result.ok).toBe(true)
  })

  it('cent-precision boundary: newTotal off by 0.01 below → not ok', () => {
    const result = canReduceTotal(66.66, [
      { share: 33.34, paid: true },
      { share: 33.33, paid: true },
    ])
    expect(result.ok).toBe(false)
  })
})
