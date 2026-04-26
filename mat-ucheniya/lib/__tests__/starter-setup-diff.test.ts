import { describe, it, expect } from 'vitest'
import { diffRowSets } from '../starter-setup-diff'
import { canonicalKey } from '../starter-setup-resolver'
import type {
  CoinSet,
  DesiredRow,
  ExistingAutogenRow,
  WizardKey,
} from '../starter-setup'

// ─────────────────────────── fixtures ───────────────────────────

const LOOP_ID = '00000000-0000-0000-0000-loop0000000'

function pcId(n: number): string {
  return `00000000-0000-0000-0000-pc${String(n).padStart(10, '0')}`
}

function desiredMoney(opts: {
  wizardKey: WizardKey
  pc: string
  gp: number
  categorySlug?: string
}): DesiredRow {
  const coins: CoinSet = { cp: 0, sp: 0, gp: opts.gp, pp: 0 }
  return {
    wizardKey: opts.wizardKey,
    sourceNodeId: LOOP_ID,
    actorPcId: opts.pc,
    kind: 'money',
    coins,
    itemName: null,
    itemNodeId: null,
    itemQty: 1,
    categorySlug: opts.categorySlug ?? 'starting_money',
    comment: '',
    canonicalKey: canonicalKey(opts.wizardKey, { actorPcId: opts.pc }),
  }
}

function desiredItem(opts: {
  pc: string
  name: string
  qty: number
  itemNodeId?: string | null
}): DesiredRow {
  return {
    wizardKey: 'starting_items',
    sourceNodeId: LOOP_ID,
    actorPcId: opts.pc,
    kind: 'item',
    coins: { cp: 0, sp: 0, gp: 0, pp: 0 },
    itemName: opts.name,
    itemNodeId: opts.itemNodeId ?? null,
    itemQty: opts.qty,
    categorySlug: 'starting_items',
    comment: '',
    canonicalKey: canonicalKey('starting_items', {
      actorPcId: opts.pc,
      itemName: opts.name,
    }),
  }
}

function existingFromDesired(
  desired: DesiredRow,
  opts?: { id?: string; handTouched?: boolean },
): ExistingAutogenRow {
  return {
    id: opts?.id ?? crypto.randomUUID(),
    wizardKey: desired.wizardKey,
    sourceNodeId: desired.sourceNodeId,
    actorPcId: desired.actorPcId,
    kind: desired.kind,
    coins: desired.coins,
    itemName: desired.itemName,
    itemNodeId: desired.itemNodeId,
    itemQty: desired.itemQty,
    categorySlug: desired.categorySlug,
    comment: desired.comment,
    handTouched: opts?.handTouched ?? false,
    canonicalKey: desired.canonicalKey,
  }
}

// ─────────────────────────── tests ───────────────────────────

describe('diffRowSets', () => {
  it('no changes → empty insert/update/delete, all in unchanged', () => {
    const d = [
      desiredMoney({ wizardKey: 'starting_money', pc: pcId(1), gp: 100 }),
      desiredMoney({
        wizardKey: 'starting_loan',
        pc: pcId(1),
        gp: 200,
        categorySlug: 'credit',
      }),
    ]
    const e = d.map((r) => existingFromDesired(r))
    const diff = diffRowSets(d, e)
    expect(diff.toInsert).toHaveLength(0)
    expect(diff.toUpdate).toHaveLength(0)
    expect(diff.toDelete).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(2)
  })

  it('config amount changed → one UpdatePair, rest unchanged', () => {
    const dOld = desiredMoney({
      wizardKey: 'starting_loan',
      pc: pcId(1),
      gp: 200,
      categorySlug: 'credit',
    })
    const dNew = desiredMoney({
      wizardKey: 'starting_loan',
      pc: pcId(1),
      gp: 250,
      categorySlug: 'credit',
    })
    const eMoney = existingFromDesired(
      desiredMoney({ wizardKey: 'starting_money', pc: pcId(1), gp: 100 }),
    )
    const eLoan = existingFromDesired(dOld) // at old value

    const diff = diffRowSets(
      [
        desiredMoney({ wizardKey: 'starting_money', pc: pcId(1), gp: 100 }),
        dNew,
      ],
      [eMoney, eLoan],
    )
    expect(diff.toInsert).toHaveLength(0)
    expect(diff.toUpdate).toHaveLength(1)
    expect(diff.toUpdate[0].existing.id).toBe(eLoan.id)
    expect(diff.toUpdate[0].desired).toBe(dNew)
    expect(diff.toDelete).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(1)
  })

  it('new PC added → toInsert has new rows, rest unchanged', () => {
    const existing1 = existingFromDesired(
      desiredMoney({ wizardKey: 'starting_money', pc: pcId(1), gp: 100 }),
    )
    const diff = diffRowSets(
      [
        desiredMoney({ wizardKey: 'starting_money', pc: pcId(1), gp: 100 }),
        desiredMoney({ wizardKey: 'starting_money', pc: pcId(2), gp: 100 }),
      ],
      [existing1],
    )
    expect(diff.toInsert).toHaveLength(1)
    expect(diff.toInsert[0].actorPcId).toBe(pcId(2))
    expect(diff.unchanged).toHaveLength(1)
  })

  it('PC flipped takes_starting_loan=false → loan row goes to toDelete', () => {
    const dMoney = desiredMoney({
      wizardKey: 'starting_money',
      pc: pcId(1),
      gp: 100,
    })
    const existing = [
      existingFromDesired(dMoney),
      existingFromDesired(
        desiredMoney({
          wizardKey: 'starting_loan',
          pc: pcId(1),
          gp: 200,
          categorySlug: 'credit',
        }),
      ),
    ]
    // Desired no longer has loan row.
    const diff = diffRowSets([dMoney], existing)
    expect(diff.toDelete).toHaveLength(1)
    expect(diff.toDelete[0].wizardKey).toBe('starting_loan')
    expect(diff.unchanged).toHaveLength(1)
  })

  it('item name changed → delete old + insert new (not an update)', () => {
    const eOld = existingFromDesired(
      desiredItem({ pc: pcId(1), name: 'arrows', qty: 20 }),
    )
    const diff = diffRowSets(
      [desiredItem({ pc: pcId(1), name: 'bolts', qty: 20 })],
      [eOld],
    )
    expect(diff.toInsert).toHaveLength(1)
    expect(diff.toInsert[0].itemName).toBe('bolts')
    expect(diff.toDelete).toHaveLength(1)
    expect(diff.toDelete[0].itemName).toBe('arrows')
    expect(diff.toUpdate).toHaveLength(0)
  })

  it('item qty changed (same name) → one UpdatePair', () => {
    const existing = existingFromDesired(
      desiredItem({ pc: pcId(1), name: 'arrows', qty: 20 }),
    )
    const diff = diffRowSets(
      [desiredItem({ pc: pcId(1), name: 'arrows', qty: 30 })],
      [existing],
    )
    expect(diff.toUpdate).toHaveLength(1)
    expect(diff.toUpdate[0].desired.itemQty).toBe(30)
  })

  it('orphan existing row (actor not in desired) lands in toDelete', () => {
    // Diff is naive here — orphan-protection is the apply action's job.
    const orphan = existingFromDesired(
      desiredMoney({ wizardKey: 'starting_money', pc: pcId(99), gp: 100 }),
    )
    const diff = diffRowSets([], [orphan])
    expect(diff.toDelete).toHaveLength(1)
    expect(diff.toDelete[0].actorPcId).toBe(pcId(99))
  })

  it('no content change but hand_touched differs → unchanged (handTouched is not a content field)', () => {
    const d = desiredMoney({ wizardKey: 'starting_money', pc: pcId(1), gp: 100 })
    const e = existingFromDesired(d, { handTouched: true })
    const diff = diffRowSets([d], [e])
    expect(diff.toUpdate).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(1)
  })

  it('itemNodeId change → toUpdate (link delta is a content delta)', () => {
    // Spec-015 (T039): when desired has a fresh Образец link and
    // existing was a free-text row, reapply must update.
    const linked = desiredItem({
      pc: pcId(1),
      name: 'Длинный меч',
      qty: 1,
      itemNodeId: '00000000-0000-0000-0000-item000000ms',
    })
    const free = existingFromDesired(
      desiredItem({ pc: pcId(1), name: 'Длинный меч', qty: 1 }),
    )
    const diff = diffRowSets([linked], [free])
    expect(diff.toUpdate).toHaveLength(1)
    expect(diff.toUpdate[0].desired.itemNodeId).toBe(
      '00000000-0000-0000-0000-item000000ms',
    )
  })

  it('itemNodeId equal on both sides → unchanged', () => {
    const id = '00000000-0000-0000-0000-item000000ms'
    const d = desiredItem({
      pc: pcId(1),
      name: 'Длинный меч',
      qty: 1,
      itemNodeId: id,
    })
    const e = existingFromDesired(d)
    const diff = diffRowSets([d], [e])
    expect(diff.toUpdate).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(1)
  })

  it('both empty → all four arrays empty', () => {
    const diff = diffRowSets([], [])
    expect(diff.toInsert).toHaveLength(0)
    expect(diff.toUpdate).toHaveLength(0)
    expect(diff.toDelete).toHaveLength(0)
    expect(diff.unchanged).toHaveLength(0)
  })
})
