import { describe, it, expect } from 'vitest';
import { aggregateStashLegs, type StashItemLeg } from '../stash-aggregation';

// ----- fixtures --------------------------------------------------------------

/**
 * Minimal leg factory. All the denormalised expand-row fields (session,
 * dropped-by, author) default to `null` because these tests only care
 * about the aggregation math — rendering is a UI concern.
 */
function leg(
  partial: Pick<StashItemLeg, 'itemName' | 'qty' | 'direction'> &
    Partial<StashItemLeg>,
): StashItemLeg {
  return {
    transactionId: partial.transactionId ?? crypto.randomUUID(),
    transferGroupId: partial.transferGroupId ?? null,
    itemName: partial.itemName,
    qty: partial.qty,
    direction: partial.direction,
    loopNumber: partial.loopNumber ?? 1,
    dayInLoop: partial.dayInLoop ?? 1,
    createdAt: partial.createdAt ?? '2026-04-24T12:00:00.000Z',
    sessionId: partial.sessionId ?? null,
    sessionTitle: partial.sessionTitle ?? null,
    droppedByPcId: partial.droppedByPcId ?? null,
    droppedByPcTitle: partial.droppedByPcTitle ?? null,
    comment: partial.comment ?? '',
    authorUserId: partial.authorUserId ?? null,
    authorDisplayName: partial.authorDisplayName ?? null,
  };
}

// ----- 7 cases from the plan's `## Testing` section --------------------------

describe('aggregateStashLegs', () => {
  it('case 1 — empty input → empty output', () => {
    expect(aggregateStashLegs([])).toEqual([]);
  });

  it('case 2 — single incoming leg → qty 1, one instance', () => {
    const result = aggregateStashLegs([
      leg({ itemName: 'silver amulet', qty: 1, direction: 'in' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].itemName).toBe('silver amulet');
    expect(result[0].qty).toBe(1);
    expect(result[0].instances).toHaveLength(1);
    expect(result[0].warning).toBeUndefined();
  });

  it('case 3 — two incoming same name → qty aggregated, two instances', () => {
    const result = aggregateStashLegs([
      leg({ itemName: 'potion', qty: 1, direction: 'in', createdAt: '2026-04-23T12:00:00.000Z' }),
      leg({ itemName: 'potion', qty: 1, direction: 'in', createdAt: '2026-04-24T12:00:00.000Z' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(2);
    expect(result[0].instances).toHaveLength(2);
    // Newest first.
    expect(result[0].instances[0].createdAt).toBe('2026-04-24T12:00:00.000Z');
    expect(result[0].instances[1].createdAt).toBe('2026-04-23T12:00:00.000Z');
  });

  it('case 4 — three incoming + one outgoing → qty 2, instances = only incoming', () => {
    const result = aggregateStashLegs([
      leg({ itemName: 'arrow', qty: 1, direction: 'in' }),
      leg({ itemName: 'arrow', qty: 1, direction: 'in' }),
      leg({ itemName: 'arrow', qty: 1, direction: 'in' }),
      leg({ itemName: 'arrow', qty: 1, direction: 'out' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(2);
    // Only the 3 incoming legs become instances — the outgoing one is
    // bookkeeping for the math, not rendered in the expand row.
    expect(result[0].instances).toHaveLength(3);
    expect(result[0].warning).toBeUndefined();
  });

  it('case 5 — only outgoing legs → qty < 0, warning flag, item kept', () => {
    // Data-integrity anomaly — someone took items that were never
    // recorded as incoming. The grid must still surface this.
    const result = aggregateStashLegs([
      leg({ itemName: 'mystery gem', qty: 2, direction: 'out' }),
      leg({ itemName: 'mystery gem', qty: 1, direction: 'out' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].qty).toBe(-3);
    expect(result[0].warning).toBe(true);
    // No incoming legs → no instances.
    expect(result[0].instances).toHaveLength(0);
  });

  it('case 6 — different names stay separate (no fuzzy matching)', () => {
    const result = aggregateStashLegs([
      leg({ itemName: 'silver amulet', qty: 1, direction: 'in' }),
      // Typo: same intent, different string. Must NOT merge.
      leg({ itemName: 'silver amullet', qty: 1, direction: 'in' }),
    ]);
    expect(result).toHaveLength(2);
    const names = result.map((r) => r.itemName).sort();
    expect(names).toEqual(['silver amulet', 'silver amullet']);
    for (const row of result) {
      expect(row.qty).toBe(1);
    }
  });

  it('case 7 — custom keyFn including itemNodeId (forward-compat spec-015)', () => {
    // Simulates spec-015's future key: two legs share the same
    // free-text `itemName` but different catalog node ids — they
    // must be two separate rows in the grid.
    type ExtLeg = StashItemLeg & { itemNodeId: string | null };

    const legA: ExtLeg = {
      ...leg({ itemName: 'healing potion', qty: 1, direction: 'in' }),
      itemNodeId: 'node-basic',
    };
    const legB: ExtLeg = {
      ...leg({ itemName: 'healing potion', qty: 1, direction: 'in' }),
      itemNodeId: 'node-greater',
    };

    const result = aggregateStashLegs(
      [legA, legB],
      (l) => `${l.itemName}#${(l as ExtLeg).itemNodeId ?? 'free'}`,
    );

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.qty === 1)).toBe(true);
  });

  it('drops items whose net qty is exactly zero', () => {
    const result = aggregateStashLegs([
      leg({ itemName: 'rope', qty: 1, direction: 'in' }),
      leg({ itemName: 'rope', qty: 1, direction: 'out' }),
    ]);
    expect(result).toEqual([]);
  });

  it('tracks the most recent (loop, day, createdAt) per bucket', () => {
    const result = aggregateStashLegs([
      leg({
        itemName: 'torch',
        qty: 1,
        direction: 'in',
        loopNumber: 1,
        dayInLoop: 5,
        createdAt: '2026-04-20T10:00:00.000Z',
      }),
      leg({
        itemName: 'torch',
        qty: 1,
        direction: 'in',
        loopNumber: 1,
        dayInLoop: 12,
        createdAt: '2026-04-24T10:00:00.000Z',
      }),
    ]);
    expect(result[0].latestLoop).toBe(1);
    expect(result[0].latestDay).toBe(12);
  });
});
