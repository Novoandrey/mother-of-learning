import { describe, it, expect } from 'vitest'
import { formatLedgerEvent, type LedgerEvent, type ResolvedNames } from '../ledger-format'

const names = (participantTitles: string[]): ResolvedNames => ({
  playerName: null,
  pcTitle: null,
  recipientPcTitle: null,
  participantTitles,
})

describe('formatLedgerEvent — expedition (spec-055 + доработки)', () => {
  it('полный случай: время, расходники, ресурсы с ценой, деньги', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: 'u',
      participantPcIds: ['a', 'b', 'c'],
      target: 'Лес теней',
      loopNumber: 3,
      dayInLoop: 5,
      startMinute: 14 * 60, // 14:00
      durationMinute: 4 * 60 + 30, // → 18:30
      rewardMoneyGp: 120,
      rewardItems: [
        { name: 'Сердце ивы', qty: 1, priceGp: 3000 },
        { name: 'Палец морозного великана', qty: 2, priceGp: 300 },
      ],
      consumablesItems: [
        { name: 'Зелье лечения', qty: 3 },
        { name: 'Факел', qty: 2 },
      ],
    }
    expect(formatLedgerEvent(ev, names(['Британия', 'Аврора', 'Миряна']))).toBe(
      '🧭 <b>Вылазка</b>\n' +
        'Петля 3, День 5 · с 14:00 по 18:30\n' +
        'Британия, Аврора и Миряна отправились на вылазку «Лес теней», потратили:\n' +
        'Зелье лечения ×3, Факел ×2\n' +
        '<b>В общак добавлены:</b>\n' +
        'Сердце ивы ×1 (3000 зм), Палец морозного великана ×2 (600 зм), 120 зм',
    )
  })

  it('без расходников, только деньги в награде', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: 'Город',
      loopNumber: 3,
      dayInLoop: 5,
      startMinute: 9 * 60,
      durationMinute: 2 * 60,
      rewardMoneyGp: 75,
    }
    expect(formatLedgerEvent(ev, names(['Зак Новеда']))).toBe(
      '🧭 <b>Вылазка</b>\n' +
        'Петля 3, День 5 · с 09:00 по 11:00\n' +
        'Зак Новеда отправились на вылазку «Город».\n' +
        '<b>В общак добавлены:</b>\n75 зм',
    )
  })

  it('без награды — нет блока «В общак»', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: 'Пустошь',
      loopNumber: 1,
      dayInLoop: 2,
      startMinute: 60,
      durationMinute: 60,
      consumablesItems: [{ name: 'Факел', qty: 1 }],
    }
    const out = formatLedgerEvent(ev, names(['Стас']))
    expect(out).toContain('Стас отправились на вылазку «Пустошь», потратили:\nФакел ×1')
    expect(out).not.toContain('В общак добавлены')
  })

  it('многодневная вылазка → «День X HH:MM → День Y HH:MM»', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: 'Горы',
      loopNumber: 2,
      dayInLoop: 5,
      startMinute: 22 * 60, // 22:00
      durationMinute: 5 * 60, // → next day 03:00
    }
    expect(formatLedgerEvent(ev, names(['Аврора']))).toContain(
      'Петля 2, День 5 22:00 → День 6 03:00',
    )
  })

  it('legacy без времени → шапка без диапазона', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: 'Лес',
      loopNumber: 4,
      dayInLoop: 10,
    }
    const out = formatLedgerEvent(ev, names(['Стас']))
    expect(out).toContain('🧭 <b>Вылазка</b>\nПетля 4, День 10\nСтас отправились')
    expect(out).not.toContain('·')
  })

  it('обычный лут (без цены) — без скобок; ресурс — со скобками', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: 'Клад',
      loopNumber: 1,
      dayInLoop: 1,
      startMinute: 120,
      durationMinute: 60,
      rewardItems: [
        { name: 'Обычный меч', qty: 1 }, // no price → no parens
        { name: 'Сердце ивы', qty: 2, priceGp: 3000 }, // resource → (6000 зм)
      ],
    }
    const out = formatLedgerEvent(ev, names(['Стас']))
    expect(out).toContain('Обычный меч ×1, Сердце ивы ×2 (6000 зм)')
  })

  it('экранирует участников, цель и предметы', () => {
    const ev: LedgerEvent = {
      type: 'expedition',
      campaignId: 'c',
      authorUserId: null,
      participantPcIds: ['a'],
      target: '<Лес>',
      loopNumber: 1,
      dayInLoop: 1,
      startMinute: 120,
      durationMinute: 60,
      rewardItems: [{ name: 'A&B', qty: 1, priceGp: 10 }],
    }
    const out = formatLedgerEvent(ev, names(['<Zak>']))
    expect(out).toContain('&lt;Zak&gt; отправились на вылазку «&lt;Лес&gt;»')
    expect(out).toContain('A&amp;B ×1 (10 зм)')
  })
})
