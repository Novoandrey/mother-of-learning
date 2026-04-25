/**
 * Tests for `dedupTransferPairs` / `isSenderLeg` / `countDistinctEvents`.
 * Pure functions, no DB.
 */

import { describe, expect, it } from 'vitest';

import type { CoinSet } from '../transactions';
import {
  countDistinctEvents,
  dedupTransferPairs,
  isSenderLeg,
} from '../transaction-dedup';

const zeroCoins: CoinSet = { cp: 0, sp: 0, gp: 0, pp: 0 };

type Row = {
  id: string;
  kind: 'money' | 'item' | 'transfer';
  coins: CoinSet;
  item_qty: number;
  transfer_group_id: string | null;
};

function row(partial: Partial<Row> & { id: string }): Row {
  return {
    kind: 'money',
    coins: { ...zeroCoins },
    item_qty: 0,
    transfer_group_id: null,
    ...partial,
  };
}

describe('isSenderLeg', () => {
  it('returns false for rows without transfer_group_id', () => {
    expect(
      isSenderLeg({
        kind: 'money',
        coins: { cp: 0, sp: 0, gp: -5, pp: 0 },
        item_qty: 0,
        transfer_group_id: null,
      }),
    ).toBe(false);
  });

  it('identifies money-transfer sender by negative coin sum', () => {
    expect(
      isSenderLeg({
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: -5, pp: 0 },
        item_qty: 0,
        transfer_group_id: 'g1',
      }),
    ).toBe(true);
  });

  it('identifies money-transfer recipient by positive coin sum', () => {
    expect(
      isSenderLeg({
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
        item_qty: 0,
        transfer_group_id: 'g1',
      }),
    ).toBe(false);
  });

  it('identifies item-transfer sender by negative item_qty', () => {
    expect(
      isSenderLeg({
        kind: 'item',
        coins: { ...zeroCoins },
        item_qty: -2,
        transfer_group_id: 'g1',
      }),
    ).toBe(true);
  });

  it('identifies item-transfer recipient by positive item_qty', () => {
    expect(
      isSenderLeg({
        kind: 'item',
        coins: { ...zeroCoins },
        item_qty: 2,
        transfer_group_id: 'g1',
      }),
    ).toBe(false);
  });
});

describe('dedupTransferPairs', () => {
  it('passes non-transfer rows through unchanged', () => {
    const rows: Row[] = [
      row({ id: 'a', kind: 'money', coins: { cp: 0, sp: 0, gp: 10, pp: 0 } }),
      row({ id: 'b', kind: 'item', item_qty: 3 }),
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('collapses a money-transfer pair to the sender leg', () => {
    const rows: Row[] = [
      // Sender comes first in the feed (more common with DESC ordering).
      row({
        id: 'sender',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: -5, pp: 0 },
        transfer_group_id: 'g1',
      }),
      row({
        id: 'recipient',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
        transfer_group_id: 'g1',
      }),
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id)).toEqual(['sender']);
  });

  it('swaps when the recipient leg appears before the sender leg', () => {
    const rows: Row[] = [
      row({
        id: 'recipient',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
        transfer_group_id: 'g1',
      }),
      row({
        id: 'sender',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: -5, pp: 0 },
        transfer_group_id: 'g1',
      }),
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id)).toEqual(['sender']);
  });

  it('collapses item-transfer pairs', () => {
    const rows: Row[] = [
      row({
        id: 'send',
        kind: 'item',
        item_qty: -2,
        transfer_group_id: 'g-item',
      }),
      row({
        id: 'recv',
        kind: 'item',
        item_qty: 2,
        transfer_group_id: 'g-item',
      }),
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id)).toEqual(['send']);
  });

  it('handles multiple distinct pairs independently', () => {
    const rows: Row[] = [
      row({
        id: 'a-send',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: -1, pp: 0 },
        transfer_group_id: 'gA',
      }),
      row({
        id: 'a-recv',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 1, pp: 0 },
        transfer_group_id: 'gA',
      }),
      row({ id: 'standalone', kind: 'money', coins: { cp: 0, sp: 0, gp: 100, pp: 0 } }),
      row({
        id: 'b-send',
        kind: 'item',
        item_qty: -1,
        transfer_group_id: 'gB',
      }),
      row({
        id: 'b-recv',
        kind: 'item',
        item_qty: 1,
        transfer_group_id: 'gB',
      }),
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id)).toEqual(['a-send', 'standalone', 'b-send']);
  });

  it('keeps a lone leg when the sibling is not in the input', () => {
    // Happens at page boundaries: only one leg survived the cursor slice.
    const rows: Row[] = [
      row({
        id: 'orphan',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
        transfer_group_id: 'g1',
      }),
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id)).toEqual(['orphan']);
  });

  it('is idempotent when run twice', () => {
    const rows: Row[] = [
      row({
        id: 's',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: -5, pp: 0 },
        transfer_group_id: 'g1',
      }),
      row({
        id: 'r',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
        transfer_group_id: 'g1',
      }),
      row({ id: 'x', kind: 'money', coins: { cp: 0, sp: 0, gp: 1, pp: 0 } }),
    ];
    const once = dedupTransferPairs(rows);
    const twice = dedupTransferPairs(once);
    expect(twice.map((r) => r.id)).toEqual(once.map((r) => r.id));
  });

  it('preserves stable ordering across interleaved groups', () => {
    // gA-send, gB-send, gA-recv, gB-recv → should collapse to
    // [gA-send, gB-send] in original input order.
    const rows: Row[] = [
      row({
        id: 'a-send',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: -1, pp: 0 },
        transfer_group_id: 'gA',
      }),
      row({
        id: 'b-send',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: -2, pp: 0 },
        transfer_group_id: 'gB',
      }),
      row({
        id: 'a-recv',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 1, pp: 0 },
        transfer_group_id: 'gA',
      }),
      row({
        id: 'b-recv',
        kind: 'transfer',
        coins: { cp: 0, sp: 0, gp: 2, pp: 0 },
        transfer_group_id: 'gB',
      }),
    ];
    expect(dedupTransferPairs(rows).map((r) => r.id)).toEqual(['a-send', 'b-send']);
  });

  // Spec-014 T023: defensive check — both legs of a transfer share status by
  // construction (server actions enforce). If a mismatched-status pair ever
  // shows up (data corruption / manual SQL), we MUST NOT collapse — both
  // rows should stay visible so the operator can spot the inconsistency.
  it('does not collapse pair with different statuses', () => {
    type StatusRow = Row & { status: 'pending' | 'approved' | 'rejected' };
    const rows: StatusRow[] = [
      {
        ...row({
          id: 'send',
          kind: 'transfer',
          coins: { cp: 0, sp: 0, gp: -5, pp: 0 },
          transfer_group_id: 'g1',
        }),
        status: 'approved',
      },
      {
        ...row({
          id: 'recv',
          kind: 'transfer',
          coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
          transfer_group_id: 'g1',
        }),
        status: 'pending',
      },
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id).sort()).toEqual(['recv', 'send']);
  });

  it('still collapses pair when both legs share status', () => {
    type StatusRow = Row & { status: 'pending' | 'approved' | 'rejected' };
    const rows: StatusRow[] = [
      {
        ...row({
          id: 'send',
          kind: 'transfer',
          coins: { cp: 0, sp: 0, gp: -5, pp: 0 },
          transfer_group_id: 'g1',
        }),
        status: 'pending',
      },
      {
        ...row({
          id: 'recv',
          kind: 'transfer',
          coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
          transfer_group_id: 'g1',
        }),
        status: 'pending',
      },
    ];
    const result = dedupTransferPairs(rows);
    expect(result.map((r) => r.id)).toEqual(['send']);
  });
});

describe('countDistinctEvents', () => {
  it('counts non-transfer rows individually', () => {
    const rows = [
      { id: '1', transfer_group_id: null },
      { id: '2', transfer_group_id: null },
      { id: '3', transfer_group_id: null },
    ];
    expect(countDistinctEvents(rows)).toBe(3);
  });

  it('counts transfer legs as one per group', () => {
    const rows = [
      { id: 'a1', transfer_group_id: 'gA' },
      { id: 'a2', transfer_group_id: 'gA' },
      { id: 'b1', transfer_group_id: 'gB' },
      { id: 'b2', transfer_group_id: 'gB' },
    ];
    expect(countDistinctEvents(rows)).toBe(2);
  });

  it('combines standalone + transfers', () => {
    const rows = [
      { id: 'x', transfer_group_id: null },
      { id: 'a1', transfer_group_id: 'gA' },
      { id: 'a2', transfer_group_id: 'gA' },
      { id: 'y', transfer_group_id: null },
    ];
    expect(countDistinctEvents(rows)).toBe(3);
  });

  it('returns 0 for empty input', () => {
    expect(countDistinctEvents([])).toBe(0);
  });
});
