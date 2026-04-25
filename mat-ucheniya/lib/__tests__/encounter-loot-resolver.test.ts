import { describe, expect, it } from 'vitest'

import { resolveEncounterLootDesiredRows } from '../encounter-loot-resolver'
import type {
  CoinLine,
  ItemLine,
  LootDraft,
  LootLine,
} from '../encounter-loot-types'

const STASH = 'stash-node-id'
const PC1 = 'pc-id-1'
const PC2 = 'pc-id-2'
const PC3 = 'pc-id-3'
const PC4 = 'pc-id-4'

function draft(lines: LootLine[]): LootDraft {
  return {
    encounter_id: 'enc-id',
    lines,
    loop_number: 3,
    day_in_loop: 5,
    updated_by: null,
    created_at: '2026-04-25T00:00:00Z',
    updated_at: '2026-04-25T00:00:00Z',
  }
}

function coin(props: Partial<CoinLine> & Pick<CoinLine, 'recipient_mode'>): CoinLine {
  return {
    id: props.id ?? `cl-${Math.random()}`,
    kind: 'coin',
    cp: props.cp ?? 0,
    sp: props.sp ?? 0,
    gp: props.gp ?? 0,
    pp: props.pp ?? 0,
    recipient_mode: props.recipient_mode,
    recipient_pc_id: props.recipient_pc_id ?? null,
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

  it('single coin line, recipient=pc → 1 row', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 10, recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [PC1, PC2],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: PC1, cp: 0, sp: 0, gp: 10, pp: 0 },
    ])
  })

  it('single coin line, recipient=stash → 1 row to stashNodeId', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 25, recipient_mode: 'stash' }),
      ]),
      participantPcIds: [PC1, PC2, PC3],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: STASH, cp: 0, sp: 0, gp: 25, pp: 0 },
    ])
  })

  it('single coin line, recipient=split_evenly with 4 PCs → 4 rows summing to total', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 40, recipient_mode: 'split_evenly' }),
      ]),
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
    // First PC in input order is first recipient.
    expect(result[0].actor_pc_id).toBe(PC1)
    expect(result[3].actor_pc_id).toBe(PC4)
  })

  it('uneven split (31gp / 3 PCs) → exact remainder distribution', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 31, recipient_mode: 'split_evenly' }),
      ]),
      participantPcIds: [PC1, PC2, PC3],
      stashNodeId: STASH,
    })
    // 31gp = 3100cp / 3 = 1033 rem 1.
    // PC1: 1034cp = 1pp + 3sp + 4cp
    // PC2: 1033cp = 1pp + 3sp + 3cp
    // PC3: 1033cp = 1pp + 3sp + 3cp
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: PC1, cp: 4, sp: 3, gp: 0, pp: 1 },
      { kind: 'money', actor_pc_id: PC2, cp: 3, sp: 3, gp: 0, pp: 1 },
      { kind: 'money', actor_pc_id: PC3, cp: 3, sp: 3, gp: 0, pp: 1 },
    ])
  })

  it('mixed PC + stash + split → all rows correct', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 10, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        coin({ gp: 5, recipient_mode: 'stash' }),
        coin({ gp: 6, recipient_mode: 'split_evenly' }),
      ]),
      participantPcIds: [PC1, PC2],
      stashNodeId: STASH,
    })
    // PC1 line: +10gp to PC1 (will merge with split share later)
    // Stash line: +5gp to stash
    // Split: 6gp / 2 = 3gp each → +3gp to PC1, +3gp to PC2
    // After merge: PC1 = 13gp, PC2 = 3gp, STASH = 5gp
    expect(result).toHaveLength(3)
    const byActor = new Map(result.map((r) => [r.actor_pc_id, r]))
    expect(byActor.get(PC1)).toEqual({
      kind: 'money', actor_pc_id: PC1, cp: 0, sp: 0, gp: 13, pp: 0,
    })
    expect(byActor.get(PC2)).toEqual({
      kind: 'money', actor_pc_id: PC2, cp: 0, sp: 0, gp: 3, pp: 0,
    })
    expect(byActor.get(STASH)).toEqual({
      kind: 'money', actor_pc_id: STASH, cp: 0, sp: 0, gp: 5, pp: 0,
    })
  })

  it('merge: two coin lines for same PC → 1 row summed', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 10, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        coin({ gp: 5, sp: 3, recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: PC1, cp: 0, sp: 3, gp: 15, pp: 0 },
    ])
  })

  it('merge: two item lines, same name + same recipient → 1 row qty summed', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        item({ name: 'longsword', qty: 1, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        item({ name: 'longsword', qty: 2, recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([
      { kind: 'item', actor_pc_id: PC1, item_name: 'longsword', item_qty: 3 },
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
      kind: 'item', actor_pc_id: PC1, item_name: 'potion', item_qty: 1,
    })
    expect(result.find((r) => r.actor_pc_id === STASH)).toEqual({
      kind: 'item', actor_pc_id: STASH, item_name: 'potion', item_qty: 2,
    })
  })

  it('coin and item to same PC → both rows present (different kind)', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 5, recipient_mode: 'pc', recipient_pc_id: PC1 }),
        item({ name: 'shield', qty: 1, recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toHaveLength(2)
  })

  it('split_evenly with 0 participants → line skipped silently', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 10, recipient_mode: 'split_evenly' }),
        coin({ gp: 5, recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    // The split line is dropped, the PC line survives.
    expect(result).toEqual([
      { kind: 'money', actor_pc_id: PC1, cp: 0, sp: 0, gp: 5, pp: 0 },
    ])
  })

  it('coin line with null recipient_pc_id but mode=pc → dropped silently', () => {
    // Defence in depth — validation should reject this at write time.
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ gp: 10, recipient_mode: 'pc', recipient_pc_id: null }),
      ]),
      participantPcIds: [PC1],
      stashNodeId: STASH,
    })
    expect(result).toEqual([])
  })

  it('zero-amount coin line dropped after merge', () => {
    const result = resolveEncounterLootDesiredRows({
      draft: draft([
        coin({ recipient_mode: 'pc', recipient_pc_id: PC1 }),
      ]),
      participantPcIds: [],
      stashNodeId: STASH,
    })
    expect(result).toEqual([])
  })

  it('zero-qty item line dropped after merge', () => {
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
      { kind: 'item', actor_pc_id: STASH, item_name: 'rope', item_qty: 5 },
    ])
  })
})
