import { describe, expect, it } from 'vitest'

import {
  activeBatchesOnly,
  groupRowsByBatch,
  isBatchFullyResolved,
  isStaleError,
  summarizeBatch,
  validateBatchRowInputs,
  type BatchRowInput,
  type PendingBatch,
} from '../approval'
import type { TransactionStatus, TransactionWithRelations } from '../transactions'

// ─────────────────────────── Fixtures ───────────────────────────

const Z = { cp: 0, sp: 0, gp: 0, pp: 0 }

function row(
  partial: Partial<TransactionWithRelations> & {
    id: string
    batch_id: string | null
    status?: TransactionStatus
    created_at?: string
    kind?: TransactionWithRelations['kind']
  },
): TransactionWithRelations {
  return {
    id: partial.id,
    campaign_id: 'camp-1',
    actor_pc_id: 'pc-1',
    kind: partial.kind ?? 'money',
    coins: partial.coins ?? { cp: 0, sp: 0, gp: 10, pp: 0 },
    item_name: partial.item_name ?? null,
    item_qty: partial.item_qty ?? 1,
    category_slug: partial.category_slug ?? 'income',
    comment: partial.comment ?? '',
    loop_number: partial.loop_number ?? 3,
    day_in_loop: partial.day_in_loop ?? 5,
    session_id: partial.session_id ?? null,
    transfer_group_id: partial.transfer_group_id ?? null,
    status: partial.status ?? 'pending',
    author_user_id: partial.author_user_id ?? 'user-A',
    created_at: partial.created_at ?? '2026-04-25T14:00:00Z',
    updated_at: partial.updated_at ?? partial.created_at ?? '2026-04-25T14:00:00Z',
    batch_id: partial.batch_id,
    approved_by_user_id: partial.approved_by_user_id ?? null,
    approved_at: partial.approved_at ?? null,
    rejected_by_user_id: partial.rejected_by_user_id ?? null,
    rejected_at: partial.rejected_at ?? null,
    rejection_comment: partial.rejection_comment ?? null,
    autogen: partial.autogen ?? null,
    actor_pc_title: partial.actor_pc_title ?? 'Marcus',
    session_title: partial.session_title ?? null,
    session_number: partial.session_number ?? null,
    category_label: partial.category_label ?? 'Доход',
    author_display_name: partial.author_display_name ?? 'Marcus Player',
    counterparty: partial.counterparty ?? null,
  }
}

function rowInput(p: Partial<BatchRowInput> & { clientId: string }): BatchRowInput {
  return {
    clientId: p.clientId,
    kind: p.kind ?? 'money',
    actorPcId: p.actorPcId ?? 'pc-1',
    coins: p.coins ?? { cp: 0, sp: 0, gp: 10, pp: 0 },
    itemName: p.itemName ?? null,
    itemQty: p.itemQty ?? 1,
    categorySlug: p.categorySlug ?? 'income',
    comment: p.comment ?? '',
    loopNumber: p.loopNumber ?? 3,
    dayInLoop: p.dayInLoop ?? 5,
    sessionId: p.sessionId ?? null,
    recipientPcId: p.recipientPcId,
  }
}

// ─────────────────────────── groupRowsByBatch ───────────────────────────

describe('groupRowsByBatch', () => {
  it('returns [] for empty input', () => {
    expect(groupRowsByBatch([])).toEqual([])
  })

  it('drops rows with batch_id=null (DM-auto-approved or autogen)', () => {
    const rows = [
      row({ id: 'r1', batch_id: null, status: 'approved' }),
      row({ id: 'r2', batch_id: null, status: 'approved' }),
    ]
    expect(groupRowsByBatch(rows)).toEqual([])
  })

  it('groups one batch with one pending row', () => {
    const rows = [row({ id: 'r1', batch_id: 'b1', status: 'pending' })]
    const out = groupRowsByBatch(rows)
    expect(out).toHaveLength(1)
    expect(out[0].batchId).toBe('b1')
    expect(out[0].pendingCount).toBe(1)
    expect(out[0].approvedCount).toBe(0)
    expect(out[0].rejectedCount).toBe(0)
  })

  it('groups one batch with multiple rows', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', status: 'pending' }),
      row({ id: 'r2', batch_id: 'b1', status: 'pending' }),
      row({ id: 'r3', batch_id: 'b1', status: 'pending' }),
    ]
    const out = groupRowsByBatch(rows)
    expect(out).toHaveLength(1)
    expect(out[0].rows).toHaveLength(3)
    expect(out[0].pendingCount).toBe(3)
  })

  it('groups multiple batches', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', status: 'pending' }),
      row({ id: 'r2', batch_id: 'b2', status: 'pending' }),
      row({ id: 'r3', batch_id: 'b1', status: 'pending' }),
    ]
    const out = groupRowsByBatch(rows)
    expect(out).toHaveLength(2)
    const b1 = out.find((b) => b.batchId === 'b1')!
    const b2 = out.find((b) => b.batchId === 'b2')!
    expect(b1.rows).toHaveLength(2)
    expect(b2.rows).toHaveLength(1)
  })

  it('counts mixed statuses inside one batch (AS14: partial approval)', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', status: 'approved' }),
      row({ id: 'r2', batch_id: 'b1', status: 'pending' }),
      row({ id: 'r3', batch_id: 'b1', status: 'rejected' }),
    ]
    const [batch] = groupRowsByBatch(rows)
    expect(batch.pendingCount).toBe(1)
    expect(batch.approvedCount).toBe(1)
    expect(batch.rejectedCount).toBe(1)
  })

  it('keeps both legs of a transfer pair sharing batch_id', () => {
    const rows = [
      row({
        id: 'r1',
        batch_id: 'b1',
        kind: 'transfer',
        transfer_group_id: 'tg1',
        coins: { cp: 0, sp: 0, gp: -30, pp: 0 },
      }),
      row({
        id: 'r2',
        batch_id: 'b1',
        kind: 'transfer',
        transfer_group_id: 'tg1',
        coins: { cp: 0, sp: 0, gp: 30, pp: 0 },
      }),
    ]
    const [batch] = groupRowsByBatch(rows)
    expect(batch.rows).toHaveLength(2)
    expect(batch.pendingCount).toBe(2)
  })

  it('sorts batches newest-first by submittedAt', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'older', created_at: '2026-04-25T10:00:00Z' }),
      row({ id: 'r2', batch_id: 'newer', created_at: '2026-04-25T15:00:00Z' }),
      row({ id: 'r3', batch_id: 'middle', created_at: '2026-04-25T12:00:00Z' }),
    ]
    const out = groupRowsByBatch(rows)
    expect(out.map((b) => b.batchId)).toEqual(['newer', 'middle', 'older'])
  })

  it('uses earliest row created_at as batch submittedAt', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', created_at: '2026-04-25T14:00:05Z' }),
      row({ id: 'r2', batch_id: 'b1', created_at: '2026-04-25T14:00:01Z' }),
      row({ id: 'r3', batch_id: 'b1', created_at: '2026-04-25T14:00:03Z' }),
    ]
    const [batch] = groupRowsByBatch(rows)
    expect(batch.submittedAt).toBe('2026-04-25T14:00:01Z')
  })

  it('drops null-batch rows alongside grouped ones', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', status: 'pending' }),
      row({ id: 'r2', batch_id: null, status: 'approved' }), // dropped
      row({ id: 'r3', batch_id: 'b1', status: 'pending' }),
    ]
    const out = groupRowsByBatch(rows)
    expect(out).toHaveLength(1)
    expect(out[0].rows).toHaveLength(2)
  })

  it('takes author display name from first row of batch', () => {
    const rows = [
      row({ id: 'r1', batch_id: 'b1', author_display_name: 'Alice' }),
      row({ id: 'r2', batch_id: 'b1', author_display_name: 'Alice' }),
    ]
    const [batch] = groupRowsByBatch(rows)
    expect(batch.authorDisplayName).toBe('Alice')
  })
})

// ─────────────────────────── summarizeBatch ───────────────────────────

describe('summarizeBatch', () => {
  it('sums money rows across denoms', () => {
    const batch: PendingBatch = {
      batchId: 'b1',
      authorUserId: 'u1',
      authorDisplayName: 'A',
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [
        row({ id: 'r1', batch_id: 'b1', coins: { cp: 50, sp: 0, gp: 10, pp: 0 } }),
        row({ id: 'r2', batch_id: 'b1', coins: { cp: 0, sp: 5, gp: -3, pp: 1 } }),
      ],
      pendingCount: 2,
      approvedCount: 0,
      rejectedCount: 0,
    }
    const s = summarizeBatch(batch)
    expect(s.netCoins).toEqual({ cp: 50, sp: 5, gp: 7, pp: 1 })
    // 50 + 50 + 700 + 10000 = 10800 cp = 108 gp.
    expect(s.netGp).toBe(108)
    expect(s.itemCount).toBe(0)
    expect(s.kinds).toEqual(['money'])
  })

  it('excludes rejected rows from money totals', () => {
    const batch: PendingBatch = {
      batchId: 'b1',
      authorUserId: 'u1',
      authorDisplayName: 'A',
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [
        row({ id: 'r1', batch_id: 'b1', coins: { cp: 0, sp: 0, gp: 10, pp: 0 }, status: 'pending' }),
        row({
          id: 'r2',
          batch_id: 'b1',
          coins: { cp: 0, sp: 0, gp: 100, pp: 0 },
          status: 'rejected',
        }),
      ],
      pendingCount: 1,
      approvedCount: 0,
      rejectedCount: 1,
    }
    const s = summarizeBatch(batch)
    expect(s.netGp).toBe(10) // 100 gp rejected row excluded
  })

  it('counts items across item rows (item_qty sum)', () => {
    const batch: PendingBatch = {
      batchId: 'b1',
      authorUserId: 'u1',
      authorDisplayName: 'A',
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [
        row({ id: 'r1', batch_id: 'b1', kind: 'item', coins: Z, item_qty: 3, item_name: 'arrow' }),
        row({ id: 'r2', batch_id: 'b1', kind: 'item', coins: Z, item_qty: 1, item_name: 'sword' }),
      ],
      pendingCount: 2,
      approvedCount: 0,
      rejectedCount: 0,
    }
    const s = summarizeBatch(batch)
    expect(s.itemCount).toBe(4)
    expect(s.kinds).toEqual(['item'])
    expect(s.netGp).toBe(0)
  })

  it('collects transfer recipient titles, deduplicated', () => {
    const batch: PendingBatch = {
      batchId: 'b1',
      authorUserId: 'u1',
      authorDisplayName: 'A',
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [
        row({
          id: 'r1',
          batch_id: 'b1',
          kind: 'transfer',
          transfer_group_id: 'tg1',
          coins: { cp: 0, sp: 0, gp: -30, pp: 0 },
          counterparty: { nodeId: 'pc-2', title: 'Stash' },
        }),
        row({
          id: 'r2',
          batch_id: 'b1',
          kind: 'transfer',
          transfer_group_id: 'tg2',
          coins: { cp: 0, sp: 0, gp: -10, pp: 0 },
          counterparty: { nodeId: 'pc-2', title: 'Stash' },
        }),
      ],
      pendingCount: 2,
      approvedCount: 0,
      rejectedCount: 0,
    }
    const s = summarizeBatch(batch)
    expect(s.transferRecipients).toEqual(['Stash'])
  })

  it('counts transfer pair only once in money totals (sender leg)', () => {
    // Both legs share transfer_group_id; only first counts.
    const batch: PendingBatch = {
      batchId: 'b1',
      authorUserId: 'u1',
      authorDisplayName: 'A',
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [
        row({
          id: 'leg-sender',
          batch_id: 'b1',
          kind: 'transfer',
          transfer_group_id: 'tg1',
          coins: { cp: 0, sp: 0, gp: -30, pp: 0 },
        }),
        row({
          id: 'leg-recipient',
          batch_id: 'b1',
          kind: 'transfer',
          transfer_group_id: 'tg1',
          coins: { cp: 0, sp: 0, gp: 30, pp: 0 },
        }),
      ],
      pendingCount: 2,
      approvedCount: 0,
      rejectedCount: 0,
    }
    const s = summarizeBatch(batch)
    // Only -30 gp counted, not -30 + 30 = 0.
    expect(s.netGp).toBe(-30)
  })

  it('reports kinds in canonical order across mixed batch', () => {
    const batch: PendingBatch = {
      batchId: 'b1',
      authorUserId: 'u1',
      authorDisplayName: 'A',
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [
        row({ id: 'r1', batch_id: 'b1', kind: 'transfer', transfer_group_id: 'tg1', coins: { cp: 0, sp: 0, gp: -1, pp: 0 } }),
        row({ id: 'r2', batch_id: 'b1', kind: 'money', coins: { cp: 0, sp: 0, gp: 5, pp: 0 } }),
        row({ id: 'r3', batch_id: 'b1', kind: 'item', coins: Z, item_name: 'rope' }),
      ],
      pendingCount: 3,
      approvedCount: 0,
      rejectedCount: 0,
    }
    const s = summarizeBatch(batch)
    expect(s.kinds).toEqual(['money', 'item', 'transfer'])
  })

  it('returns zero summary for empty batch (degenerate)', () => {
    const batch: PendingBatch = {
      batchId: 'b1',
      authorUserId: 'u1',
      authorDisplayName: 'A',
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [],
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
    }
    const s = summarizeBatch(batch)
    expect(s.netGp).toBe(0)
    expect(s.itemCount).toBe(0)
    expect(s.kinds).toEqual([])
  })
})

// ─────────────────────────── validateBatchRowInputs ───────────────────────────

describe('validateBatchRowInputs', () => {
  it('rejects empty batch', () => {
    const errs = validateBatchRowInputs([])
    expect(errs).toHaveLength(1)
    expect(errs[0].clientId).toBeNull()
  })

  it('accepts a valid single money row', () => {
    expect(validateBatchRowInputs([rowInput({ clientId: '1' })])).toEqual([])
  })

  it('rejects money row with all zero coins', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: '1', coins: Z }),
    ])
    expect(errs.some((e) => /ненулевая/i.test(e.message))).toBe(true)
  })

  it('rejects item row without item_name', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: '1', kind: 'item', coins: Z, itemName: '' }),
    ])
    expect(errs.some((e) => /название/i.test(e.message))).toBe(true)
  })

  it('rejects item row with non-zero coins', () => {
    const errs = validateBatchRowInputs([
      rowInput({
        clientId: '1',
        kind: 'item',
        itemName: 'sword',
        coins: { cp: 0, sp: 0, gp: 5, pp: 0 },
      }),
    ])
    expect(errs.some((e) => /монет/i.test(e.message))).toBe(true)
  })

  it('rejects transfer with no recipient', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: '1', kind: 'transfer', recipientPcId: null }),
    ])
    expect(errs.some((e) => /получател/i.test(e.message))).toBe(true)
  })

  it('rejects transfer with self-recipient', () => {
    const errs = validateBatchRowInputs([
      rowInput({
        clientId: '1',
        kind: 'transfer',
        actorPcId: 'pc-1',
        recipientPcId: 'pc-1',
      }),
    ])
    expect(errs.some((e) => /совпада/i.test(e.message))).toBe(true)
  })

  it('rejects bad day_in_loop (out of range)', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: '1', dayInLoop: 0 }),
    ])
    expect(errs.some((e) => /день/i.test(e.message))).toBe(true)
  })

  it('rejects bad loop_number (negative)', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: '1', loopNumber: -1 }),
    ])
    expect(errs.some((e) => /петля/i.test(e.message))).toBe(true)
  })

  it('rejects missing category', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: '1', categorySlug: '' }),
    ])
    expect(errs.some((e) => /категори/i.test(e.message))).toBe(true)
  })

  it('accepts a valid mixed batch', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: 'a' }),
      rowInput({ clientId: 'b', kind: 'item', itemName: 'rope', coins: Z }),
      rowInput({
        clientId: 'c',
        kind: 'transfer',
        actorPcId: 'pc-1',
        recipientPcId: 'pc-2',
      }),
    ])
    expect(errs).toEqual([])
  })

  it('reports per-row errors with their clientId', () => {
    const errs = validateBatchRowInputs([
      rowInput({ clientId: 'good' }),
      rowInput({ clientId: 'bad', coins: Z }),
    ])
    expect(errs.every((e) => e.clientId === 'bad')).toBe(true)
  })
})

// ─────────────────────────── isStaleError ───────────────────────────

describe('isStaleError', () => {
  it('returns true for ok=false + stale=true', () => {
    expect(isStaleError({ ok: false, error: 'stale', stale: true })).toBe(true)
  })

  it('returns false for ok=false without stale', () => {
    expect(isStaleError({ ok: false, error: 'something else' })).toBe(false)
  })

  it('returns false for success', () => {
    expect(isStaleError({ ok: true })).toBe(false)
  })
})

// ─────────────────────────── isBatchFullyResolved / activeBatchesOnly ──────

describe('isBatchFullyResolved / activeBatchesOnly', () => {
  function batch(p: Pick<PendingBatch, 'pendingCount' | 'approvedCount' | 'rejectedCount'>): PendingBatch {
    return {
      batchId: 'b',
      authorUserId: 'u',
      authorDisplayName: null,
      submittedAt: '2026-04-25T14:00:00Z',
      campaignId: 'c1',
      rows: [],
      ...p,
    }
  }

  it('fully resolved when no pending', () => {
    expect(isBatchFullyResolved(batch({ pendingCount: 0, approvedCount: 2, rejectedCount: 1 }))).toBe(true)
  })

  it('not resolved when at least one pending', () => {
    expect(isBatchFullyResolved(batch({ pendingCount: 1, approvedCount: 0, rejectedCount: 0 }))).toBe(false)
  })

  it('activeBatchesOnly drops fully resolved', () => {
    const a = batch({ pendingCount: 0, approvedCount: 1, rejectedCount: 0 })
    const b = batch({ pendingCount: 1, approvedCount: 0, rejectedCount: 0 })
    expect(activeBatchesOnly([a, b]).map((x) => x.pendingCount)).toEqual([1])
  })
})
