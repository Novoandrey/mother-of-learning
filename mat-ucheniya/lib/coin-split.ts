/**
 * Spec-013 — Even coin split helper.
 *
 * Pure, no I/O. Tested in `__tests__/coin-split.test.ts`.
 *
 * Algorithm:
 *   1. Convert all denominations to copper: `total = cp + 10·sp +
 *      100·gp + 1000·pp`.
 *   2. Each recipient gets `floor(total / N)` cp.
 *   3. Distribute the remainder cp-by-cp to the first `total % N`
 *      recipients in input order. (E.g. 31 gp / 3 PCs = 3100 cp / 3
 *      = 1033 cp each, remainder 1 cp goes to the first PC. So
 *      PC[0] = 1034 cp, PC[1] = 1033 cp, PC[2] = 1033 cp.)
 *   4. Each per-recipient cp total is then split greedily into the
 *      largest denominations (pp → gp → sp → cp).
 *
 * The greedy denomination output is a presentation choice: the DM
 * sees "1 pp" instead of "1000 cp" or "10 gp". If the campaign has
 * weight rules and someone wants raw cp, they hand-edit the row
 * post-apply — that's out of scope here.
 *
 * Edge cases:
 *   - `recipientCount === 0` → returns `[]`. Caller decides whether
 *     to skip the line or surface an error.
 *   - All-zero totals → returns `recipientCount` rows of all-zero
 *     denominations. Downstream `resolveEncounterLootDesiredRows`
 *     drops them after merge.
 *   - Negative totals → not handled here; validation rejects them
 *     upstream (see `encounter-loot-validation.ts`).
 */

export type CoinTotals = {
  cp: number
  sp: number
  gp: number
  pp: number
}

export function splitCoinsEvenly(
  totals: CoinTotals,
  recipientCount: number,
): CoinTotals[] {
  if (recipientCount <= 0) return []

  const totalCp =
    totals.cp + 10 * totals.sp + 100 * totals.gp + 1000 * totals.pp

  const baseCpPer = Math.floor(totalCp / recipientCount)
  const remainder = totalCp - baseCpPer * recipientCount

  const out: CoinTotals[] = []
  for (let i = 0; i < recipientCount; i++) {
    // First `remainder` recipients get one extra cp.
    const cpForThis = baseCpPer + (i < remainder ? 1 : 0)
    out.push(greedyDenominations(cpForThis))
  }
  return out
}

/**
 * Convert a copper total into a denomination breakdown, preferring
 * larger denominations. Pure function exposed for direct testing.
 */
export function greedyDenominations(totalCp: number): CoinTotals {
  let remaining = totalCp
  const pp = Math.floor(remaining / 1000)
  remaining -= pp * 1000
  const gp = Math.floor(remaining / 100)
  remaining -= gp * 100
  const sp = Math.floor(remaining / 10)
  remaining -= sp * 10
  const cp = remaining
  return { cp, sp, gp, pp }
}
