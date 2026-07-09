import { describe, it, expect } from 'vitest'
import { formatLedgerEvent, type LedgerEvent, type ResolvedNames } from '../ledger-format'

const names = (
  participantTitles: string[],
  recipientPcTitle: string | null = null,
): ResolvedNames => ({
  playerName: null,
  pcTitle: null,
  recipientPcTitle,
  participantTitles,
})

describe('formatLedgerEvent — craft (spec-056)', () => {
  it('полный случай: время, крафтеры с часами (в т.ч. дробными), получатель-PC, вложено', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: 'u',
      participants: [
        { pcId: 'a', hours: 2 },
        { pcId: 'b', hours: 1.5 },
      ],
      target: 'Кольцо защиты разума',
      loopNumber: 7,
      dayInLoop: 12,
      startMinute: 9 * 60 + 30, // 09:30
      investedGp: 225,
      recipientPcId: 'z',
      mode: 'craft',
    }
    expect(formatLedgerEvent(ev, names(['Британия', 'Аврора'], 'Зак Новеда'))).toBe(
      '🛠 <b>Крафт</b>\n' +
        'Петля 7, День 12 · с 09:30\n' +
        'Британия (2 ч) и Аврора (1.5 ч)\n' +
        'Скрафчено: Кольцо защиты разума → Зак Новеда\n' +
        'Вложено: 225 зм',
    )
  })

  it('без времени — шапка без «· с HH:MM»', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: null,
      participants: [{ pcId: 'a', hours: 1 }],
      target: 'Палочка снарядов',
      loopNumber: 7,
      dayInLoop: 3,
      investedGp: 75,
      recipientPcId: null,
    }
    const out = formatLedgerEvent(ev, names(['Стас']))
    expect(out).toContain('🛠 <b>Крафт</b>\nПетля 7, День 3\nСтас (1 ч)')
    expect(out).not.toContain('·')
  })

  it('получатель null → «в общак»; PC → его имя', () => {
    const base: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: null,
      participants: [{ pcId: 'a', hours: 5 }],
      target: 'Амулет здоровья',
      loopNumber: 7,
      dayInLoop: 1,
      investedGp: 250,
      recipientPcId: null,
      mode: 'craft',
    }
    expect(formatLedgerEvent(base, names(['Аврора']))).toContain(
      'Скрафчено: Амулет здоровья → в общак',
    )
    expect(
      formatLedgerEvent(
        { ...base, recipientPcId: 'z' },
        names(['Аврора'], 'Миряна'),
      ),
    ).toContain('Скрафчено: Амулет здоровья → Миряна')
  })

  it('разбор: шапка «Разбор», «Разобрано:», без крафтеров и без «Вложено»', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: null,
      participants: [],
      target: 'Очки опознания',
      loopNumber: 7,
      dayInLoop: 4,
      mode: 'disassemble',
    }
    expect(formatLedgerEvent(ev, names([]))).toBe(
      '🛠 <b>Разбор</b>\nПетля 7, День 4\nРазобрано: Очки опознания',
    )
  })

  it('investedGp 0/omitted → строки «Вложено» нет', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: null,
      participants: [{ pcId: 'a', hours: 1 }],
      target: 'Свисток',
      loopNumber: 1,
      dayInLoop: 1,
      investedGp: 0,
    }
    expect(formatLedgerEvent(ev, names(['Стас']))).not.toContain('Вложено')
  })

  it('трое крафтеров — natural list «A, B и C», часы каждого', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: null,
      participants: [
        { pcId: 'a', hours: 2 },
        { pcId: 'b', hours: 2 },
        { pcId: 'c', hours: 1 },
      ],
      target: 'Щит +1',
      loopNumber: 7,
      dayInLoop: 2,
      investedGp: 75,
    }
    expect(formatLedgerEvent(ev, names(['Британия', 'Аврора', 'Миряна']))).toContain(
      'Британия (2 ч), Аврора (2 ч) и Миряна (1 ч)',
    )
  })

  it('экранирует изделие, крафтеров и получателя', () => {
    const ev: LedgerEvent = {
      type: 'craft',
      campaignId: 'c',
      authorUserId: null,
      participants: [{ pcId: 'a', hours: 1 }],
      target: '<Меч> A&B',
      loopNumber: 1,
      dayInLoop: 1,
      recipientPcId: 'z',
      investedGp: 50,
    }
    const out = formatLedgerEvent(ev, names(['<Zak>'], '<Мира&Ко>'))
    expect(out).toContain('&lt;Zak&gt; (1 ч)')
    expect(out).toContain('Скрафчено: &lt;Меч&gt; A&amp;B → &lt;Мира&amp;Ко&gt;')
  })
})
