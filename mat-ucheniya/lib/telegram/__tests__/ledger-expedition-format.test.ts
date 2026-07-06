import { describe, it, expect } from 'vitest'
import { formatLedgerEvent, type LedgerEvent, type ResolvedNames } from '../ledger-format'

const names = (participantTitles: string[]): ResolvedNames => ({
  playerName: null,
  pcTitle: null,
  recipientPcTitle: null,
  participantTitles,
})

describe('formatLedgerEvent — expedition (spec-055)', () => {
  it('участники → цель, получили и потратили', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: 'u',
      participantPcIds: ['a', 'b'],
      target: 'Лес теней',
      rewardMoneyGp: 120,
      rewardItems: [{ name: 'Меч', qty: 1 }],
      consumablesCostGp: 15,
      consumablesItems: [{ name: 'Зелье', qty: 3 }],
    }
    expect(formatLedgerEvent(ev, names(['Британия', 'Аврора']))).toBe(
      '🧭 <b>Вылазка</b>\n' +
        'Британия, Аврора → Лес теней\n' +
        'Получили: Меч ×1, 120 зм\n' +
        'Потратили: Зелье ×3, 15 зм',
    )
  })

  it('без награды/расхода — только пачка и цель', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: 'Город',
    }
    expect(formatLedgerEvent(ev, names(['Стас']))).toBe('🧭 <b>Вылазка</b>\nСтас → Город')
  })

  it('экранирует имена участников, цель и предметы', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: '<Лес>',
      rewardItems: [{ name: 'A&B', qty: 1 }],
    }
    const out = formatLedgerEvent(ev, names(['<Zak>']))
    expect(out).toContain('&lt;Zak&gt; → &lt;Лес&gt;')
    expect(out).toContain('A&amp;B ×1')
  })

  it('пустая пачка → тире', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: [],
      target: 'Никуда',
    }
    expect(formatLedgerEvent(ev, names([]))).toContain('— → Никуда')
  })

  it('длинная награда уходит под кат (>6 частей)', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: 'Клад',
      rewardItems: Array.from({ length: 8 }, (_, i) => ({ name: `Предмет${i}`, qty: 1 })),
    }
    expect(formatLedgerEvent(ev, names(['Аврора']))).toContain('<blockquote expandable>')
  })
})
