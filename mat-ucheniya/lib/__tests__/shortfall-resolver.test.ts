import { describe, it, expect } from 'vitest';
import { computeShortfall } from '../transaction-resolver';

describe('computeShortfall', () => {
  it('case 1 — wallet covers expense → all zeros', () => {
    expect(computeShortfall(/* wallet */ 10, /* expense */ 5, /* stash */ 50)).toEqual({
      shortfall: 0,
      toBorrow: 0,
      remainderNegative: 0,
    });
  });

  it('case 2 — shortfall, stash rich → borrow full shortfall, no remainder', () => {
    // wallet 3, expense 5 → shortfall 2; stash has 100 → borrow 2 all of it.
    expect(computeShortfall(3, 5, 100)).toEqual({
      shortfall: 2,
      toBorrow: 2,
      remainderNegative: 0,
    });
  });

  it('case 3 — shortfall, stash poor → partial borrow + residual negative', () => {
    // wallet 3, expense 5 → shortfall 2; stash has 1 → borrow 1, remainder 1.
    expect(computeShortfall(3, 5, 1)).toEqual({
      shortfall: 2,
      toBorrow: 1,
      remainderNegative: 1,
    });
  });

  it('case 4 — shortfall, stash empty → nothing to borrow', () => {
    expect(computeShortfall(3, 5, 0)).toEqual({
      shortfall: 2,
      toBorrow: 0,
      remainderNegative: 2,
    });
  });

  it('case 5 — zero expense → all zeros, no NaN', () => {
    const r = computeShortfall(10, 0, 0);
    expect(r).toEqual({ shortfall: 0, toBorrow: 0, remainderNegative: 0 });
    expect(Number.isNaN(r.shortfall)).toBe(false);
    expect(Number.isNaN(r.toBorrow)).toBe(false);
    expect(Number.isNaN(r.remainderNegative)).toBe(false);
  });

  it('accepts signed or magnitude expense — both produce the same result', () => {
    // UI may pass `-5` (signed) or `5` (magnitude). Function must
    // treat them identically.
    expect(computeShortfall(3, -5, 100)).toEqual(computeShortfall(3, 5, 100));
  });

  it('negative stash input is clamped to 0 (defensive)', () => {
    // Shouldn't happen in practice (stash wallet sums >= 0 except for
    // data-integrity issues) but the function must stay well-defined.
    expect(computeShortfall(3, 5, -10)).toEqual({
      shortfall: 2,
      toBorrow: 0,
      remainderNegative: 2,
    });
  });
});
