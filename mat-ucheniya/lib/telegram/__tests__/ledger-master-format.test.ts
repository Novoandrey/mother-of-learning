import { describe, it, expect } from 'vitest'
import {
  formatRecentLine,
  renderMasterMessageHtml,
  type MasterRecentRow,
  type MasterState,
} from '../ledger-master-format'

function state(over: Partial<MasterState> = {}): MasterState {
  return {
    loopNumber: 5,
    loopTitle: null,
    stashGp: 120,
    pcs: [
      { title: 'Гэри', gp: 30 },
      { title: 'Стас', gp: 12 },
    ],
    recent: [],
    ...over,
  }
}

describe('formatRecentLine', () => {
  const base: MasterRecentRow = {
    actorTitle: 'Гэри',
    itemName: null,
    itemQty: 0,
    signedGp: 0,
  }

  it('money inflow → +N зм', () => {
    expect(formatRecentLine({ ...base, signedGp: 30 })).toBe('Гэри: +30 зм')
  })

  it('money outflow → −N зм (real minus)', () => {
    expect(formatRecentLine({ ...base, signedGp: -5 })).toBe('Гэри: −5 зм')
  })

  it('item row → name ×qty', () => {
    expect(
      formatRecentLine({ ...base, itemName: 'Серп', itemQty: 2, signedGp: 0 }),
    ).toBe('Гэри: Серп ×2')
  })

  it('escapes actor + item names', () => {
    expect(
      formatRecentLine({ actorTitle: 'A&B', itemName: '<meч>', itemQty: 1, signedGp: 0 }),
    ).toBe('A&amp;B: &lt;meч&gt; ×1')
  })

  it('null actor → dash', () => {
    expect(formatRecentLine({ ...base, actorTitle: null, signedGp: 7 })).toBe('—: +7 зм')
  })
})

describe('renderMasterMessageHtml — dashboard', () => {
  it('loop + общак + per-PC money, no feed', () => {
    expect(renderMasterMessageHtml(state())).toBe(
      '🧾 <b>Казна отряда — Петля 5</b>\n\n' +
        '💰 Общак: <b>120 зм</b>\n\n' +
        '• Гэри — 30 зм\n• Стас — 12 зм',
    )
  })

  it('includes the loop title when present', () => {
    const html = renderMasterMessageHtml(state({ loopTitle: 'Проклятый лес' }))
    expect(html).toContain('🧾 <b>Казна отряда — Петля 5</b> · Проклятый лес')
  })

  it('no PCs → placeholder line', () => {
    const html = renderMasterMessageHtml(state({ pcs: [] }))
    expect(html).toContain('<i>Пока нет персонажей.</i>')
  })

  it('hides zero-balance PCs to avoid clutter', () => {
    const html = renderMasterMessageHtml(
      state({
        pcs: [
          { title: 'Гэри', gp: 30 },
          { title: 'Стас', gp: 0 },
          { title: 'Аврора', gp: 1 },
        ],
      }),
    )
    expect(html).toContain('• Гэри — 30 зм')
    expect(html).toContain('• Аврора — 1 зм')
    expect(html).not.toContain('Стас')
  })

  it('keeps negative balances — only exact zero is hidden', () => {
    const html = renderMasterMessageHtml(state({ pcs: [{ title: 'Долг', gp: -5 }] }))
    expect(html).toContain('• Долг — -5 зм')
  })

  it('all PCs at zero → «по нулям», not «нет персонажей»', () => {
    const html = renderMasterMessageHtml(
      state({ pcs: [{ title: 'Гэри', gp: 0 }, { title: 'Стас', gp: 0 }] }),
    )
    expect(html).toContain('Все балансы по нулям')
    expect(html).not.toContain('Гэри')
  })

  it('escapes PC titles', () => {
    const html = renderMasterMessageHtml(state({ pcs: [{ title: '<Zak>', gp: 1 }] }))
    expect(html).toContain('• &lt;Zak&gt; — 1 зм')
  })

  it('money only — never renders item holdings in the dashboard', () => {
    // The dashboard block (before the feed) must carry no "×" quantities.
    const html = renderMasterMessageHtml(state())
    const dashboard = html.split('📜')[0]
    expect(dashboard).not.toContain('×')
  })
})

describe('renderMasterMessageHtml — collapsible feed', () => {
  it('wraps recent movements in an expandable blockquote', () => {
    const html = renderMasterMessageHtml(
      state({
        recent: [
          { actorTitle: 'Гэри', itemName: null, itemQty: 0, signedGp: 30 },
          { actorTitle: 'Стас', itemName: 'Серп', itemQty: 1, signedGp: 0 },
        ],
      }),
    )
    expect(html).toContain('📜 <b>Лента</b>')
    expect(html).toContain('<blockquote expandable>Гэри: +30 зм\nСтас: Серп ×1</blockquote>')
  })

  it('clamps to Telegram’s 4096 cap, drops oldest, marks truncation', () => {
    const recent: MasterRecentRow[] = Array.from({ length: 600 }, (_, i) => ({
      actorTitle: `Персонаж-с-длинным-именем-${i}`,
      itemName: null,
      itemQty: 0,
      signedGp: i,
    }))
    const html = renderMasterMessageHtml(state({ recent }))
    expect([...html].length).toBeLessThanOrEqual(4096)
    expect(html).toContain('… ещё')
    // Dashboard always survives the clamp.
    expect(html).toContain('🧾 <b>Казна отряда — Петля 5</b>')
    // Newest-first: the very first row is kept, the oldest is dropped.
    expect(html).toContain('Персонаж-с-длинным-именем-0')
    expect(html).not.toContain('Персонаж-с-длинным-именем-599')
  })
})
