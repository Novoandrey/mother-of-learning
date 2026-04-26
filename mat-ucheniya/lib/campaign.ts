import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isHpMethod, type HpMethod } from '@/lib/statblock'
import {
  DEFAULT_ITEM_PRICES,
  parseItemDefaultPrices,
  type ItemDefaultPrices,
} from '@/lib/item-default-prices'

// Re-export for backwards-compat: callers were importing these
// names from '@/lib/campaign' before the pure-module split. Keep
// the surface stable to avoid touching every site.
export {
  DEFAULT_ITEM_PRICES,
  parseItemDefaultPrices,
  RARITY_KEYS,
} from '@/lib/item-default-prices'
export type {
  ItemDefaultPrices,
  RarityKey,
  RarityPriceMap,
} from '@/lib/item-default-prices'

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
