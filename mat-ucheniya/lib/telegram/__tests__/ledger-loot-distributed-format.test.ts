import { describe, it, expect } from 'vitest'
import { formatLedgerEvent, type LedgerEvent, type ResolvedNames } from '../ledger-format'

const names: ResolvedNames = { playerName: null, pcTitle: null, recipientPcTitle: null }

describe('formatLedgerEvent — loot-distributed (spec-053 tail)', () => {
  it('encounter title + rows + money + items', () => {
    const ev: LedgerEvent = {
      type: 'loot-distributed',
      campaignId: 'c',
      authorUserId: 'u',
      encounterTitle: 'Патруль культистов',
      rowCount: 7,
      moneyGp: 120,
      itemQty: 5,
    }
    expect(formatLedgerEvent(ev, names)).toBe(
      '🎁 <b>Раздан лут</b> · «Патруль культистов»\n7 строк · 120 зм · 5 предм.',
    )
  })

  it('no title, money only', () => {
    const ev: LedgerEvent = {
      type: 'loot-distributed',
      campaignId: 'c',
      authorUserId: null,
      encounterTitle: null,
      rowCount: 2,
      moneyGp: 30,
    }
    expect(formatLedgerEvent(ev, names)).toBe('🎁 <b>Раздан лут</b>\n2 строк · 30 зм')
  })

  it('items only, escapes the encounter title', () => {
    const ev: LedgerEvent = {
      type: 'loot-distributed',
      campaignId: 'c',
      authorUserId: null,
      encounterTitle: '<Логово>',
      rowCount: 3,
      itemQty: 4,
    }
    const out = formatLedgerEvent(ev, names)
    expect(out).toContain('«&lt;Логово&gt;»')
    expect(out).toContain('3 строк · 4 предм.')
  })
})
