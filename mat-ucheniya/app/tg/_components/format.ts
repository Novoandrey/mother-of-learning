import type { CoinSet } from '@/lib/transactions'

const DENOM_LABEL: Record<keyof CoinSet, string> = {
  pp: 'пп',
  gp: 'зм',
  sp: 'см',
  cp: 'мм',
}
const DENOM_ORDER: (keyof CoinSet)[] = ['pp', 'gp', 'sp', 'cp']

/** "пп 1 · зм 4 · см 7 · мм 0" — full denomination breakdown. */
export function formatDenoms(coins: CoinSet): string {
  return DENOM_ORDER.map((d) => `${DENOM_LABEL[d]} ${coins[d]}`).join('   ·   ')
}

/** Signed gp display, e.g. "+30 зм" / "−5 зм" (real minus sign, U+2212). */
export function formatSignedGp(gp: number): string {
  const sign = gp < 0 ? '−' : '+'
  return `${sign}${Math.abs(gp)} зм`
}

/** "147 зм" — aggregate, no sign. */
export function formatGp(gp: number): string {
  return `${gp} зм`
}

/** "п4 · д3" — loop/day stamp. */
export function dayLabel(loop: number, day: number): string {
  return `п${loop} · д${day}`
}

export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?'
}

// portraitUrl moved to lib/portraits.ts (spec-030) so desktop + Mini App share
// one implementation. Re-exported here for existing ./format importers.
export { portraitUrl } from '@/lib/portraits'
