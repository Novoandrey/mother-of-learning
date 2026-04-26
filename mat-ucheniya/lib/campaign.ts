import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isHpMethod, type HpMethod } from '@/lib/statblock'

/**
 * Spec-015 follow-up (chat 70). Per-rarity default prices for newly
 * created items. The DM tunes these once per campaign in
 * `/items/settings`; the item form prefills the price input on
 * rarity-change when the user hasn't typed anything yet. Override
 * is just typing your own number.
 *
 * Two tables — magic items vs consumables — because consumables are
 * traditionally priced ~half of equivalent-rarity wondrous gear.
 *
 * Any value may be `null` meaning "no default — leave the price
 * field empty". Storing nulls lets the DM intentionally turn off
 * the prefill for a rarity tier.
 */
export type RarityKey = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary'

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

export type CampaignSettings = {
  hp_method: HpMethod
  item_default_prices: ItemDefaultPrices
  // Future keys go here.
}

export type Campaign = {
  id: string
  name: string
  slug: string
  settings: CampaignSettings
}

const DEFAULT_SETTINGS: CampaignSettings = {
  hp_method: 'average',
  item_default_prices: DEFAULT_ITEM_PRICES,
}

export function parseCampaignSettings(raw: unknown): CampaignSettings {
  const out: CampaignSettings = {
    ...DEFAULT_SETTINGS,
    item_default_prices: { ...DEFAULT_ITEM_PRICES },
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>
    if (isHpMethod(r.hp_method)) out.hp_method = r.hp_method
    if (r.item_default_prices !== undefined) {
      out.item_default_prices = parseItemDefaultPrices(r.item_default_prices)
    }
  }
  return out
}

/**
 * React cache() wraps the campaign lookup so layout + generateMetadata +
 * page share one DB roundtrip per request. A single /c/[slug]/catalog/[id]
 * navigation calls this 3 times — without cache(), that's 3 selects.
 */
export const getCampaignBySlug = cache(
  async (slug: string): Promise<Campaign | null> => {
    const supabase = await createClient()
    const { data } = await supabase
      .from('campaigns')
      .select('id, name, slug, settings')
      .eq('slug', slug)
      .single()
    if (!data) return null
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      settings: parseCampaignSettings((data as { settings?: unknown }).settings),
    }
  },
)
