import { describe, it, expect } from 'vitest'
import {
  formatLedgerEvent,
  type LedgerEvent,
  type ResolvedNames,
} from '../ledger-format'

// Andrey's actor convention: "Игрок · Персонаж" for the acting side.
const anya: ResolvedNames = {
  playerName: 'Аня',
  pcTitle: 'Зак Новеда',
  recipientPcTitle: null,
}

describe('formatLedgerEvent (spec-053 templates)', () => {
  it('🎒 стартовое снаряжение — items + money inline', () => {
    const ev: LedgerEvent = {
      type: 'starter',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      items: [
        { name: 'Рапира', qty: 1 },
        { name: 'Тепловой куб', qty: 1 },
      ],
      moneyGp: 30,
    }
    expect(formatLedgerEvent(ev, anya)).toBe(
      '🎒 <b>Стартовое снаряжение</b>\n' +
        'Аня · Зак Новеда собрал(а): Рапира ×1, Тепловой куб ×1, 30 зм',
    )
  })

  it('🧰 создан набор — player only (sets are not PC-bound), with total', () => {
    const ev: LedgerEvent = {
      type: 'set-created',
      campaignId: 'c',
      authorUserId: 'u',
      setTitle: 'Выживание',
      items: [
        { name: 'Рапира', qty: 1 },
        { name: 'Тепловой куб', qty: 1 },
      ],
      totalGp: 330,
    }
    expect(
      formatLedgerEvent(ev, { playerName: 'Аня', pcTitle: null, recipientPcTitle: null }),
    ).toBe(
      '🧰 <b>Создан набор</b>\n' +
        'Аня собрал(а) набор «Выживание»: Рапира ×1, Тепловой куб ×1 — 330 зм',
    )
  })

  it('📦 взят набор — with title + total', () => {
    const ev: LedgerEvent = {
      type: 'set-bought',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      setTitle: 'Выживание',
      items: [{ name: 'Рапира', qty: 1 }],
      totalGp: 330,
    }
    expect(formatLedgerEvent(ev, anya)).toBe(
      '📦 <b>Взят набор</b>\n' +
        'Аня · Зак Новеда взял(а) набор «Выживание»: Рапира ×1 — 330 зм',
    )
  })

  it('📦 взят набор — edited list has no title', () => {
    const ev: LedgerEvent = {
      type: 'set-bought',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      setTitle: null,
      items: [{ name: 'Рапира', qty: 1 }],
      totalGp: 330,
    }
    expect(formatLedgerEvent(ev, anya)).toBe(
      '📦 <b>Взят набор</b>\nАня · Зак Новеда взял(а) набор: Рапира ×1 — 330 зм',
    )
  })

  it('📥 в общак — money', () => {
    const ev: LedgerEvent = {
      type: 'stash-put',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      moneyGp: 240,
    }
    expect(formatLedgerEvent(ev, anya)).toBe(
      '📥 <b>В общак</b>\nАня · Зак Новеда положил(а): 240 зм',
    )
  })

  it('📤 из общака — item', () => {
    const ev: LedgerEvent = {
      type: 'stash-take',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      item: { name: 'Рапира', qty: 1 },
    }
    expect(formatLedgerEvent(ev, anya)).toBe(
      '📤 <b>Из общака</b>\nАня · Зак Новеда взял(а): Рапира ×1',
    )
  })

  it('💸 перевод — recipient shows PC only, no player name', () => {
    const ev: LedgerEvent = {
      type: 'transfer',
      campaignId: 'c',
      senderPcId: 'pc',
      recipientPcId: 'pc2',
      authorUserId: 'u',
      moneyGp: 50,
    }
    expect(
      formatLedgerEvent(ev, { ...anya, recipientPcTitle: 'Мираэль' }),
    ).toBe('💸 <b>Перевод</b>\nАня · Зак Новеда → Мираэль: 50 зм')
  })

  it('🛒 покупка — item ×qty за total', () => {
    const ev: LedgerEvent = {
      type: 'purchase',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      item: { name: 'Тепловой куб', qty: 1 },
      totalGp: 30,
    }
    expect(formatLedgerEvent(ev, anya)).toBe(
      '🛒 <b>Покупка</b>\nАня · Зак Новеда купил(а): Тепловой куб ×1 за 30 зм',
    )
  })

  it('💰 доход — with comment', () => {
    const ev: LedgerEvent = {
      type: 'income',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      amountGp: 3000,
      comment: 'стартовое золото',
    }
    expect(formatLedgerEvent(ev, anya)).toBe(
      '💰 <b>Доход</b>\nАня · Зак Новеда: +3000 зм (стартовое золото)',
    )
  })

  it('🔄 началась новая петля — только номер, без actor', () => {
    const ev: LedgerEvent = {
      type: 'loop-started',
      campaignId: 'c',
      authorUserId: 'u',
      loopNumber: 8,
    }
    expect(
      formatLedgerEvent(ev, { playerName: null, pcTitle: null, recipientPcTitle: null }),
    ).toBe('🔄 <b>Началась новая петля</b>\nПетля 8')
  })

  it('actor falls back to PC when the player name is unknown', () => {
    const ev: LedgerEvent = {
      type: 'stash-put',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: null,
      moneyGp: 100,
    }
    expect(
      formatLedgerEvent(ev, { playerName: null, pcTitle: 'Зак Новеда', recipientPcTitle: null }),
    ).toBe('📥 <b>В общак</b>\nЗак Новеда положил(а): 100 зм')
  })

  it('HTML-escapes dynamic text (item names, players)', () => {
    const ev: LedgerEvent = {
      type: 'loot',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      item: { name: 'R&B <меч>', qty: 2 },
    }
    const out = formatLedgerEvent(ev, {
      playerName: 'A<b>',
      pcTitle: 'PC',
      recipientPcTitle: null,
    })
    expect(out).toContain('R&amp;B &lt;меч&gt; ×2')
    expect(out).toContain('A&lt;b&gt; · PC')
    expect(out).not.toContain('<меч>')
  })

  it('long lists collapse под кат (expandable blockquote)', () => {
    const ev: LedgerEvent = {
      type: 'starter',
      campaignId: 'c',
      actorPcId: 'pc',
      authorUserId: 'u',
      items: Array.from({ length: 7 }, (_, i) => ({ name: `Предмет${i}`, qty: 1 })),
    }
    const out = formatLedgerEvent(ev, anya)
    expect(out).toContain('<blockquote expandable>')
    expect(out).toContain('</blockquote>')
    expect(out).toContain('Предмет0 ×1\nПредмет1 ×1')
  })
})
