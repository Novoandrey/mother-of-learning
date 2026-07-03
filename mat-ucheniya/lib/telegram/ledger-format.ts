/**
 * Ledger feed message templates (spec-053) — PURE. No DB, no env, no I/O, no
 * server-only imports, so it's unit-testable and safe to import anywhere. This
 * is where the wording lives: tweaking a template is a one-line change here.
 *
 * `notifyLedgerEvent` (in `ledger-feed.ts`) resolves names and posts; this file
 * only turns an event + resolved names into the HTML string. All dynamic text
 * is HTML-escaped here (messages are sent with `parse_mode: HTML`).
 *
 * Actor line convention (Andrey): "Игрок · Персонаж" for the acting side; the
 * transfer recipient shows the PC only (no player name). Sets are not PC-bound,
 * so «создан набор» shows the player alone.
 */

export type FeedLineItem = { name: string; qty: number }

/** What the transaction actions emit. Carries IDs; names resolve at post time. */
export type LedgerEvent =
  | {
      type: 'starter'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      items: FeedLineItem[]
      moneyGp?: number
    }
  | {
      type: 'set-created'
      campaignId: string
      authorUserId: string | null
      setTitle: string
      items: FeedLineItem[]
      totalGp: number
    }
  | {
      type: 'set-bought'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      setTitle: string | null
      items: FeedLineItem[]
      totalGp: number
    }
  | {
      type: 'stash-put'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      moneyGp?: number
      item?: FeedLineItem
    }
  | {
      type: 'stash-take'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      moneyGp?: number
      item?: FeedLineItem
    }
  | {
      type: 'transfer'
      campaignId: string
      senderPcId: string
      recipientPcId: string
      authorUserId: string | null
      moneyGp?: number
      item?: FeedLineItem
    }
  | {
      type: 'purchase'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      item: FeedLineItem
      totalGp: number
    }
  | {
      type: 'income'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      amountGp: number
      comment?: string
    }
  | {
      type: 'expense'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      amountGp: number
      comment?: string
    }
  | {
      type: 'loot'
      campaignId: string
      actorPcId: string
      authorUserId: string | null
      item: FeedLineItem
    }
  | {
      // A new loop started (DM applied the loop-start setup). No PC/actor —
      // it's a campaign-wide announcement, like set-created.
      type: 'loop-started'
      campaignId: string
      authorUserId: string | null
      loopNumber: number
    }

/** Resolved names for the formatter (all raw, un-escaped). */
export type ResolvedNames = {
  playerName: string | null
  pcTitle: string | null
  recipientPcTitle: string | null
}

// ── pure helpers ────────────────────────────────────────────────────────────

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Whole gp shows bare; fractional rounds to ≤2 dp. `30` → "30 зм". */
export function zm(n: number): string {
  const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100
  return `${rounded} зм`
}

function itemPart(it: FeedLineItem): string {
  return `${esc(it.name)} ×${it.qty}`
}

/** Actor label: "Игрок · Персонаж", or just one side when the other is absent. */
function actorLabel(names: ResolvedNames): string {
  const player = names.playerName ? esc(names.playerName) : null
  const pc = names.pcTitle ? esc(names.pcTitle) : null
  if (player && pc) return `${player} · ${pc}`
  return player ?? pc ?? '—'
}

/**
 * Render a list of parts as the detail tail: short lists stay inline
 * (", "-joined); long ones (> 6 parts) go под кат in an expandable blockquote
 * so a big starter list / set doesn't flood the topic. Returns a string that
 * already includes its leading separator (" " or "\n").
 */
function detailTail(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length > 6) {
    return `\n<blockquote expandable>${parts.join('\n')}</blockquote>`
  }
  return ` ${parts.join(', ')}`
}

function moneyItemParts(moneyGp: number | undefined, items: FeedLineItem[]): string[] {
  const parts = items.map(itemPart)
  if (moneyGp != null && moneyGp !== 0) parts.push(zm(Math.abs(moneyGp)))
  return parts
}

/** One-of money/item → a single detail token ("240 зм" or "Серп ×1"). */
function oneDetail(moneyGp: number | undefined, item: FeedLineItem | undefined): string {
  if (item) return itemPart(item)
  if (moneyGp != null) return zm(Math.abs(moneyGp))
  return '—'
}

// ── the formatter ───────────────────────────────────────────────────────────

/**
 * PURE. Build the HTML message for an event. All dynamic text is HTML-escaped
 * here. `names` must already be resolved (see `resolveNames` in ledger-feed).
 */
export function formatLedgerEvent(event: LedgerEvent, names: ResolvedNames): string {
  const who = actorLabel(names)
  switch (event.type) {
    case 'starter': {
      const parts = moneyItemParts(event.moneyGp, event.items)
      return `🎒 <b>Стартовое снаряжение</b>\n${who} собрал(а):${detailTail(parts)}`
    }
    case 'set-created':
      return (
        `🧰 <b>Создан набор</b>\n${who} собрал(а) набор «${esc(event.setTitle)}»:` +
        `${detailTail(event.items.map(itemPart))} — ${zm(event.totalGp)}`
      )
    case 'set-bought': {
      const title = event.setTitle ? `«${esc(event.setTitle)}» ` : ''
      return (
        `📦 <b>Взят набор</b>\n${who} взял(а) набор ${title}`.trimEnd() +
        `:${detailTail(event.items.map(itemPart))} — ${zm(event.totalGp)}`
      )
    }
    case 'stash-put':
      return `📥 <b>В общак</b>\n${who} положил(а): ${oneDetail(event.moneyGp, event.item)}`
    case 'stash-take':
      return `📤 <b>Из общака</b>\n${who} взял(а): ${oneDetail(event.moneyGp, event.item)}`
    case 'transfer': {
      const to = names.recipientPcTitle ? esc(names.recipientPcTitle) : '—'
      return `💸 <b>Перевод</b>\n${who} → ${to}: ${oneDetail(event.moneyGp, event.item)}`
    }
    case 'purchase':
      return `🛒 <b>Покупка</b>\n${who} купил(а): ${itemPart(event.item)} за ${zm(event.totalGp)}`
    case 'income':
      return (
        `💰 <b>Доход</b>\n${who}: +${zm(Math.abs(event.amountGp))}` +
        (event.comment ? ` (${esc(event.comment)})` : '')
      )
    case 'expense':
      return (
        `💸 <b>Расход</b>\n${who}: −${zm(Math.abs(event.amountGp))}` +
        (event.comment ? ` (${esc(event.comment)})` : '')
      )
    case 'loot':
      return `🎁 <b>Получен предмет</b>\n${who}: ${itemPart(event.item)}`
    case 'loop-started':
      return `🔄 <b>Началась новая петля</b>\nПетля ${event.loopNumber}`
  }
}
