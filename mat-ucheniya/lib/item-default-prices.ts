/**
 * Spec-015 follow-up (chat 70-71). Per-rarity default prices —
 * pure types, constants, and a parser. Lives in its own module
 * because it gets imported by client components
 * (`default-prices-editor.tsx`, `item-form-page.tsx`) which can't
 * pull in `lib/campaign.ts` — the latter transitively imports
 * `next/headers` via `lib/supabase/server.ts`, and Turbopack
 * refuses to bundle that into a client component.
 *
 * `lib/campaign.ts` re-exports from here so existing server-side
 * imports keep working without churn.
 */

export type RarityKey =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'very-rare'
  | 'legendary'

export type RarityPriceMap = Record<RarityKey, number | null>

export type ItemDefaultPrices = {
  magic: RarityPriceMap
  consumable: RarityPriceMap
}

export const RARITY_KEYS: ReadonlyArray<RarityKey> = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
]

const EMPTY_PRICE_MAP: RarityPriceMap = {
  common: null,
  uncommon: null,
  rare: null,
  'very-rare': null,
  legendary: null,
}

export const DEFAULT_ITEM_PRICES: ItemDefaultPrices = {
  magic: { ...EMPTY_PRICE_MAP },
  consumable: { ...EMPTY_PRICE_MAP },
}

function parseRarityMap(raw: unknown): RarityPriceMap {
  const out: RarityPriceMap = { ...EMPTY_PRICE_MAP }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const k of RARITY_KEYS) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
      out[k] = v
    } else if (v === null) {
      out[k] = null
    }
  }
  return out
}

export function parseItemDefaultPrices(raw: unknown): ItemDefaultPrices {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_ITEM_PRICES
  }
  const r = raw as Record<string, unknown>
  return {
    magic: parseRarityMap(r.magic),
    consumable: parseRarityMap(r.consumable),
  }
}
