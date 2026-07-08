/**
 * Expeditions (Вылазки) — spec-055. PURE helpers, no I/O, no server-only
 * imports, so this is unit-testable and safe to import anywhere. The
 * server action (`app/actions/expeditions.ts`) does the DB work — price
 * lookup, stash resolution, writes — and calls the pure math here.
 *
 * The one piece of real arithmetic is `computeConsumablesCostGp`: given the
 * per-line resolved unit prices (authoritatively priced server-side, exactly
 * as `createPurchase` prices a buy via `resolveBuyUnitPriceGp`), sum the
 * total the общак pays. A line with no price (free-text consumable, or a
 * catalog item the DM never priced) contributes 0 — a вылазка must never fail
 * to log because someone typed a consumable that isn't in the catalog.
 */

/** One consumable line, with its unit price already resolved server-side. */
export type ConsumableLineCost = {
  /** Charged per-unit price in gp, or null when the item has no price. */
  unitPriceGp: number | null
  /** Quantity spent. Non-positive quantities contribute nothing. */
  qty: number
}

/**
 * Sum the общак's consumables spend for a run. A `null` unit price (unpriced
 * catalog item or free-text line) counts as 0 gp — never throws, never NaN.
 * Non-positive / non-finite quantities are floored to 0. The result is
 * rounded to whole gp (the same granularity buy prices already round to).
 */
export function computeConsumablesCostGp(lines: ConsumableLineCost[]): number {
  let total = 0
  for (const line of lines) {
    const unit = line.unitPriceGp
    if (unit == null || !Number.isFinite(unit) || unit <= 0) continue
    const qty = Number.isFinite(line.qty) && line.qty > 0 ? line.qty : 0
    total += unit * qty
  }
  return Math.round(total)
}
