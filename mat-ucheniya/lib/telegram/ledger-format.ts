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

/** Reward line for an expedition; `priceGp` (unit nominal) is set for resources. */
export type ExpeditionRewardLine = { name: string; qty: number; priceGp?: number }

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
  | {
      // A player logged an expedition (spec-055 + доработки): a pack went
      // somewhere on a dated, timed window, spent consumables (paid from the
      // общак), brought reward back to the общак. Narrated as one message.
      type: 'expedition'
      campaignId: string
      authorUserId: string | null
      participantPcIds: string[]
      target: string
      loopNumber: number
      dayInLoop: number
      /** Minute-of-day the вылазка starts (0..1439); omitted for legacy runs. */
      startMinute?: number
      durationMinute?: number
      rewardMoneyGp?: number
      /** Reward items; resources carry `priceGp` (unit nominal) → shown in parens. */
      rewardItems?: ExpeditionRewardLine[]
      /** Consumables spent — list only, no sum (Andrey). */
      consumablesItems?: FeedLineItem[]
    }
  | {
      // A craft act (spec-056): crafters invested hours, the общак paid the
      // working cost, the изделие went to the общак or straight to a PC. One
      // message per act (like 'expedition' — the feed must not flood).
      // mode 'disassemble' is the reverse ritual folded into the same type:
      // an item is destroyed (−1 с общака) to make its schema craftable —
      // no crafters/money, so a separate union member would duplicate the
      // whole shape for two optional fields.
      type: 'craft'
      campaignId: string
      authorUserId: string | null
      /** Крафтеры с часами; имена резолвятся в participantTitles (по порядку). */
      participants: { pcId: string; hours: number }[]
      /** Имя изделия (mode 'craft') или разобранного предмета ('disassemble'). */
      target: string
      loopNumber: number
      dayInLoop: number
      /** Minute-of-day (0..1439) начала работы; omitted = без времени. */
      startMinute?: number
      /** Рабочая цена, списанная с общака; omitted/0 = ничего не списано. */
      investedGp?: number
      /** Получатель изделия (PC node id); null/omitted = общак. */
      recipientPcId?: string | null
      mode?: 'craft' | 'disassemble'
    }
  | {
      // Mass encounter-loot distribution (spec-013) made visible in the feed
      // as ONE aggregate event (spec-053 tail). No PC actor — it summarises a
      // batch spread across several recipients.
      type: 'loot-distributed'
      campaignId: string
      authorUserId: string | null
      encounterTitle: string | null
      rowCount: number
      moneyGp?: number
      itemQty?: number
    }

/** Resolved names for the formatter (all raw, un-escaped). */
export type ResolvedNames = {
  playerName: string | null
  pcTitle: string | null
  recipientPcTitle: string | null
  /** For 'expedition': the pack's PC titles, in order (spec-055). */
  participantTitles?: string[]
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

/** «A» · «A и B» · «A, B и C» — natural Russian list (already-escaped items). */
function naturalList(items: string[]): string {
  if (items.length === 0) return '—'
  if (items.length === 1) return items[0]
  return `${items.slice(0, -1).join(', ')} и ${items[items.length - 1]}`
}

/** Minute-of-day → «HH:MM» (24h wrap). Local to keep this module import-free. */
function hhmm(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = ((min % 60) + 60) % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Invested hours label: whole stays bare, fractional rounds to ≤2 dp. */
function hoursLabel(h: number): string {
  const rounded = Number.isInteger(h) ? h : Math.round(h * 100) / 100
  return `${rounded} ч`
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
    case 'expedition': {
      const pack = names.participantTitles?.length
        ? naturalList(names.participantTitles.map(esc))
        : '—'
      // «Петля N, День X» + optional window «· с HH:MM по HH:MM» (or a
      // multi-day «День X HH:MM → День Y HH:MM» when the run spills over).
      let when = `Петля ${event.loopNumber}, День ${event.dayInLoop}`
      if (event.startMinute != null && event.durationMinute != null) {
        const endTotal = event.startMinute + event.durationMinute
        const endDayOffset = Math.floor(endTotal / 1440)
        when +=
          endDayOffset === 0
            ? ` · с ${hhmm(event.startMinute)} по ${hhmm(endTotal)}`
            : ` ${hhmm(event.startMinute)} → День ${event.dayInLoop + endDayOffset} ${hhmm(endTotal % 1440)}`
      } else if (event.startMinute != null) {
        when += ` · ${hhmm(event.startMinute)}`
      }
      // Consumables (потратили) — list only, no sum.
      const spent = event.consumablesItems ?? []
      const spentSuffix = spent.length
        ? `, потратили:\n${spent.map(itemPart).join(', ')}`
        : '.'
      // Reward (В общак добавлены) — resources show (nominal × qty) in parens.
      const rewardParts: string[] = []
      for (const r of event.rewardItems ?? []) {
        const price = r.priceGp != null ? ` (${zm(r.priceGp * r.qty)})` : ''
        rewardParts.push(`${esc(r.name)} ×${r.qty}${price}`)
      }
      if (event.rewardMoneyGp) rewardParts.push(zm(event.rewardMoneyGp))
      const rewardBlock = rewardParts.length
        ? `\n<b>В общак добавлены:</b>\n${rewardParts.join(', ')}`
        : ''
      return `🧭 <b>Вылазка</b>\n${when}\n${pack} отправились на вылазку «${esc(event.target)}»${spentSuffix}${rewardBlock}`
    }
    case 'craft': {
      const isDisassemble = event.mode === 'disassemble'
      // «Петля N, День X» + optional «· с HH:MM» (окно не гейтится — крафт
      // может быть многодневным, конец не показываем).
      let when = `Петля ${event.loopNumber}, День ${event.dayInLoop}`
      if (event.startMinute != null) when += ` · с ${hhmm(event.startMinute)}`
      const lines = [`🛠 <b>${isDisassemble ? 'Разбор' : 'Крафт'}</b>`, when]
      // Крафтеры с часами: «Имя (2 ч), Имя (1.5 ч) и Имя (3 ч)». Titles come
      // resolved in participantTitles, parallel to event.participants.
      if (event.participants.length > 0) {
        lines.push(
          naturalList(
            event.participants.map((p, i) => {
              const title = names.participantTitles?.[i] ?? '—'
              return `${esc(title)} (${hoursLabel(p.hours)})`
            }),
          ),
        )
      }
      if (isDisassemble) {
        lines.push(`Разобрано: ${esc(event.target)}`)
      } else {
        const to = event.recipientPcId
          ? names.recipientPcTitle
            ? esc(names.recipientPcTitle)
            : '—'
          : 'в общак'
        lines.push(`Скрафчено: ${esc(event.target)} → ${to}`)
      }
      if (event.investedGp) lines.push(`Вложено: ${zm(event.investedGp)}`)
      return lines.join('\n')
    }
    case 'loot-distributed': {
      const title = event.encounterTitle ? ` · «${esc(event.encounterTitle)}»` : ''
      const bits = [`${event.rowCount} строк`]
      if (event.moneyGp) bits.push(zm(event.moneyGp))
      if (event.itemQty) bits.push(`${event.itemQty} предм.`)
      return `🎁 <b>Раздан лут</b>${title}\n${bits.join(' · ')}`
    }
  }
}
