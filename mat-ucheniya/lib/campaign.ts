import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isHpMethod, type HpMethod } from '@/lib/statblock'
import {
  DEFAULT_ITEM_PRICES,
  parseItemDefaultPrices,
  type ItemDefaultPrices,
} from '@/lib/item-default-prices'
import {
  DEFAULT_ITEM_PURCHASE_POLICY,
  parseItemPurchasePolicy,
  type ItemPurchasePolicy,
} from '@/lib/item-purchase-policy'
import {
  DEFAULT_CRAFT_SETTINGS,
  parseCraftSettings,
  type CraftSettings,
} from '@/lib/craft-settings'

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
export {
  DEFAULT_ITEM_PURCHASE_POLICY,
  parseItemPurchasePolicy,
} from '@/lib/item-purchase-policy'
export type { ItemPurchasePolicy } from '@/lib/item-purchase-policy'

export type CampaignSettings = {
  hp_method: HpMethod
  item_default_prices: ItemDefaultPrices
  item_purchase_policy: ItemPurchasePolicy
  craft_settings: CraftSettings
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
  item_purchase_policy: DEFAULT_ITEM_PURCHASE_POLICY,
  craft_settings: DEFAULT_CRAFT_SETTINGS,
}

export function parseCampaignSettings(raw: unknown): CampaignSettings {
  const out: CampaignSettings = {
    ...DEFAULT_SETTINGS,
    item_default_prices: { ...DEFAULT_ITEM_PRICES },
    item_purchase_policy: { ...DEFAULT_ITEM_PURCHASE_POLICY },
    // parseCraftSettings(undefined) → deep copy of DEFAULT_CRAFT_SETTINGS
    // (nested rate/rarity/weave objects; a shallow spread would alias them).
    craft_settings: parseCraftSettings(undefined),
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>
    if (isHpMethod(r.hp_method)) out.hp_method = r.hp_method
    if (r.item_default_prices !== undefined) {
      out.item_default_prices = parseItemDefaultPrices(r.item_default_prices)
    }
    if (r.item_purchase_policy !== undefined) {
      out.item_purchase_policy = parseItemPurchasePolicy(r.item_purchase_policy)
    }
    if (r.craft_settings !== undefined) {
      out.craft_settings = parseCraftSettings(r.craft_settings)
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
