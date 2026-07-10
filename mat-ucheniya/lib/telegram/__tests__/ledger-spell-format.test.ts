import { describe, it, expect } from 'vitest'
import { formatLedgerEvent, type LedgerEvent, type ResolvedNames } from '../ledger-format'

const names = (over: Partial<ResolvedNames> = {}): ResolvedNames => ({
  playerName: null,
  pcTitle: null,
  recipientPcTitle: null,
  participantTitles: [],
  ...over,
})

describe('formatLedgerEvent — свиток (craft mode scribe, spec-059)', () => {
  it('🪄 Свиток: писцы с часами, «Написан: … → …», вложено', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: 'u',
      participants: [
        { pcId: 'a', hours: 20 },
        { pcId: 'b', hours: 20 },
      ],
      target: 'Огненный шар (3 ур.)',
      loopNumber: 7,
      dayInLoop: 5,
      investedGp: 500,
      recipientPcId: null,
      mode: 'scribe',
    }
    expect(formatLedgerEvent(ev, names({ participantTitles: ['Миряна', 'Зак'] }))).toBe(
      '🪄 <b>Свиток</b>\n' +
        'Петля 7, День 5\n' +
        'Миряна (20 ч) и Зак (20 ч)\n' +
        'Написан: Огненный шар (3 ур.) → в общак\n' +
        'Вложено: 500 зм',
    )
  })

  it('свиток получателю-PC', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: null,
      participants: [{ pcId: 'a', hours: 8 }],
      target: 'Свет (заговор)',
      loopNumber: 7,
      dayInLoop: 1,
      investedGp: 15,
      recipientPcId: 'z',
      mode: 'scribe',
    }
    expect(formatLedgerEvent(ev, names({ participantTitles: ['Миряна'], recipientPcTitle: 'Зак' }))).toContain(
      'Написан: Свет (заговор) → Зак',
    )
  })
})

describe('formatLedgerEvent — переподготовка (spec-059)', () => {
  it('полный случай: старое → новое, уровень, цена, актор «Игрок · PC»', () => {
    const ev: LedgerEvent = {
      type: 'reprep',
      campaignId: 'c',
      actorPcId: 'a',
      authorUserId: 'u',
      newSpell: 'Огненный шар',
      oldSpell: 'Свет',
      level: 3,
      costGp: 150,
    }
    expect(formatLedgerEvent(ev, names({ playerName: 'Андрей', pcTitle: 'Миряна' }))).toBe(
      '🔄 <b>Переподготовка</b>\nАндрей · Миряна: Свет → Огненный шар (3 ур.) · −150 зм',
    )
  })

  it('заговор бесплатно, без старого — «(заговор)», без цены', () => {
    const ev: LedgerEvent = {
      type: 'reprep',
      campaignId: 'c',
      actorPcId: 'a',
      authorUserId: null,
      newSpell: 'Луч холода',
      oldSpell: null,
      level: 0,
      costGp: 0,
    }
    expect(formatLedgerEvent(ev, names({ pcTitle: 'Миряна' }))).toBe(
      '🔄 <b>Переподготовка</b>\nМиряна: Луч холода (заговор)',
    )
  })

  it('экранирует имена заклинаний', () => {
    const ev: LedgerEvent = {
      type: 'reprep',
      campaignId: 'c',
      actorPcId: 'a',
      authorUserId: null,
      newSpell: '<A&B>',
      level: 1,
      costGp: 50,
    }
    expect(formatLedgerEvent(ev, names({ pcTitle: 'Зак' }))).toContain('&lt;A&amp;B&gt; (1 ур.)')
  })
})

describe('formatLedgerEvent — копирование в книгу (spec-059)', () => {
  it('свиток→книга: «(со свитка)» + цена', () => {
    const ev: LedgerEvent = {
      type: 'copy',
      campaignId: 'c',
      actorPcId: 'a',
      authorUserId: null,
      spell: 'Огненный шар',
      source: null,
      copyMode: 'scroll-to-book',
      level: 3,
      costGp: 150,
      scrollConsumed: true,
    }
    expect(formatLedgerEvent(ev, names({ pcTitle: 'Зак' }))).toBe(
      '📖 <b>Переписал заклинание</b>\nЗак: Огненный шар (3 ур.) (со свитка) · −150 зм',
    )
  })

  it('книга→книга: «у <источник>» + цена', () => {
    const ev: LedgerEvent = {
      type: 'copy',
      campaignId: 'c',
      actorPcId: 'a',
      authorUserId: null,
      spell: 'Полёт',
      source: 'Тёмный маг',
      copyMode: 'book-to-book',
      level: 3,
      costGp: 150,
    }
    expect(formatLedgerEvent(ev, names({ pcTitle: 'Зак' }))).toBe(
      '📖 <b>Переписал заклинание</b>\nЗак: Полёт (3 ур.) у Тёмный маг · −150 зм',
    )
  })
})
