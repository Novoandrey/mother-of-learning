/**
 * Pure coin-resolution helpers — spec-010.
 *
 * Everything iterates over `DENOMINATIONS`, so adding a homebrew
 * coin later is: one entry here + one column in the migration
 * + one line in the form. No algorithm rewrite.
 */

import type { CoinSet } from './transactions';

export type Denom = 'cp' | 'sp' | 'gp' | 'pp';

/**
 * Smallest → largest. `resolveSpend` relies on this ordering
 * to prefer mundane coin-use over breaking platinum.
 */
export const DENOMINATIONS: readonly Denom[] = ['cp', 'sp', 'gp', 'pp'];

/** Denomination → gp equivalent. Standard D&D 5e ratios. */
export const GP_WEIGHT: Readonly<Record<Denom, number>> = {
  cp: 0.01,
  sp: 0.1,
  gp: 1,
  pp: 10,
};

/** `cp*0.01 + sp*0.1 + gp*1 + pp*10` — single source of truth for gp-aggregate. */
export function aggregateGp(coins: CoinSet): number {
  return DENOMINATIONS.reduce(
    (sum, d) => sum + coins[d] * GP_WEIGHT[d],
    0,
  );
}

/**
 * Resolve a spend: pick which coins leave the wallet to cover
 * `target_gp` of outflow. Smallest denomination first, whole
 * coins only — never breaks a larger coin into smaller ones.
 *
 * Returns a negated `CoinSet` (all ≤ 0) ready to be written into
 * a transaction row.
 *
 * If holdings cannot cover the target without breaking a larger
 * coin, the returned set reflects only what *was* available and
 * the caller owns the "insufficient funds" surfacing (negative
 * balance display, warning banner, etc.).
 *
 * All arithmetic runs in cp-units to dodge float drift — the
 * 0.01 floor matches the precision the rest of the system uses.
 */
export function resolveSpend(
  holdings: CoinSet,
  target_gp: number,
): CoinSet {
  let remaining_cp = Math.round(target_gp * 100);
  const result: CoinSet = { cp: 0, sp: 0, gp: 0, pp: 0 };

  for (const d of DENOMINATIONS) {
    if (remaining_cp <= 0) break;
    // GP_WEIGHT * 100 yields exact integers (1, 10, 100, 1000) for
    // the canonical 5e denominations; stays safe for future adds
    // within the cp-precision contract.
    const unit_cp = Math.round(GP_WEIGHT[d] * 100);
    const need = Math.floor(remaining_cp / unit_cp);
    const take = Math.min(holdings[d] ?? 0, need);
    result[d] = take;
    remaining_cp -= take * unit_cp;
  }

  return signedCoinsToStored(true, result);
}

/**
 * Resolve an earn: positive amount, credited to the gp pile.
 *
 * Sub-cp precision is rounded away — `target_gp = 0.005` becomes
 * `0.01` (1 cp), not silent data loss. Documented behaviour.
 */
export function resolveEarn(target_gp: number): CoinSet {
  return {
    cp: 0,
    sp: 0,
    gp: Math.round(target_gp * 100) / 100,
    pp: 0,
  };
}

/**
 * Flip sign of every denomination if `negate` is true; identity otherwise.
 * Small helper shared by `resolveSpend` and any direct-coin-entry path
 * that needs to flip an outflow.
 */
export function signedCoinsToStored(negate: boolean, coins: CoinSet): CoinSet {
  if (!negate) return { ...coins };
  return DENOMINATIONS.reduce(
    (acc, d) => {
      // `|| 0` strips the signed-zero JS gives us from `-(0)` — otherwise
      // JSON.stringify / `===` checks surface `-0` in every zero slot.
      acc[d] = -coins[d] || 0;
      return acc;
    },
    { cp: 0, sp: 0, gp: 0, pp: 0 } as CoinSet,
  );
}
