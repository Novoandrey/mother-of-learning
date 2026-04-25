import { describe, expect, it } from 'vitest'

import {
  greedyDenominations,
  splitCoinsEvenly,
  type CoinTotals,
} from '../coin-split'

const Z: CoinTotals = { cp: 0, sp: 0, gp: 0, pp: 0 }

describe('splitCoinsEvenly', () => {
  it('returns [] for zero recipients', () => {
    expect(splitCoinsEvenly({ cp: 0, sp: 0, gp: 30, pp: 0 }, 0)).toEqual([])
  })

  it('returns [] for negative recipient count (defensive)', () => {
    expect(splitCoinsEvenly({ cp: 0, sp: 0, gp: 30, pp: 0 }, -1)).toEqual([])
  })

  it('1 recipient gets the full amount, denominations preserved when clean', () => {
    // 30gp = 3000cp = 3pp (greedy goes to largest).
    expect(splitCoinsEvenly({ cp: 0, sp: 0, gp: 30, pp: 0 }, 1)).toEqual([
      { cp: 0, sp: 0, gp: 0, pp: 3 },
    ])
  })

  it('2 recipients split 30gp → 1pp + 5gp each (clean half)', () => {
    expect(splitCoinsEvenly({ cp: 0, sp: 0, gp: 30, pp: 0 }, 2)).toEqual([
      { cp: 0, sp: 0, gp: 5, pp: 1 },
      { cp: 0, sp: 0, gp: 5, pp: 1 },
    ])
  })

  it('uneven 31gp / 3 PCs: PC0 gets remainder cp, sums match input', () => {
    // 31gp = 3100cp / 3 = 1033 rem 1.
    // PC0 = 1034cp = 1pp + 0gp + 3sp + 4cp
    // PC1 = 1033cp = 1pp + 0gp + 3sp + 3cp
    // PC2 = 1033cp = 1pp + 0gp + 3sp + 3cp
    const out = splitCoinsEvenly({ cp: 0, sp: 0, gp: 31, pp: 0 }, 3)
    expect(out).toEqual([
      { cp: 4, sp: 3, gp: 0, pp: 1 },
      { cp: 3, sp: 3, gp: 0, pp: 1 },
      { cp: 3, sp: 3, gp: 0, pp: 1 },
    ])
    // sanity: total cp matches input
    const sumCp = out.reduce(
      (s, r) => s + r.cp + 10 * r.sp + 100 * r.gp + 1000 * r.pp,
      0,
    )
    expect(sumCp).toBe(3100)
  })

  it('4 recipients with mixed denominations: 1pp + 5gp + 5sp + 5cp = 1555cp', () => {
    // 1555 / 4 = 388 rem 3. PC0/1/2 get 389, PC3 gets 388.
    // 389cp = 0pp + 3gp + 8sp + 9cp
    // 388cp = 0pp + 3gp + 8sp + 8cp
    expect(
      splitCoinsEvenly({ cp: 5, sp: 5, gp: 5, pp: 1 }, 4),
    ).toEqual([
      { cp: 9, sp: 8, gp: 3, pp: 0 },
      { cp: 9, sp: 8, gp: 3, pp: 0 },
      { cp: 9, sp: 8, gp: 3, pp: 0 },
      { cp: 8, sp: 8, gp: 3, pp: 0 },
    ])
  })

  it('zero amount across N recipients → N rows of all zeros', () => {
    expect(splitCoinsEvenly(Z, 3)).toEqual([Z, Z, Z])
  })

  it('pp-only clean split: 4pp / 2 = 2pp each', () => {
    expect(splitCoinsEvenly({ cp: 0, sp: 0, gp: 0, pp: 4 }, 2)).toEqual([
      { cp: 0, sp: 0, gp: 0, pp: 2 },
      { cp: 0, sp: 0, gp: 0, pp: 2 },
    ])
  })

  it('cp-only odd split distributes single cp to first recipients', () => {
    // 5cp / 3 = 1 rem 2. PC0=2cp, PC1=2cp, PC2=1cp.
    expect(splitCoinsEvenly({ cp: 5, sp: 0, gp: 0, pp: 0 }, 3)).toEqual([
      { cp: 2, sp: 0, gp: 0, pp: 0 },
      { cp: 2, sp: 0, gp: 0, pp: 0 },
      { cp: 1, sp: 0, gp: 0, pp: 0 },
    ])
  })

  it('total preservation invariant: sum of split equals input across many shapes', () => {
    const cases: { totals: CoinTotals; n: number }[] = [
      { totals: { cp: 7, sp: 13, gp: 41, pp: 2 }, n: 5 },
      { totals: { cp: 99, sp: 99, gp: 99, pp: 9 }, n: 7 },
      { totals: { cp: 1, sp: 0, gp: 0, pp: 0 }, n: 1 },
    ]
    for (const c of cases) {
      const out = splitCoinsEvenly(c.totals, c.n)
      const totalIn =
        c.totals.cp + 10 * c.totals.sp + 100 * c.totals.gp + 1000 * c.totals.pp
      const totalOut = out.reduce(
        (s, r) => s + r.cp + 10 * r.sp + 100 * r.gp + 1000 * r.pp,
        0,
      )
      expect(totalOut).toBe(totalIn)
      expect(out).toHaveLength(c.n)
    }
  })
})

describe('greedyDenominations', () => {
  it('zero stays zero', () => {
    expect(greedyDenominations(0)).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 })
  })

  it('1234 cp = 1pp + 2gp + 3sp + 4cp', () => {
    expect(greedyDenominations(1234)).toEqual({ cp: 4, sp: 3, gp: 2, pp: 1 })
  })

  it('exact thousand → all pp', () => {
    expect(greedyDenominations(2000)).toEqual({ cp: 0, sp: 0, gp: 0, pp: 2 })
  })

  it('99 cp = 9sp + 9cp (no rounding)', () => {
    expect(greedyDenominations(99)).toEqual({ cp: 9, sp: 9, gp: 0, pp: 0 })
  })
})
