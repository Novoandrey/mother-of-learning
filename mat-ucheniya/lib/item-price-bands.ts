import type { PriceBand } from './items-types'

/**
 * Map a price (in gold) to its display/filter band. NULL is `priceless`
 * while zero-priced items are explicitly `free`.
 */
export function priceBandFor(priceGp: number | null): PriceBand {
  if (priceGp === null) return 'priceless'
  if (priceGp === 0) return 'free'
  if (priceGp <= 50) return 'cheap'
  if (priceGp <= 500) return 'mid'
  return 'expensive'
}
