/**
 * Ledger master message (spec-054) — PURE renderer for the pinned money
 * dashboard. No DB, no env, no I/O; unit-tested, safe to import anywhere.
 *
 * Renders `MasterState` → HTML for `sendMessage`/`editMessageText`
 * (`parse_mode: HTML`). Content (D1): current loop + общак balance + per-PC
 * **money** balances (no item holdings), with the recent transaction feed
 * folded under a collapsible `<blockquote expandable>` in the same message.
 *
 * This is the **swappable render seam** (D4/FR-009): a Rich Messages sibling
 * (`renderMasterMessageRich`) can land beside `renderMasterMessageHtml` and be
 * selected by the orchestrator without touching compose or storage. The impure
 * side (`ledger-master.ts`) only knows "state in → payload out".
 *
 * All dynamic text is HTML-escaped here (shared `esc`/`zm` from ledger-format).
 */
import { esc, zm } from '@/lib/telegram/ledger-format'

/** One campaign PC's money balance for the current loop. */
export type MasterPcBalance = { title: string; gp: number }

/** One recent movement for the collapsible feed (structured; wording is here). */
export type MasterRecentRow = {
  actorTitle: string | null
  /** Set only for item rows; money rows leave it null. */
  itemName: string | null
  itemQty: number
  /** Signed gp-equivalent (negative = outflow). Used for money rows. */
  signedGp: number
}

export type MasterState = {
  loopNumber: number
  loopTitle: string | null
  stashGp: number
  /**
   * Items sitting in the общак this loop (net qty > 0); empty ⇒ no items line.
   * `priceGp` (unit номинал) is set only on resources — they render their line
   * value «×qty (сумма)»; regular loot leaves it unset.
   */
  stashItems: { name: string; qty: number; priceGp?: number }[]
  /** Total sell value of unsold resources in the общак (Σ priceGp×qty); 0 ⇒ hidden. */
  stashResourceValueGp: number
  /** Every campaign PC's money balance (caller-sorted). */
  pcs: MasterPcBalance[]
  /** Recent movements, newest first. */
  recent: MasterRecentRow[]
}

/**
 * Conservative ceiling under Telegram's 4096 hard cap. We count raw HTML length,
 * which OVER-counts (tags and `&lt;`-style entities don't count toward the
 * visible-text limit Telegram measures), so this margin never risks a 400 from
 * editMessageText — worst case we drop a couple of extra feed lines.
 */
const MAX_LEN = 3900

/** Code-point length — closer to Telegram's counting than UTF-16 `.length`. */
function cp(s: string): number {
  return [...s].length
}

/** One compact history line for the collapsible feed. Escapes dynamic text. */
export function formatRecentLine(row: MasterRecentRow): string {
  const who = row.actorTitle ? esc(row.actorTitle) : '—'
  if (row.itemName) return `${who}: ${esc(row.itemName)} ×${row.itemQty}`
  const sign = row.signedGp < 0 ? '−' : '+'
  return `${who}: ${sign}${zm(Math.abs(row.signedGp))}`
}

/**
 * PURE. Build the HTML master message. The dashboard (loop + общак + per-PC
 * money) always survives; the feed tail is clamped newest-first to fit under
 * `MAX_LEN`, and any drop is marked (FR-007).
 */
export function renderMasterMessageHtml(state: MasterState): string {
  const loopTitle = state.loopTitle?.trim()
  const head =
    `🧾 <b>Казна отряда — Петля ${state.loopNumber}</b>` +
    (loopTitle ? ` · ${esc(loopTitle)}` : '')

  // Items sitting in the общак this loop, compact and comma-joined under the
  // balance. Resources also show their line value in parens (номинал × qty);
  // regular loot shows none. Nothing shown when the stash holds no items.
  const stashItems = state.stashItems.length
    ? `\n📦 ${state.stashItems
        .map((it) =>
          it.priceGp != null
            ? `${esc(it.name)} ×${it.qty} (${zm(it.priceGp * it.qty)})`
            : `${esc(it.name)} ×${it.qty}`,
        )
        .join(', ')}`
    : ''
  // The общак headline; when unsold resources sit inside, append their total
  // sell value so the DM sees «cash + potential» at a glance.
  const resourceValue =
    state.stashResourceValueGp > 0
      ? `, +${zm(state.stashResourceValueGp)} в ресурсах`
      : ''
  const stash = `💰 Общак: <b>${zm(state.stashGp)}</b>${resourceValue}${stashItems}`

  // Hide exact-zero PC balances so the dashboard doesn't fill with
  // "• Name — 0 зм": balances are per-loop, so most PCs sit at 0 early in a
  // loop. Negative balances are kept (a real state worth surfacing). The общак
  // line above always shows, even at 0 — it's the headline number, not clutter.
  const shownPcs = state.pcs.filter((p) => p.gp !== 0)
  const pcBlock =
    state.pcs.length === 0
      ? '<i>Пока нет персонажей.</i>'
      : shownPcs.length === 0
        ? '<i>Все балансы по нулям.</i>'
        : shownPcs.map((p) => `• ${esc(p.title)} — ${zm(p.gp)}`).join('\n')

  const dashboard = `${head}\n\n${stash}\n\n${pcBlock}`

  if (state.recent.length === 0) return dashboard

  const feedHead = '\n\n📜 <b>Лента</b>'
  const openTag = '\n<blockquote expandable>'
  const closeTag = '</blockquote>'
  // Budget for feed lines = the cap minus everything fixed, minus a small
  // reserve for the truncation note ("… ещё 999").
  const budget = MAX_LEN - cp(dashboard) - cp(feedHead) - cp(openTag) - cp(closeTag) - 16

  const lines: string[] = []
  let used = 0
  let dropped = 0
  for (let i = 0; i < state.recent.length; i++) {
    const line = formatRecentLine(state.recent[i])
    const add = cp(line) + 1 // + newline
    if (used + add > budget) {
      dropped = state.recent.length - i
      break
    }
    lines.push(line)
    used += add
  }
  if (dropped > 0) lines.push(`… ещё ${dropped}`)

  return `${dashboard}${feedHead}${openTag}${lines.join('\n')}${closeTag}`
}
