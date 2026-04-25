import { describe, expect, it } from 'vitest'

import type { LootDraft } from '../encounter-loot-types'
import {
  validateLootDraftPatch,
  validateLootDraftReady,
  validateLootLine,
} from '../encounter-loot-validation'

const PC1 = '11111111-2222-3333-4444-555555555555'
const PC2 = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('validateLootLine', () => {
  it('happy path: coin line to pc', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: 0,
      sp: 0,
      gp: 10,
      pp: 0,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(true)
  })

  it('happy path: coin line to stash', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: 5,
      sp: 0,
      gp: 0,
      pp: 0,
      recipient_mode: 'stash',
      recipient_pc_id: null,
    })
    expect(r.ok).toBe(true)
  })

  it('happy path: split_evenly coin line', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: 0,
      sp: 0,
      gp: 30,
      pp: 0,
      recipient_mode: 'split_evenly',
      recipient_pc_id: null,
    })
    expect(r.ok).toBe(true)
  })

  it('happy path: item line to pc', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'item',
      name: 'longsword',
      qty: 1,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(true)
  })

  it('rejects negative coin denomination', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: -5,
      sp: 0,
      gp: 0,
      pp: 0,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/cp/)
  })

  it('rejects all-zero coin denominations', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: 0,
      sp: 0,
      gp: 0,
      pp: 0,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/ненулевой/)
  })

  it('rejects coin line with mode=pc but recipient_pc_id=null', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: 0,
      sp: 0,
      gp: 5,
      pp: 0,
      recipient_mode: 'pc',
      recipient_pc_id: null,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects coin line with mode=stash but recipient_pc_id set', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: 0,
      sp: 0,
      gp: 5,
      pp: 0,
      recipient_mode: 'stash',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects item line with split_evenly recipient (only coins allowed)', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'item',
      name: 'sword',
      qty: 1,
      recipient_mode: 'split_evenly',
      recipient_pc_id: null,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects item with empty name', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'item',
      name: '',
      qty: 1,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects item with whitespace-only name', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'item',
      name: '   ',
      qty: 1,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(false)
  })

  it('trims item name to clean form', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'item',
      name: '  longsword  ',
      qty: 2,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(true)
    if (r.ok && r.value.kind === 'item') {
      expect(r.value.name).toBe('longsword')
    }
  })

  it('rejects item with qty=0', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'item',
      name: 'sword',
      qty: 0,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects item with negative qty', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'item',
      name: 'sword',
      qty: -1,
      recipient_mode: 'pc',
      recipient_pc_id: PC1,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects line with unknown kind', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'xp',
      amount: 100,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects line with missing id', () => {
    const r = validateLootLine({
      kind: 'coin',
      cp: 0,
      sp: 0,
      gp: 5,
      pp: 0,
      recipient_mode: 'stash',
      recipient_pc_id: null,
    })
    expect(r.ok).toBe(false)
  })

  it('rejects mode=pc with garbage recipient_pc_id', () => {
    const r = validateLootLine({
      id: 'line-1',
      kind: 'coin',
      cp: 0,
      sp: 0,
      gp: 5,
      pp: 0,
      recipient_mode: 'pc',
      recipient_pc_id: 'not-a-uuid',
    })
    expect(r.ok).toBe(false)
  })
})

describe('validateLootDraftPatch', () => {
  it('accepts empty patch', () => {
    const r = validateLootDraftPatch({})
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({})
  })

  it('accepts lines patch with valid lines', () => {
    const r = validateLootDraftPatch({
      lines: [
        {
          id: 'line-1',
          kind: 'coin',
          cp: 0,
          sp: 0,
          gp: 5,
          pp: 0,
          recipient_mode: 'pc',
          recipient_pc_id: PC1,
        },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects lines patch where one line is invalid', () => {
    const r = validateLootDraftPatch({
      lines: [
        {
          id: 'line-1',
          kind: 'coin',
          cp: 0,
          sp: 0,
          gp: 5,
          pp: 0,
          recipient_mode: 'pc',
          recipient_pc_id: PC1,
        },
        {
          id: 'line-2',
          kind: 'item',
          name: '',
          qty: 1,
          recipient_mode: 'pc',
          recipient_pc_id: PC2,
        },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Строка #2/)
  })

  it('rejects duplicate line ids', () => {
    const r = validateLootDraftPatch({
      lines: [
        {
          id: 'dup',
          kind: 'coin',
          cp: 0,
          sp: 0,
          gp: 5,
          pp: 0,
          recipient_mode: 'pc',
          recipient_pc_id: PC1,
        },
        {
          id: 'dup',
          kind: 'coin',
          cp: 0,
          sp: 0,
          gp: 3,
          pp: 0,
          recipient_mode: 'stash',
          recipient_pc_id: null,
        },
      ],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Дубликат/)
  })

  it('accepts loop_number=null', () => {
    const r = validateLootDraftPatch({ loop_number: null })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.loop_number).toBe(null)
  })

  it('accepts day_in_loop in [1, 30]', () => {
    expect(validateLootDraftPatch({ day_in_loop: 1 }).ok).toBe(true)
    expect(validateLootDraftPatch({ day_in_loop: 15 }).ok).toBe(true)
    expect(validateLootDraftPatch({ day_in_loop: 30 }).ok).toBe(true)
  })

  it('rejects day_in_loop=0', () => {
    expect(validateLootDraftPatch({ day_in_loop: 0 }).ok).toBe(false)
  })

  it('rejects day_in_loop=31', () => {
    expect(validateLootDraftPatch({ day_in_loop: 31 }).ok).toBe(false)
  })

  it('rejects loop_number=0', () => {
    expect(validateLootDraftPatch({ loop_number: 0 }).ok).toBe(false)
  })

  it('rejects loop_number=-1', () => {
    expect(validateLootDraftPatch({ loop_number: -1 }).ok).toBe(false)
  })

  it('rejects non-array lines', () => {
    expect(validateLootDraftPatch({ lines: 'not array' }).ok).toBe(false)
  })

  it('rejects non-object patch', () => {
    expect(validateLootDraftPatch(null).ok).toBe(false)
    expect(validateLootDraftPatch('string').ok).toBe(false)
  })
})

describe('validateLootDraftReady', () => {
  function ready(overrides: Partial<LootDraft> = {}): LootDraft {
    return {
      encounter_id: '00000000-0000-0000-0000-000000000000',
      lines: [],
      loop_number: 3,
      day_in_loop: 5,
      updated_by: null,
      created_at: '2026-04-25T00:00:00Z',
      updated_at: '2026-04-25T00:00:00Z',
      ...overrides,
    }
  }

  it('accepts empty draft with day set (no-op apply)', () => {
    expect(validateLootDraftReady(ready()).ok).toBe(true)
  })

  it('rejects draft with null loop_number', () => {
    const r = validateLootDraftReady(ready({ loop_number: null }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/петли/)
  })

  it('rejects draft with null day_in_loop', () => {
    const r = validateLootDraftReady(ready({ day_in_loop: null }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/день/)
  })

  it('rejects draft with day_in_loop out of range', () => {
    expect(validateLootDraftReady(ready({ day_in_loop: 0 })).ok).toBe(false)
    expect(validateLootDraftReady(ready({ day_in_loop: 31 })).ok).toBe(false)
  })

  it('accepts valid full draft', () => {
    const r = validateLootDraftReady(
      ready({
        lines: [
          {
            id: 'line-1',
            kind: 'coin',
            cp: 0,
            sp: 0,
            gp: 5,
            pp: 0,
            recipient_mode: 'pc',
            recipient_pc_id: PC1,
          },
        ],
      }),
    )
    expect(r.ok).toBe(true)
  })

  it('rejects ready-draft with malformed line', () => {
    // Force an invalid shape past the type system to simulate a corrupt
    // JSONB read.
    const bad = ready({
      lines: [
        {
          id: 'line-1',
          kind: 'coin',
          cp: -1,
          sp: 0,
          gp: 0,
          pp: 0,
          recipient_mode: 'pc',
          recipient_pc_id: PC1,
        } as unknown as LootDraft['lines'][number],
      ],
    })
    const r = validateLootDraftReady(bad)
    expect(r.ok).toBe(false)
  })
})
