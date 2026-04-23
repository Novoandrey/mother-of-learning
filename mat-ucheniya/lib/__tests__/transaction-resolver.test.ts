import { describe, it, expect } from 'vitest';
import {
  DENOMINATIONS,
  GP_WEIGHT,
  aggregateGp,
  resolveSpend,
  resolveEarn,
  signedCoinsToStored,
} from '../transaction-resolver';
import type { CoinSet } from '../transactions';

const Z: CoinSet = { cp: 0, sp: 0, gp: 0, pp: 0 };

describe('DENOMINATIONS / GP_WEIGHT', () => {
  it('orders smallest → largest', () => {
    expect(DENOMINATIONS).toEqual(['cp', 'sp', 'gp', 'pp']);
  });

  it('has standard 5e gp ratios', () => {
    expect(GP_WEIGHT).toEqual({ cp: 0.01, sp: 0.1, gp: 1, pp: 10 });
  });
});

describe('aggregateGp', () => {
  it('sums per-denom contributions', () => {
    expect(aggregateGp({ cp: 100, sp: 20, gp: 2, pp: 0 })).toBe(5);
  });

  it('handles all-zero', () => {
    expect(aggregateGp(Z)).toBe(0);
  });

  it('handles platinum-heavy', () => {
    expect(aggregateGp({ cp: 0, sp: 0, gp: 0, pp: 10 })).toBe(100);
  });

  it('is sign-preserving', () => {
    expect(aggregateGp({ cp: -100, sp: 0, gp: 0, pp: 0 })).toBeCloseTo(-1);
  });
});

describe('resolveSpend', () => {
  it('exact match 500cp for 5gp', () => {
    expect(resolveSpend({ ...Z, cp: 500 }, 5)).toEqual({ cp: -500, sp: 0, gp: 0, pp: 0 });
  });

  it('small-first partial: 100cp + 1gp for 2gp', () => {
    // 100cp = 1gp, then 1gp from gp pile. No platinum breaking.
    expect(resolveSpend({ ...Z, cp: 100, gp: 1 }, 2)).toEqual({
      cp: -100, sp: 0, gp: -1, pp: 0,
    });
  });

  it('never breaks a larger coin (1pp, target 5gp → take nothing)', () => {
    expect(resolveSpend({ ...Z, pp: 1 }, 5)).toEqual(Z);
  });

  it('takes the full large coin if target allows (1pp, target 10gp)', () => {
    expect(resolveSpend({ ...Z, pp: 1 }, 10)).toEqual({ cp: 0, sp: 0, gp: 0, pp: -1 });
  });

  it('insufficient holdings → partial (50cp for 5gp)', () => {
    expect(resolveSpend({ ...Z, cp: 50 }, 5)).toEqual({ cp: -50, sp: 0, gp: 0, pp: 0 });
  });

  it('earn path: resolveSpend with zero target → empty', () => {
    expect(resolveSpend({ ...Z, gp: 100 }, 0)).toEqual(Z);
  });

  it('cp-precision rounding for sub-cp fractions (0.015 → 2 cp)', () => {
    // 0.015 gp rounds to 0.02 gp = 2 cp (Math.round half-up)
    expect(resolveSpend({ ...Z, cp: 10 }, 0.015)).toEqual({ cp: -2, sp: 0, gp: 0, pp: 0 });
  });

  it('spans multiple denoms smallest-first', () => {
    // holdings: 50cp (0.5gp) + 3sp (0.3gp) + 2gp = 2.8gp total
    // target: 1gp → take 50cp (0.5gp), 3sp (0.3gp) = 0.8gp, still need 0.2gp
    // gp: floor(20cp/100cp) = 0 (can't take whole gp for < 1gp remaining)
    expect(resolveSpend({ cp: 50, sp: 3, gp: 2, pp: 0 }, 1)).toEqual({
      cp: -50, sp: -3, gp: 0, pp: 0,
    });
  });
});

describe('resolveEarn', () => {
  it('credits to gp pile', () => {
    expect(resolveEarn(5)).toEqual({ cp: 0, sp: 0, gp: 5, pp: 0 });
  });

  it('rounds sub-cp precision away', () => {
    expect(resolveEarn(7.505)).toEqual({ cp: 0, sp: 0, gp: 7.51, pp: 0 });
    expect(resolveEarn(1.001)).toEqual({ cp: 0, sp: 0, gp: 1, pp: 0 });
  });
});

describe('signedCoinsToStored', () => {
  it('identity when negate=false', () => {
    const c: CoinSet = { cp: 1, sp: 2, gp: 3, pp: 4 };
    expect(signedCoinsToStored(false, c)).toEqual(c);
  });

  it('negates every slot when negate=true', () => {
    expect(signedCoinsToStored(true, { cp: 1, sp: 2, gp: 3, pp: 4 })).toEqual({
      cp: -1, sp: -2, gp: -3, pp: -4,
    });
  });

  it('converts -0 to +0 on negation', () => {
    const out = signedCoinsToStored(true, Z);
    // Object.is(-0, 0) is false, Object.is(0, 0) is true — strict check
    expect(Object.is(out.cp, 0)).toBe(true);
    expect(Object.is(out.sp, 0)).toBe(true);
    expect(Object.is(out.gp, 0)).toBe(true);
    expect(Object.is(out.pp, 0)).toBe(true);
  });
});
