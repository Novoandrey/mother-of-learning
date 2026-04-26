import { describe, expect, it } from 'vitest';

import {
  aggregateItemLegs,
  type ItemLeg,
} from '../inventory-aggregation';

// ─────────────────────────── Fixtures ───────────────────────────

let legCounter = 0;

function leg(partial: Partial<ItemLeg> = {}): ItemLeg {
  legCounter += 1;
  return {
    transactionId: `tx-${legCounter}`,
    transferGroupId: null,
    itemNodeId: null,
    itemName: 'Длинный меч',
    qty: 1,
    direction: 'in',
    loopNumber: 1,
    dayInLoop: 1,
    createdAt: `2026-01-01T00:00:0${legCounter}.000Z`,
    sessionId: null,
    sessionTitle: null,
    droppedByPcId: null,
    droppedByPcTitle: null,
    comment: '',
    authorUserId: null,
    authorDisplayName: null,
    ...partial,
  };
}

// ─────────────────────────── Linked dedup ───────────────────────────

describe('aggregateItemLegs — linked dedup by itemNodeId', () => {
  it('merges two legs with same itemNodeId regardless of itemName drift', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: 'node-1', itemName: 'Длинный меч', qty: 1 }),
      leg({ itemNodeId: 'node-1', itemName: 'Меч полуторный', qty: 2, dayInLoop: 5 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].itemNodeId).toBe('node-1');
    expect(out[0].qty).toBe(3);
    // Display name is the latest leg's snapshot.
    expect(out[0].itemName).toBe('Меч полуторный');
  });

  it('keeps separate buckets for different itemNodeIds even with same name', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: 'node-1', itemName: 'Кольцо защиты', qty: 1 }),
      leg({ itemNodeId: 'node-2', itemName: 'Кольцо защиты', qty: 1 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((r) => r.itemNodeId).sort()).toEqual(['node-1', 'node-2']);
  });
});

// ─────────────────────────── Free-text dedup ───────────────────────────

describe('aggregateItemLegs — free-text dedup by name', () => {
  it('merges two free-text legs with same itemName', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: null, itemName: 'странный камень', qty: 1 }),
      leg({ itemNodeId: null, itemName: 'странный камень', qty: 2 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(3);
    expect(out[0].itemNodeId).toBeNull();
  });

  it('does not merge free-text rows with different names', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: null, itemName: 'странный камень', qty: 1 }),
      leg({ itemNodeId: null, itemName: 'обычный камень', qty: 1 }),
    ]);
    expect(out).toHaveLength(2);
  });
});

// ─────────────────────────── Mixed dedup (no collision) ───────────────────────────

describe('aggregateItemLegs — linked and free-text never collide', () => {
  it('never merges linked + free-text with the same name', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: 'node-1', itemName: 'Длинный меч', qty: 1 }),
      leg({ itemNodeId: null, itemName: 'Длинный меч', qty: 1 }),
    ]);
    expect(out).toHaveLength(2);
    const linked = out.find((r) => r.itemNodeId === 'node-1');
    const freetext = out.find((r) => r.itemNodeId === null);
    expect(linked?.qty).toBe(1);
    expect(freetext?.qty).toBe(1);
  });

  it('default keyFn is collision-proof: free-text key cannot match a node uuid', () => {
    // Even if a malicious item_name happens to be a uuid string, the
    // `name:` prefix prevents collision.
    const fakeUuid = '00000000-0000-0000-0000-000000000001';
    const out = aggregateItemLegs([
      leg({ itemNodeId: fakeUuid, itemName: 'normal name', qty: 1 }),
      leg({ itemNodeId: null, itemName: fakeUuid, qty: 1 }),
    ]);
    expect(out).toHaveLength(2);
  });
});

// ─────────────────────────── Sign nets to zero ───────────────────────────

describe('aggregateItemLegs — qty arithmetic', () => {
  it('drops bucket where in == out (net 0)', () => {
    const out = aggregateItemLegs([
      leg({ direction: 'in', qty: 3 }),
      leg({ direction: 'out', qty: 3 }),
    ]);
    expect(out).toHaveLength(0);
  });

  it('keeps positive net', () => {
    const out = aggregateItemLegs([
      leg({ direction: 'in', qty: 5 }),
      leg({ direction: 'out', qty: 2 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(3);
    expect(out[0].warning).toBeUndefined();
  });

  it('flags negative net with warning: true', () => {
    const out = aggregateItemLegs([
      leg({ direction: 'in', qty: 1 }),
      leg({ direction: 'out', qty: 4 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(-3);
    expect(out[0].warning).toBe(true);
  });
});

// ─────────────────────────── Latest position tracking ───────────────────────────

describe('aggregateItemLegs — latestLoop/latestDay', () => {
  it('takes max(loop, day, createdAt) of all legs in bucket', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: 'n1', loopNumber: 2, dayInLoop: 3, createdAt: '2026-01-01T00:00:00.000Z' }),
      leg({ itemNodeId: 'n1', loopNumber: 3, dayInLoop: 1, createdAt: '2026-01-02T00:00:00.000Z' }),
      leg({ itemNodeId: 'n1', loopNumber: 2, dayInLoop: 5, createdAt: '2026-01-03T00:00:00.000Z' }),
    ]);
    expect(out[0].latestLoop).toBe(3);
    expect(out[0].latestDay).toBe(1);
  });

  it('breaks ties by createdAt', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: 'n1', loopNumber: 1, dayInLoop: 1, createdAt: '2026-01-01T00:00:00.000Z' }),
      leg({ itemNodeId: 'n1', loopNumber: 1, dayInLoop: 1, createdAt: '2026-01-02T00:00:00.000Z' }),
    ]);
    // Both same loop+day; later createdAt wins (only matters for itemName drift)
    expect(out[0].latestLoop).toBe(1);
    expect(out[0].latestDay).toBe(1);
  });
});

// ─────────────────────────── Instances list ───────────────────────────

describe('aggregateItemLegs — instances', () => {
  it('only includes incoming legs in instances', () => {
    const out = aggregateItemLegs([
      leg({ itemNodeId: 'n1', direction: 'in', qty: 2 }),
      leg({ itemNodeId: 'n1', direction: 'out', qty: 1 }),
    ]);
    expect(out[0].instances).toHaveLength(1);
    expect(out[0].instances[0].qty).toBe(2);
  });

  it('sorts instances newest-first by createdAt', () => {
    const out = aggregateItemLegs([
      leg({
        itemNodeId: 'n1',
        direction: 'in',
        qty: 1,
        transactionId: 'old',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      leg({
        itemNodeId: 'n1',
        direction: 'in',
        qty: 1,
        transactionId: 'new',
        createdAt: '2026-01-03T00:00:00.000Z',
      }),
      leg({
        itemNodeId: 'n1',
        direction: 'in',
        qty: 1,
        transactionId: 'mid',
        createdAt: '2026-01-02T00:00:00.000Z',
      }),
    ]);
    expect(out[0].instances.map((i) => i.transactionId)).toEqual(['new', 'mid', 'old']);
  });

  it('hydrates droppedBy / session / author from leg fields', () => {
    const out = aggregateItemLegs([
      leg({
        itemNodeId: 'n1',
        direction: 'in',
        qty: 1,
        droppedByPcId: 'pc-1',
        droppedByPcTitle: 'Mirian',
        sessionId: 'sess-1',
        sessionTitle: 'Loop 4 day 1',
        authorUserId: 'u-1',
        authorDisplayName: 'DM',
        comment: 'loot',
      }),
    ]);
    expect(out[0].instances[0].droppedBy).toEqual({ pcId: 'pc-1', pcTitle: 'Mirian' });
    expect(out[0].instances[0].session).toEqual({ id: 'sess-1', title: 'Loop 4 day 1' });
    expect(out[0].instances[0].author).toEqual({ userId: 'u-1', displayName: 'DM' });
    expect(out[0].instances[0].comment).toBe('loot');
  });

  it('survives deleted PC / session / author (sets to null / [deleted] placeholder)', () => {
    const out = aggregateItemLegs([
      leg({
        itemNodeId: 'n1',
        direction: 'in',
        droppedByPcId: 'pc-1',
        droppedByPcTitle: null,  // deleted
        sessionId: null,         // deleted
        sessionTitle: null,
        authorUserId: null,      // never set
      }),
    ]);
    expect(out[0].instances[0].droppedBy).toEqual({ pcId: 'pc-1', pcTitle: '[deleted]' });
    expect(out[0].instances[0].session).toBeNull();
    expect(out[0].instances[0].author).toBeNull();
  });
});

// ─────────────────────────── Custom keyFn ───────────────────────────

describe('aggregateItemLegs — opts.keyFn', () => {
  it('honours custom keyFn (force name-only keying)', () => {
    const out = aggregateItemLegs(
      [
        leg({ itemNodeId: 'n1', itemName: 'foo', qty: 1 }),
        leg({ itemNodeId: 'n2', itemName: 'foo', qty: 1 }),
      ],
      { keyFn: (l) => l.itemName },
    );
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(2);
  });
});

// ─────────────────────────── Empty input ───────────────────────────

describe('aggregateItemLegs — empty input', () => {
  it('returns empty array', () => {
    expect(aggregateItemLegs([])).toEqual([]);
  });
});
