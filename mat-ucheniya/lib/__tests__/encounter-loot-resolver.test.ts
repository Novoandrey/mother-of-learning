import { describe, expect, it } from 'vitest'

import { resolveEncounterLootDesiredRows } from '../encounter-loot-resolver'
import type {
  CoinLine,
  ItemLine,
  LootDraft,
  LootLine,
  MoneyDistribution,
} from '../encounter-loot-types'

const STASH = 'stash-node-id'
const PC1 = 'pc-id-1'
const PC2 = 'pc-id-2'
const PC3 = 'pc-id-3'
const PC4 = 'pc-id-4'

function draft(
  lines: LootLine[],
  money_distribution: MoneyDistribution = { mode: 'stash', pc_id: null },
): LootDraft {
  return {
    encounter_id: 'enc-id',
    lines,
    loop_number: 3,
    day_in_loop: 5,
    money_distribution,
    updated_by: null,
    created_at: '2026-04-25T00:00:00Z',
    updated_at: '2026-04-25T00:00:00Z',
  }
}

function coin(props: Partial<CoinLine> = {}): CoinLine {
  return {
    id: props.id ?? `cl-${Math.random()}`,
    kind: 'coin',
    cp: props.cp ?? 0,
    sp: props.sp ?? 0,
    gp: props.gp ?? 0,
    pp: props.pp ?? 0,
    ...(props.comment !== undefined ? { comment: props.comment } : {}),
  }
}

function item(props: Partial<ItemLine> & Pick<ItemLine, 'name' | 'qty' | 'recipient_mode'>): ItemLine {
  return {
    id: props.id ?? `il-${Math.random()}`,
    kind: 'item',
    name: props.name,
    qty: props.qty,
    recipient_mode: props.recipient_mode,
    recipient_pc_id: props.recipient_pc_id ?? null,
  }
}

describe('resolveEncounterLootDesiredRows', () => {
  it('empty draft → empty output', () => {
    expect(
      resolveEncounterLootDesiredRows({
        draft: draft([]),
        participantPcIds: [PC1, PC2],
        stashNodeId: STASH,
      }),
    ).toEqual([])
  })

  it('coin lines + money_distribution=pc → 1 row to that PC', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft(
        [coin({ gp: 10 })],
        { mode: 'pc', pc_id: PC1 },
      ),
      participantPcIds: [PC1, PC2],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: PC1, cp: 0, sp: 0, gp: 10, pp: 0 },
    ])
  })

  it('coin lines + money_distribution=stash → 1 row to stashNodeId', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([coin({ gp: 25 })], { mode: 'stash', pc_id: null }),
      participantPcIds: [PC1, PC2, PC3],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: STASH, cp: 0, sp: 0, gp: 25, pp: 0 },
    ])
  })

  it('split_evenly with 4 PCs → 4 rows summing to total', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft(
        [coin({ gp: 40 })],
        { mode: 'split_evenly', pc_id: null },
      ),
      participantPcIds: [PC1, PC2, PC3, PC4],
      stashNodeId: STASH,
    })
    // 40gp = 4000cp / 4 = 1000cp each = 1pp each
    expect(result).toHaveLength(4)
    const totalCp = result.reduce((s, r) => {
      if (r.kind !== 'money') throw new Error('unexpected')
      return s + r.cp + 10 * r.sp + 100 * r.gp + 1000 * r.pp
    }, 0)
    expect(totalCp).toBe(4000)
    expect(result[0].actor_pc_id).toBe(PC1)
    expect(result[3].actor_pc_id).toBe(PC4)
  })

  it('uneven split (31gp / 3 PCs) → exact remainder distribution', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft(
        [coin({ gp: 31 })],
        { mode: 'split_evenly', pc_id: null },
      ),
      participantPcIds: [PC1, PC2, PC3],
      stashNodeId: STASH,
    })
    // 31gp = 3100cp / 3 = 1033 rem 1. Ceiling=gp (input was gp-only).
    // PC1: 1034cp = 10gp + 3sp + 4cp
    // PC2: 1033cp = 10gp + 3sp + 3cp
    // PC3: 1033cp = 10gp + 3sp + 3cp
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: PC1, cp: 4, sp: 3, gp: 10, pp: 0 },
      { kind: 'money', actor_pc_id: PC2, cp: 3, sp: 3, gp: 10, pp: 0 },
      { kind: 'money', actor_pc_id: PC3, cp: 3, sp: 3, gp: 10, pp: 0 },
    ])
  })

  it('multiple coin lines sum into one bucket regardless of comment', () => {
    // chat-50: comments are editor metadata, not distinguishing keys.
    // Two coin lines with different comments to the same PC produce
    // ONE merged row (sum of denominations).
    const result = resolveEncounterLootDesiredRows({
      draft: draft(
        [
          coin({ gp: 30, comment: 'Тела пауков' }),
          coin({ gp: 50, comment: 'Сундук' }),
        ],
        { mode: 'pc', pc_id: PC1 },
      ),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: PC1, cp: 0, sp: 0, gp: 80, pp: 0 },
    ])
  })

  it('money + items: items use per-line recipient, money uses global', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft(
        [
          coin({ gp: 10 }),
          item({ name: 'shield', qty: 1, recipient_mode: 'pc', recipient_pc_id: PC1 }),
          item({ name: 'rope', qty: 5, recipient_mode: 'stash' }),
        ],
        { mode: 'split_evenly', pc_id: null },
      ),
      participantPcIds: [PC1, PC2],
      stashNodeId: STASH,
    })
    // Money: 10gp split across PC1+PC2 → 5gp each
    // Items: shield → PC1, rope → STASH
    expect(result).toHaveLength(4)
    expect(result.find((r) => r.kind === 'money' && r.actor_pc_id === PC1))
      .toEqual({ kind: 'money', actor_pc_id: PC1, cp: 0, sp: 0, gp: 5, pp: 0 })
    expect(result.find((r) => r.kind === 'money' && r.actor_pc_id === PC2))
      .toEqual({ kind: 'money', actor_pc_id: PC2, cp: 0, sp: 0, gp: 5, pp: 0 })
    expect(result.find((r) => r.kind === 'item' && r.actor_pc_id === PC1))
      .toEqual({ kind: 'item', actor_pc_id: PC1, item_name: 'shield', item_qty: 1, item_node_id: null })
    expect(result.find((r) => r.kind === 'item' && r.actor_pc_id === STASH))
      .toEqual({ kind: 'item', actor_pc_id: STASH, item_name: 'rope', item_qty: 5, item_node_id: null })
  })

  it('merge: two item lines with same (actor, name) → 1 row qty summed', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        item({ name: 'longsword', qty: 1, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        item({ name: 'longsword', qty: 2, recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'item', actor_pc_id: PC1, item_name: 'longsword', item_qty: 3, item_node_id: null },
    ])
  })

  it('items with same name to different recipients → separate rows', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        item({ name: 'potion', qty: 1, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        item({ name: 'potion', qty: 2, recipient_mode: 'stash' }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.actor_pc_id === PC1)).toEqual({
      kind: 'item', actor_pc_id: PC1, item_name: 'potion', item_qty: 1, item_node_id: null,
    })
    expect(result.find((r) => r.actor_pc_id === STASH)).toEqual({
      kind: 'item', actor_pc_id: STASH, item_name: 'potion', item_qty: 2, item_node_id: null,
    })
  })

  it('coin and item to same PC → both rows present (different kind)', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft(
        [
          coin({ gp: 5 }),
          item({ name: 'shield', qty: 1, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        ],
        { mode: 'pc', pc_id: PC1 },
      ),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toHaveLength(2)
    expect(result.find((r) => r.kind === 'money')).toEqual({
      kind: 'money', actor_pc_id: PC1, cp: 0, sp: 0, gp: 5, pp: 0,
    })
    expect(result.find((r) => r.kind === 'item')).toEqual({
      kind: 'item', actor_pc_id: PC1, item_name: 'shield', item_qty: 1, item_node_id: null,
    })
  })

  it('split_evenly with 0 participants → money silently skipped, items survive', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft(
        [
          coin({ gp: 10 }),
          item({ name: 'boots', qty: 1, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        ],
        { mode: 'split_evenly', pc_id: null },
      ),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    // Money line dropped (no participants), item line survives.
    expect(result).toEqual([
      { kind: 'item', actor_pc_id: PC1, item_name: 'boots', item_qty: 1, item_node_id: null },
    ])
  })

  it('money_distribution=pc with null pc_id → money silently dropped', () => {
    // Defence in depth — validation should reject this upstream.
    const result = resolveEncounterLootDesiredRows({
      draft: {
        ...draft([coin({ gp: 10 })]),
        // @ts-expect-error — intentionally invalid shape for the test
        money_distribution: { mode: 'pc', pc_id: null },
      },
      participantPcIds: [PC1],
      stashNodeId: STASH,
    })
    expect(result).toEqual([])
  })

  it('zero-amount coin → no money row', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([coin({})]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([])
  })

  it('zero-qty item dropped after merge', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        item({ name: 'boots', qty: 0, recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([])
  })

  it('item to stash → row with actor=stashNodeId', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        item({ name: 'rope', qty: 5, recipient_mode: 'stash' }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'item', actor_pc_id: STASH, item_name: 'rope', item_qty: 5, item_node_id: null },
    ])
  })
})
