import { describe, it, expect } from 'vitest'
import { identifyAffectedRows } from '../starter-setup-affected'
import { canonicalKey } from '../starter-setup-resolver'
import type {
  DesiredRow,
  ExistingAutogenRow,
  RowDiff,
  Tombstone,
  UpdatePair,
  WizardKey,
} from '../starter-setup'

const LOOP_ID = '00000000-0000-0000-0000-loop0000000'
const CAMPAIGN_ID = '00000000-0000-0000-0000-camp0000000'

function pcId(n: number): string {
  return `00000000-0000-0000-0000-pc${String(n).padStart(10, '0')}`
}

// ─────────────────────────── row builders ───────────────────────────

function desiredMoney(opts: {
  wizardKey: WizardKey
  pc: string
  gp: number
  categorySlug?: string
}): DesiredRow {
  return {
    wizardKey: opts.wizardKey,
    sourceNodeId: LOOP_ID,
    actorPcId: opts.pc,
    kind: 'money',
    coins: { cp: 0, sp: 0, gp: opts.gp, pp: 0 },
    itemName: null,
    itemNodeId: null,
    itemQty: 1,
    categorySlug: opts.categorySlug ?? 'starting_money',
    comment: '',
    canonicalKey: canonicalKey(opts.wizardKey, { actorPcId: opts.pc }),
  }
}

function existingMoney(opts: {
  wizardKey: WizardKey
  pc: string
  gp: number
  handTouched?: boolean
  id?: string
}): ExistingAutogenRow {
  return {
    id: opts.id ?? crypto.randomUUID(),
    wizardKey: opts.wizardKey,
    sourceNodeId: LOOP_ID,
    actorPcId: opts.pc,
    kind: 'money',
    coins: { cp: 0, sp: 0, gp: opts.gp, pp: 0 },
    itemName: null,
    itemNodeId: null,
    itemQty: 1,
    categorySlug: 'starting_money',
    comment: '',
    handTouched: opts.handTouched ?? false,
    canonicalKey: canonicalKey(opts.wizardKey, { actorPcId: opts.pc }),
  }
}

function tombstone(opts: {
  wizardKey: WizardKey
  pc: string
  itemName?: string | null
}): Tombstone {
  return {
    id: crypto.randomUUID(),
    campaignId: CAMPAIGN_ID,
    wizardKey: opts.wizardKey,
    sourceNodeId: LOOP_ID,
    actorPcId: opts.pc,
    kind: 'money',
    itemName: opts.itemName ?? null,
    deletedAt: '2026-04-24T00:00:00Z',
    canonicalKey: canonicalKey(opts.wizardKey, {
      actorPcId: opts.pc,
      itemName: opts.itemName,
    }),
  }
}

function emptyDiff(): RowDiff {
  return { toInsert: [], toUpdate: [], toDelete: [], unchanged: [] }
}

// ─────────────────────────── tests ───────────────────────────

describe('identifyAffectedRows', () => {
  it('clean diff + no tombstones → empty', () => {
    const result = identifyAffectedRows(emptyDiff(), [])
    expect(result).toEqual([])
  })

  it('hand-touched row in toUpdate → returned with hand_edited', () => {
    const existing = existingMoney({
      wizardKey: 'starting_loan',
      pc: pcId(1),
      gp: 200,
      handTouched: true,
    })
    const desired = desiredMoney({
      wizardKey: 'starting_loan',
      pc: pcId(1),
      gp: 250,
      categorySlug: 'credit',
    })
    const diff: RowDiff = {
      toInsert: [],
      toUpdate: [{ existing, desired }],
      toDelete: [],
      unchanged: [],
    }
    const result = identifyAffectedRows(diff, [])
    expect(result).toHaveLength(1)
    expect(result[0].reason).toBe('hand_edited')
    expect(result[0].currentDisplay).toBe('+200 gp')
    expect(result[0].configDisplay).toBe('+250 gp')
  })

  it('hand-touched row in unchanged (not in toUpdate) → NOT returned', () => {
    // Content is the same — diff put it in `unchanged` — but flag is on.
    // This happens if the DM touched the comment field and reverted it
    // back before reapply; or touched a row with the trigger firing
    // but the value ended up equal.
    const row = existingMoney({
      wizardKey: 'starting_money',
      pc: pcId(1),
      gp: 100,
      handTouched: true,
    })
    const diff: RowDiff = {
      toInsert: [],
      toUpdate: [],
      toDelete: [],
      unchanged: [row],
    }
    const result = identifyAffectedRows(diff, [])
    expect(result).toEqual([])
  })

  it('hand-touched row in toDelete → returned with configDisplay=null', () => {
    const existing = existingMoney({
      wizardKey: 'starting_loan',
      pc: pcId(1),
      gp: 200,
      handTouched: true,
    })
    const diff: RowDiff = {
      toInsert: [],
      toUpdate: [],
      toDelete: [existing],
      unchanged: [],
    }
    const result = identifyAffectedRows(diff, [])
    expect(result).toHaveLength(1)
    expect(result[0].reason).toBe('hand_edited')
    expect(result[0].currentDisplay).toBe('+200 gp')
    expect(result[0].configDisplay).toBeNull()
  })

  it('tombstone with matching toInsert → hand_deleted', () => {
    const desired = desiredMoney({
      wizardKey: 'starting_money',
      pc: pcId(1),
      gp: 100,
    })
    const diff: RowDiff = {
      toInsert: [desired],
      toUpdate: [],
      toDelete: [],
      unchanged: [],
    }
    const tomb = tombstone({ wizardKey: 'starting_money', pc: pcId(1) })
    const result = identifyAffectedRows(diff, [tomb])
    expect(result).toHaveLength(1)
    expect(result[0].reason).toBe('hand_deleted')
    expect(result[0].currentDisplay).toBeNull()
    expect(result[0].configDisplay).toBe('+100 gp')
  })

  it('tombstone with no matching insert → NOT returned', () => {
    // DM hand-deleted the row, then flipped the config flag off so the
    // row wouldn't regenerate anyway — reapply is aligned, no need to
    // surface anything.
    const tomb = tombstone({ wizardKey: 'starting_loan', pc: pcId(99) })
    const result = identifyAffectedRows(emptyDiff(), [tomb])
    expect(result).toEqual([])
  })

  it('NOT-hand-touched row in toUpdate → NOT returned (normal reapply)', () => {
    const existing = existingMoney({
      wizardKey: 'starting_loan',
      pc: pcId(1),
      gp: 200,
      handTouched: false,
    })
    const desired = desiredMoney({
      wizardKey: 'starting_loan',
      pc: pcId(1),
      gp: 250,
      categorySlug: 'credit',
    })
    const diff: RowDiff = {
      toInsert: [],
      toUpdate: [{ existing, desired }],
      toDelete: [],
      unchanged: [],
    }
    const result = identifyAffectedRows(diff, [])
    expect(result).toEqual([])
  })

  it('multiple affected rows come out in stable order (actor title, then wizard)', () => {
    const titles = new Map([
      [pcId(1), 'Alice'],
      [pcId(2), 'Bob'],
      [pcId(3), 'Carol'],
    ])
    const mkPair = (pc: string, wiz: WizardKey, oldGp: number, newGp: number): UpdatePair => ({
      existing: existingMoney({
        wizardKey: wiz,
        pc,
        gp: oldGp,
        handTouched: true,
      }),
      desired: desiredMoney({
        wizardKey: wiz,
        pc,
        gp: newGp,
        categorySlug: wiz === 'starting_loan' ? 'credit' : 'starting_money',
      }),
    })
    const diff: RowDiff = {
      toInsert: [],
      toUpdate: [
        mkPair(pcId(3), 'starting_money', 100, 150),
        mkPair(pcId(1), 'starting_loan', 200, 250),
        mkPair(pcId(1), 'starting_money', 100, 150),
        mkPair(pcId(2), 'starting_money', 100, 150),
      ],
      toDelete: [],
      unchanged: [],
    }
    const result = identifyAffectedRows(diff, [], { actorTitles: titles })
    expect(result.map((r) => `${r.actorTitle}:${r.wizardKey}`)).toEqual([
      'Alice:starting_loan',
      'Alice:starting_money',
      'Bob:starting_money',
      'Carol:starting_money',
    ])
  })

  it('formats item rows as "name × qty"', () => {
    const existing: ExistingAutogenRow = {
      id: 'e1',
      wizardKey: 'starting_items',
      sourceNodeId: LOOP_ID,
      actorPcId: pcId(1),
      kind: 'item',
      coins: { cp: 0, sp: 0, gp: 0, pp: 0 },
      itemName: 'longsword',
      itemNodeId: null,
      itemQty: 1,
      categorySlug: 'starting_items',
      comment: '',
      handTouched: true,
      canonicalKey: canonicalKey('starting_items', {
        actorPcId: pcId(1),
        itemName: 'longsword',
      }),
    }
    const desired: DesiredRow = {
      ...existing,
      actorPcId: pcId(1), // narrow string | null → string for DesiredRow
      kind: 'item' as const, // narrow money|item|transfer → money|item
      itemQty: 2,
    }
    const diff: RowDiff = {
      toInsert: [],
      toUpdate: [{ existing, desired }],
      toDelete: [],
      unchanged: [],
    }
    const result = identifyAffectedRows(diff, [])
    expect(result[0].currentDisplay).toBe('longsword × 1')
    expect(result[0].configDisplay).toBe('longsword × 2')
  })

  it('formats mixed denominations correctly (1 sp + 50 cp → +1.5 gp)', () => {
    const existing = existingMoney({
      wizardKey: 'starting_money',
      pc: pcId(1),
      gp: 0,
      handTouched: true,
    })
    existing.coins = { cp: 50, sp: 1, gp: 0, pp: 0 }
    const desired = desiredMoney({
      wizardKey: 'starting_money',
      pc: pcId(1),
      gp: 5,
    })
    const diff: RowDiff = {
      toInsert: [],
      toUpdate: [{ existing, desired }],
      toDelete: [],
      unchanged: [],
    }
    const result = identifyAffectedRows(diff, [])
    // 50 cp = 0.5 gp, 1 sp = 0.1 gp → 0.6 gp
    expect(result[0].currentDisplay).toBe('+0.6 gp')
    expect(result[0].configDisplay).toBe('+5 gp')
  })
})
