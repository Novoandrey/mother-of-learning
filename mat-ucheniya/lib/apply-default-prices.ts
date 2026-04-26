/**
 * Spec-016 — Bulk apply plan для default prices.
 *
 * Pure, no I/O. Тестируется в `__tests__/apply-default-prices.test.ts`.
 *
 * Логика мапнига `(category_slug, rarity) → bucket cell`:
 *   • bucket = (category_slug == 'consumable') ? 'consumable' : 'magic'
 *   • cell   = defaults[bucket][rarity]
 *
 * Skip-conditions (item НЕ переписывается):
 *   1. use_default_price = false → opt-out, защищено.
 *   2. rarity ∈ {null, 'artifact'} → defaults table эту band не
 *      покрывает (common→legendary только).
 *   3. cell в defaults = null → DM не задал стандарт для этой
 *      rarity, не зануляем существующую цену.
 *   4. cell === current price → unchanged, нет смысла писать UPDATE.
 *
 * Output даёт одной структурой как `updates` (что писать в БД), так
 * и breakdown counts для toast'а на UI.
 */

import type {
  ItemDefaultPrices,
  RarityKey,
} from './item-default-prices'
import type { Rarity } from './items-types'

export type ApplyPlanItem = {
  itemId: string
  categorySlug: string
  rarity: Rarity | null
  priceGp: number | null
  useDefaultPrice: boolean
}

export type ApplyPlanUpdate = {
  itemId: string
  oldPrice: number | null
  newPrice: number
}

export type ApplyPlan = {
  updates: ApplyPlanUpdate[]
  /** items пропущены потому что use_default_price = false */
  skippedByFlag: number
  /** items пропущены потому что rarity ∈ {null, artifact} */
  skippedByRarity: number
  /** items пропущены потому что defaults[bucket][rarity] = null */
  skippedByMissingCell: number
  /** items уже имеют правильную цену — no-op */
  unchanged: number
}

const RARITY_KEYS_IN_DEFAULTS: ReadonlySet<string> = new Set<RarityKey>([
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
])

function pickBucket(categorySlug: string): keyof ItemDefaultPrices {
  return categorySlug === 'consumable' ? 'consumable' : 'magic'
}

export function computeApplyPlan(
  items: ApplyPlanItem[],
  defaults: ItemDefaultPrices,
): ApplyPlan {
  const plan: ApplyPlan = {
    updates: [],
    skippedByFlag: 0,
    skippedByRarity: 0,
    skippedByMissingCell: 0,
    unchanged: 0,
  }

  for (const item of items) {
    if (!item.useDefaultPrice) {
      plan.skippedByFlag += 1
      continue
    }

    if (item.rarity === null || !RARITY_KEYS_IN_DEFAULTS.has(item.rarity)) {
      plan.skippedByRarity += 1
      continue
    }

    const bucket = pickBucket(item.categorySlug)
    const cell = defaults[bucket][item.rarity as RarityKey]

    if (cell === null || cell === undefined) {
      plan.skippedByMissingCell += 1
      continue
    }

    if (cell === item.priceGp) {
      plan.unchanged += 1
      continue
    }

    plan.updates.push({
      itemId: item.itemId,
      oldPrice: item.priceGp,
      newPrice: cell,
    })
  }

  return plan
}
