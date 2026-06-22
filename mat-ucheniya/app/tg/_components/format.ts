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

/** R2 portrait URL from a key, or null when no key / base configured. */
export function portraitUrl(key: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_R2_PORTRAIT_BASE
  if (!key || !base) return null
  return `${base.replace(/\/$/, '')}/${key}`
}
