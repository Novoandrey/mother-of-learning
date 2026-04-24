import { describe, it, expect } from 'vitest'
import {
  canonicalKey,
  resolveDesiredRowSet,
} from '../starter-setup-resolver'
import type {
  CampaignStarterConfig,
  PcStarterConfig,
} from '../starter-setup'

// ─────────────────────────── fixtures ───────────────────────────

const LOOP_ID = '00000000-0000-0000-0000-loop0000000'
const STASH_ID = '00000000-0000-0000-0000-stash000000'
const CAMPAIGN_ID = '00000000-0000-0000-0000-camp0000000'

function pcId(n: number): string {
  return `00000000-0000-0000-0000-pc${String(n).padStart(10, '0')}`
}

function pcCfg(
  partial: Partial<PcStarterConfig> & { pcId: string },
): PcStarterConfig {
  return {
    pcId: partial.pcId,
    takesStartingLoan: partial.takesStartingLoan ?? true,
    startingCoins: partial.startingCoins ?? { cp: 0, sp: 0, gp: 0, pp: 0 },
    startingItems: partial.startingItems ?? [],
    updatedAt: partial.updatedAt ?? '2026-04-24T00:00:00Z',
  }
}

function campaignCfg(
  partial: Partial<CampaignStarterConfig> = {},
): CampaignStarterConfig {
  return {
    campaignId: CAMPAIGN_ID,
    loanAmount: partial.loanAmount ?? { cp: 0, sp: 0, gp: 0, pp: 0 },
    stashSeedCoins: partial.stashSeedCoins ?? { cp: 0, sp: 0, gp: 0, pp: 0 },
    stashSeedItems: partial.stashSeedItems ?? [],
    updatedAt: partial.updatedAt ?? '2026-04-24T00:00:00Z',
  }
}

// ─────────────────────────── canonicalKey ───────────────────────────

describe('canonicalKey', () => {
  it('produces distinct keys for distinct (wizardKey, actor) pairs', () => {
    const a = canonicalKey('starting_money', { actorPcId: pcId(1) })
    const b = canonicalKey('starting_money', { actorPcId: pcId(2) })
    const c = canonicalKey('starting_loan', { actorPcId: pcId(1) })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(b).not.toBe(c)
  })

  it('is stable across repeated calls with the same input', () => {
    const k1 = canonicalKey('starting_money', { actorPcId: pcId(1) })
    const k2 = canonicalKey('starting_money', { actorPcId: pcId(1) })
    expect(k1).toBe(k2)
  })

  it('includes item name for starting_items wizard', () => {
    const a = canonicalKey('starting_items', {
      actorPcId: pcId(1),
      itemName: 'longsword',
    })
    const b = canonicalKey('starting_items', {
      actorPcId: pcId(1),
      itemName: 'arrows',
    })
    expect(a).not.toBe(b)
  })

  it('normalizes item names (trim + case-insensitive)', () => {
    const a = canonicalKey('starting_items', {
      actorPcId: pcId(1),
      itemName: 'Longsword',
    })
    const b = canonicalKey('starting_items', {
      actorPcId: pcId(1),
      itemName: '  longsword  ',
    })
    expect(a).toBe(b)
  })

  it('omits item name for non-items wizards (defensive)', () => {
    const a = canonicalKey('starting_money', {
      actorPcId: pcId(1),
      itemName: 'should-be-ignored',
    })
    const b = canonicalKey('starting_money', { actorPcId: pcId(1) })
    expect(a).toBe(b)
  })
})

// ─────────────────────────── resolveDesiredRowSet ───────────────────────────

describe('resolveDesiredRowSet', () => {
  it('returns empty for empty campaign cfg + empty PC cfgs', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg(),
      pcCfgs: [],
    })
    expect(rows).toEqual([])
  })

  it('returns empty when PCs exist but every config is empty', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg(),
      pcCfgs: [pcCfg({ pcId: pcId(1) }), pcCfg({ pcId: pcId(2) })],
    })
    expect(rows).toEqual([])
  })

  it('10 PCs × 100 gp starting × 200 gp loan (both flags on) → 20 rows', () => {
    const pcs = Array.from({ length: 10 }, (_, i) =>
      pcCfg({
        pcId: pcId(i),
        takesStartingLoan: true,
        startingCoins: { cp: 0, sp: 0, gp: 100, pp: 0 },
      }),
    )
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg({
        loanAmount: { cp: 0, sp: 0, gp: 200, pp: 0 },
      }),
      pcCfgs: pcs,
    })
    expect(rows).toHaveLength(20)
    expect(rows.filter((r) => r.wizardKey === 'starting_money')).toHaveLength(10)
    expect(rows.filter((r) => r.wizardKey === 'starting_loan')).toHaveLength(10)
  })

  it('one PC with takesStartingLoan=false → 9 credit rows, 10 money rows', () => {
    const pcs = Array.from({ length: 10 }, (_, i) =>
      pcCfg({
        pcId: pcId(i),
        takesStartingLoan: i !== 3, // PC index 3 is Lex
        startingCoins: { cp: 0, sp: 0, gp: 100, pp: 0 },
      }),
    )
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg({
        loanAmount: { cp: 0, sp: 0, gp: 200, pp: 0 },
      }),
      pcCfgs: pcs,
    })
    expect(rows.filter((r) => r.wizardKey === 'starting_money')).toHaveLength(10)
    expect(rows.filter((r) => r.wizardKey === 'starting_loan')).toHaveLength(9)
    // No credit row for the Lex PC.
    expect(
      rows.find(
        (r) => r.wizardKey === 'starting_loan' && r.actorPcId === pcId(3),
      ),
    ).toBeUndefined()
  })

  it('a PC with zero starting coins produces no money row (but loan row stays if flag on)', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg({
        loanAmount: { cp: 0, sp: 0, gp: 200, pp: 0 },
      }),
      pcCfgs: [pcCfg({ pcId: pcId(1), takesStartingLoan: true })],
    })
    expect(rows.filter((r) => r.wizardKey === 'starting_money')).toHaveLength(0)
    expect(rows.filter((r) => r.wizardKey === 'starting_loan')).toHaveLength(1)
  })

  it('stash seed (coins + 2 items) → 3 rows with actor = stash', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg({
        stashSeedCoins: { cp: 0, sp: 0, gp: 50, pp: 0 },
        stashSeedItems: [
          { name: 'arrows', qty: 20 },
          { name: 'healing potion', qty: 2 },
        ],
      }),
      pcCfgs: [],
    })
    const stashRows = rows.filter((r) => r.actorPcId === STASH_ID)
    expect(stashRows).toHaveLength(3)
    expect(stashRows.filter((r) => r.kind === 'money')).toHaveLength(1)
    expect(stashRows.filter((r) => r.kind === 'item')).toHaveLength(2)
  })

  it('PC with 3 starter items produces 3 item rows', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg(),
      pcCfgs: [
        pcCfg({
          pcId: pcId(1),
          startingItems: [
            { name: 'longsword', qty: 1 },
            { name: 'arrows', qty: 20 },
            { name: 'Документы на дом', qty: 1 },
          ],
        }),
      ],
    })
    const itemRows = rows.filter((r) => r.wizardKey === 'starting_items')
    expect(itemRows).toHaveLength(3)
    // Unique narrative items are just strings with qty=1 — same treatment
    // as stackables. Ref: spec Assumptions.
    expect(itemRows.find((r) => r.itemName === 'Документы на дом')).toBeDefined()
  })

  it('emits rows in canonical-key sort order for snapshot stability', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg({
        loanAmount: { cp: 0, sp: 0, gp: 200, pp: 0 },
      }),
      pcCfgs: [
        pcCfg({
          pcId: pcId(2),
          startingCoins: { cp: 0, sp: 0, gp: 100, pp: 0 },
        }),
        pcCfg({
          pcId: pcId(1),
          startingCoins: { cp: 0, sp: 0, gp: 100, pp: 0 },
        }),
      ],
    })
    const keys = rows.map((r) => r.canonicalKey)
    const sorted = [...keys].sort((a, b) => a.localeCompare(b))
    expect(keys).toEqual(sorted)
  })

  it('credit rows have category_slug=credit; money rows have starting_money', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg({
        loanAmount: { cp: 0, sp: 0, gp: 200, pp: 0 },
      }),
      pcCfgs: [
        pcCfg({
          pcId: pcId(1),
          startingCoins: { cp: 0, sp: 0, gp: 100, pp: 0 },
        }),
      ],
    })
    const moneyRow = rows.find((r) => r.wizardKey === 'starting_money')!
    const loanRow = rows.find((r) => r.wizardKey === 'starting_loan')!
    expect(moneyRow.categorySlug).toBe('starting_money')
    expect(loanRow.categorySlug).toBe('credit')
  })

  it('item rows have zero coins (schema invariant)', () => {
    const rows = resolveDesiredRowSet({
      loopNodeId: LOOP_ID,
      stashNodeId: STASH_ID,
      campaignId: CAMPAIGN_ID,
      campaignCfg: campaignCfg(),
      pcCfgs: [
        pcCfg({
          pcId: pcId(1),
          startingItems: [{ name: 'longsword', qty: 1 }],
        }),
      ],
    })
    const itemRow = rows[0]
    expect(itemRow.coins).toEqual({ cp: 0, sp: 0, gp: 0, pp: 0 })
    expect(itemRow.itemName).toBe('longsword')
    expect(itemRow.itemQty).toBe(1)
  })
})
