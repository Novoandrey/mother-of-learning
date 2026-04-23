/**
 * Display formatting for `CoinSet` values — spec-010.
 *
 * Pure functions, no locale dependency. Iterates over
 * `DENOMINATIONS` from the resolver — single source of truth
 * for "which coins exist". Breakdown render order is
 * largest → smallest (display convention); the canonical
 * data-model order stays smallest → largest.
 */

import type { CoinSet } from './transactions';
import { DENOMINATIONS, aggregateGp } from './transaction-resolver';

/**
 * Short per-denomination labels used in the parenthetical breakdown.
 * `cp → c`, `sp → s`, `gp → g`, `pp → p`. Matches the spec
 * clarification convention (`"5 GP (2 g, 20 s, 100 c)"`).
 */
export const DENOM_SHORT: Record<keyof CoinSet, string> = {
  cp: 'c',
  sp: 's',
  gp: 'g',
  pp: 'p',
};

const MINUS_SIGN = '\u2212'; // U+2212, typographic minus (not ASCII hyphen)

/**
 * Format a signed coin set for display.
 *
 *   { gp: 5 }                              → `5 GP`
 *   { gp: -5 }                             → `−5 GP`
 *   { cp: 100, sp: 20, gp: 2 }             → `5 GP (2 g, 20 s, 100 c)`
 *   { cp: -100, sp: -20, gp: -2, pp: 0 }   → `−5 GP (2 g, 20 s, 100 c)`
 *   { cp: 0, sp: 0, gp: 0, pp: 0 }         → `—`
 *
 * Rules:
 *  - Aggregate gp is always primary. Sign rendered once, at the
 *    aggregate level, using a typographic minus.
 *  - Parenthetical breakdown appears only when more than one
 *    denomination is non-zero, and uses absolute values.
 *  - Zero → em-dash (`—`).
 */
export function formatAmount(coins: CoinSet): string {
  const nonZero = DENOMINATIONS.filter((d) => coins[d] !== 0);

  if (nonZero.length === 0) return '\u2014'; // em dash

  const agg = aggregateGp(coins);
  const sign = agg < 0 ? MINUS_SIGN : '';
  const primary = `${sign}${formatGpNumber(Math.abs(agg))} GP`;

  if (nonZero.length <= 1) return primary;

  // Largest → smallest for display. `[...DENOMINATIONS].reverse()`
  // keeps the canonical const as single source of truth.
  const parts = [...DENOMINATIONS]
    .reverse()
    .filter((d) => coins[d] !== 0)
    .map((d) => `${Math.abs(coins[d])} ${DENOM_SHORT[d]}`);

  return `${primary} (${parts.join(', ')})`;
}

/**
 * Round to cp precision (2 decimals) and strip trailing zeros.
 * Integer → bare integer string. `5 → "5"`, `5.5 → "5.5"`,
 * `5.05 → "5.05"`. Wallet block in T018 adds its own `.toFixed(2)`
 * when it wants the padded look.
 */
function formatGpNumber(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
