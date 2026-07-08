/**
 * Resources (Ресурсы) — spec-055 «Вылазки». PURE helpers, no I/O, no
 * server-only imports — unit-testable and safe to import anywhere. The server
 * action (`app/actions/resources.ts`) does the DB work (catalog create, stash
 * holdings read, transaction writes) and calls the pure math here.
 *
 * A «ресурс» is a permanent catalog item (category 'resource') with a nominal
 * `price_gp` (e.g. «Сердце ивы» 3000 зм). It's sold FROM the общак at that
 * nominal, with a chosen quantity — the sale credits the общак and withdraws
 * the stock.
 */

/**
 * The gp the общак earns for selling `qty` of a resource at its nominal
 * `priceGp`. Rounded to whole gp — transaction amount columns are integers
 * (mig 034) and every "money from the world" flow rounds the same way. A
 * non-finite / non-positive qty or price yields 0 (never NaN, never negative);
 * the caller decides whether a 0-gp sale still writes an income row (the ledger
 * forbids a zero-amount money row — mig 034 kind↔amount CHECK).
 */
export function computeSoldGp(priceGp: number, qty: number): number {
  if (!Number.isFinite(priceGp) || priceGp <= 0) return 0
  if (!Number.isFinite(qty) || qty <= 0) return 0
  return Math.round(priceGp * qty)
}

/**
 * Net quantity of an item currently held, from its approved item-transaction
 * rows: sum of signed `item_qty` (deposits +, withdrawals −; mig 036). This is
 * the canonical stash-holdings math — `getStashItemHoldingsTg` nets the same
 * way, keyed by item name. Non-finite qty values are ignored.
 */
export function netStashQty(rows: { item_qty: number }[]): number {
  let net = 0
  for (const r of rows) {
    if (Number.isFinite(r.item_qty)) net += r.item_qty
  }
  return net
}
