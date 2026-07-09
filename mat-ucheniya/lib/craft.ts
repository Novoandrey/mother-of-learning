/**
 * Craft (Крафт) — spec-056. PURE helpers, no I/O, no server-only imports —
 * unit-testable and safe to import anywhere (образец: lib/expeditions.ts).
 * The server action (`app/actions/craft.ts`) does the DB work — schema/target
 * resolution, stash wallet, transaction writes — and calls the pure math here.
 * The tunable numbers (rates, per-rarity costs) live in `lib/craft-settings.ts`;
 * this module only combines already-resolved values.
 */

import { RARITY_KEYS, type RarityKey } from './item-default-prices'

/** One crafter line as the client sends it: PC node + invested hours. */
export type CraftParticipantInput = { nodeId: string; hours: number }

/**
 * Sanitise a participants payload down to the stored [{nodeId, hours}] shape:
 * drop lines without a node id or with a non-positive/non-finite hours value,
 * round hours to 2 dp (jsonb hygiene — the UI sends float division leftovers
 * like 1.6666666666666667 when splitting evenly).
 */
export function cleanCraftParticipants(
  list: CraftParticipantInput[] | undefined,
): { nodeId: string; hours: number }[] {
  return (list ?? [])
    .filter(
      (p) =>
        p &&
        typeof p.nodeId === 'string' &&
        p.nodeId.length > 0 &&
        Number.isFinite(p.hours) &&
        p.hours > 0,
    )
    .map((p) => ({ nodeId: p.nodeId, hours: Math.round(p.hours * 100) / 100 }))
}

/** Total invested hours across crafters. Empty list → 0. */
export function totalCraftHours(participants: { hours: number }[]): number {
  let total = 0
  for (const p of participants) {
    if (Number.isFinite(p.hours) && p.hours > 0) total += p.hours
  }
  return Math.round(total * 100) / 100
}

/**
 * How many more hours are needed to cover the working cost at the given rate.
 * 0 = the invested hours already cover it (spec-056 инвариант:
 * `Σ(часы_i) × ставка(БМ) ≥ рабочая цена`). Rounded UP to 2 dp so the error
 * message never under-asks. A non-positive rate with an uncovered cost →
 * Infinity (крафт при нулевой ставке невозможен); a zero cost is always
 * covered.
 */
export function missingCraftHours(input: {
  workCostGp: number
  ratePerHour: number
  totalHours: number
}): number {
  const { workCostGp, ratePerHour, totalHours } = input
  const investedGp = ratePerHour > 0 ? totalHours * ratePerHour : 0
  const missingGp = workCostGp - investedGp
  if (missingGp <= 1e-9) return 0
  if (!(ratePerHour > 0)) return Infinity
  return Math.ceil((missingGp / ratePerHour) * 100) / 100
}

/**
 * Map a raw catalog rarity to the craft-settings rarity key, or `null` for
 * «Кастомная» pricing. Deliberately NOT `normalizeRarity` (which falls back
 * to 'common'): a target with rarity NULL or 'artifact' (outside the craft
 * table) must price via the CUSTOM row, not silently as a common item —
 * see plan-056 «Резолв цены крафта».
 */
export function craftRarityKey(raw: unknown): RarityKey | null {
  if (typeof raw === 'string' && (RARITY_KEYS as readonly string[]).includes(raw)) {
    return raw as RarityKey
  }
  return null
}
