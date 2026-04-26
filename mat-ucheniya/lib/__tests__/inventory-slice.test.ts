import { describe, expect, it } from 'vitest';

import { defaultDayForInventory, sliceLegsAt } from '../inventory-slice';
import type { ItemLeg } from '../inventory-aggregation';

let counter = 0;
function leg(loop: number, day: number): ItemLeg {
  counter += 1;
  return {
    transactionId: `tx-${counter}`,
    transferGroupId: null,
    itemNodeId: null,
    itemName: 'X',
    qty: 1,
    direction: 'in',
    loopNumber: loop,
    dayInLoop: day,
    createdAt: '2026-01-01T00:00:00.000Z',
    sessionId: null,
    sessionTitle: null,
    droppedByPcId: null,
    droppedByPcTitle: null,
    comment: '',
    authorUserId: null,
    authorDisplayName: null,
  };
}

// ─────────────────────────── sliceLegsAt ───────────────────────────

describe('sliceLegsAt', () => {
  const legs: ItemLeg[] = [
    leg(1, 1),
    leg(1, 5),
    leg(1, 10),
    leg(2, 1),
    leg(2, 7),
    leg(3, 3),
  ];

  it('returns legs in the loop with day_in_loop ≤ day', () => {
    expect(sliceLegsAt(legs, 1, 5)).toHaveLength(2); // (1,1) + (1,5)
    expect(sliceLegsAt(legs, 1, 10)).toHaveLength(3);
    expect(sliceLegsAt(legs, 1, 0)).toHaveLength(0);
  });

  it('strict loop equality — never includes other loops', () => {
    const out = sliceLegsAt(legs, 1, 30);
    expect(out.every((l) => l.loopNumber === 1)).toBe(true);
    expect(out).toHaveLength(3);
  });

  it('day = loop length includes everything in the loop', () => {
    expect(sliceLegsAt(legs, 2, 30)).toHaveLength(2); // (2,1) + (2,7)
  });

  it('future-day picker on a loop with no later legs returns same as last logged', () => {
    // Per FR-023 acceptance scenario 3: scrub day to 30 on a loop where
    // last logged day is 7 → same set as day 7.
    expect(sliceLegsAt(legs, 2, 7)).toHaveLength(2);
    expect(sliceLegsAt(legs, 2, 12)).toHaveLength(2);
    expect(sliceLegsAt(legs, 2, 30)).toHaveLength(2);
  });

  it('returns empty when loop has no legs', () => {
    expect(sliceLegsAt(legs, 99, 5)).toHaveLength(0);
  });

  it('returns empty when input is empty', () => {
    expect(sliceLegsAt([], 1, 5)).toEqual([]);
  });
});

// ─────────────────────────── defaultDayForInventory ───────────────────────────

describe('defaultDayForInventory', () => {
  it('uses latestDayLogged when > 0', () => {
    expect(defaultDayForInventory(7, 0)).toBe(7);
    expect(defaultDayForInventory(7, 99)).toBe(7); // even if frontier is ahead
  });

  it('falls through to frontier when latestDayLogged is 0', () => {
    expect(defaultDayForInventory(0, 5)).toBe(5);
  });

  it('falls through to frontier when latestDayLogged is null', () => {
    expect(defaultDayForInventory(null, 5)).toBe(5);
  });

  it('falls through to 1 when both null', () => {
    expect(defaultDayForInventory(null, null)).toBe(1);
  });

  it('falls through to 1 when both 0', () => {
    expect(defaultDayForInventory(0, 0)).toBe(1);
  });

  it('rejects negative latestDayLogged (treats as missing)', () => {
    expect(defaultDayForInventory(-1, 3)).toBe(3);
  });

  it('rejects negative frontier (treats as missing)', () => {
    expect(defaultDayForInventory(null, -1)).toBe(1);
  });
});
