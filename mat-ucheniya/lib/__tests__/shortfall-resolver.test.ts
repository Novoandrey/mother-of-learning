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

describe('computeShortfall — keepGp «оставить на руках» (spec-053)', () => {
  it("owner's example A: 200 wallet, 180 cost, keep 50 → 150 own + 30 stash", () => {
    // spendable = 200 − 50 = 150 → own covers 150, borrow the 30 shortfall.
    expect(computeShortfall(200, 180, 1000, 50)).toEqual({
      shortfall: 30,
      toBorrow: 30,
      remainderNegative: 0,
    });
  });

  it("owner's example B: 300 wallet, 180 cost, keep 50 → all own, stash untouched", () => {
    // spendable = 300 − 50 = 250 ≥ 180 → no shortfall, borrow nothing.
    expect(computeShortfall(300, 180, 1000, 50)).toEqual({
      shortfall: 0,
      toBorrow: 0,
      remainderNegative: 0,
    });
  });

  it('keep above the wallet → own contributes nothing, borrow the whole cost', () => {
    // spendable = max(0, 40 − 50) = 0 → shortfall is the full 180.
    expect(computeShortfall(40, 180, 1000, 50)).toEqual({
      shortfall: 180,
      toBorrow: 180,
      remainderNegative: 0,
    });
  });

  it('keep + poor stash → borrow what the stash has, rest is residual negative', () => {
    // spendable = 100 − 50 = 50 → shortfall 130; stash only 30 → borrow 30.
    expect(computeShortfall(100, 180, 30, 50)).toEqual({
      shortfall: 130,
      toBorrow: 30,
      remainderNegative: 100,
    });
  });

  it('keepGp = 0 is byte-for-byte the original 3-arg behaviour', () => {
    expect(computeShortfall(3, 5, 100, 0)).toEqual(computeShortfall(3, 5, 100));
    expect(computeShortfall(200, 180, 1000, 0)).toEqual(
      computeShortfall(200, 180, 1000),
    );
  });

  it('negative keep is clamped to 0', () => {
    expect(computeShortfall(200, 180, 1000, -50)).toEqual(
      computeShortfall(200, 180, 1000, 0),
    );
  });
});
