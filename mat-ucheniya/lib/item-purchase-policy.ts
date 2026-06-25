/**
 * Spec-052 (C-13, C-14). DM per-rarity purchase policy — pure types,
 * constants, parser, and helpers. Mirrors `item-default-prices.ts` and lives
 * in its own module so client components (`item-purchase-policy-editor.tsx`)
 * can import it without dragging in server-only modules.
 *
 * Persisted in `campaigns.settings.item_purchase_policy` (JSONB, no schema
 * change). Two knobs per rarity:
 *   - coefficient: a non-negative multiplier on the buy price (default 1).
 *   - approvalRequired: whether a buy of this rarity needs DM approval,
 *     funding-agnostic (default common/uncommon/rare = false,
 *     very-rare/legendary = true).
 *
 * Buy price = round((item.price_gp ?? rarity-default) × coefficient[rarity]);
 * the base resolution lives in `createPurchase` (it needs the item + the
 * magic/consumable bucket); the coefficient + rounding live here.
 */

import {
  RARITY_KEYS,
  type RarityKey,
  type ItemDefaultPrices,
} from './item-default-prices'
import { pickBucket } from './apply-default-prices'

export type RarityCoefficientMap = Record<RarityKey, number>
export type RarityApprovalMap = Record<RarityKey, boolean>

export type ItemPurchasePolicy = {
  coefficient: RarityCoefficientMap
  approvalRequired: RarityApprovalMap
}

const DEFAULT_COEFFICIENTS: RarityCoefficientMap = {
  common: 1,
  uncommon: 1,
  rare: 1,
  'very-rare': 1,
  legendary: 1,
}

const DEFAULT_APPROVAL: RarityApprovalMap = {
  common: false,
  uncommon: false,
  rare: false,
  'very-rare': true,
  legendary: true,
}

export const DEFAULT_ITEM_PURCHASE_POLICY: ItemPurchasePolicy = {
  coefficient: { ...DEFAULT_COEFFICIENTS },
  approvalRequired: { ...DEFAULT_APPROVAL },
}

function parseCoefficients(raw: unknown): RarityCoefficientMap {
  const out: RarityCoefficientMap = { ...DEFAULT_COEFFICIENTS }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const k of RARITY_KEYS) {
    const v = r[k]
    // Non-negative finite number; anything else falls back to the default 1.
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v
  }
  return out
}

function parseApproval(raw: unknown): RarityApprovalMap {
  const out: RarityApprovalMap = { ...DEFAULT_APPROVAL }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  const r = raw as Record<string, unknown>
  for (const k of RARITY_KEYS) {
    const v = r[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}

export function parseItemPurchasePolicy(raw: unknown): ItemPurchasePolicy {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return DEFAULT_ITEM_PURCHASE_POLICY
  }
  const r = raw as Record<string, unknown>
  return {
    coefficient: parseCoefficients(r.coefficient),
    approvalRequired: parseApproval(r.approvalRequired),
  }
}

/**
 * Normalise an unknown rarity string to a `RarityKey`, defaulting to
 * 'common' (the gentlest gate — coefficient 1, no approval). Catalog data
 * uses the five canonical slugs; anything odd is treated as common.
 */
export function normalizeRarity(raw: unknown): RarityKey {
  if (typeof raw === 'string' && (RARITY_KEYS as readonly string[]).includes(raw)) {
    return raw as RarityKey
  }
  return 'common'
}

export function coefficientFor(policy: ItemPurchasePolicy, rarity: RarityKey): number {
  return policy.coefficient[rarity] ?? 1
}

export function approvalRequiredFor(
  policy: ItemPurchasePolicy,
  rarity: RarityKey,
): boolean {
  return policy.approvalRequired[rarity] ?? false
}

/**
 * Charged buy price = round(baseGp × coefficient[rarity]). Returns null when
 * there is no base price (the item isn't buyable, C-10). Rounds half-up to a
 * whole gp.
 */
export function chargedPriceGp(
  baseGp: number | null,
  rarity: RarityKey,
  policy: ItemPurchasePolicy,
): number | null {
  if (baseGp == null || !Number.isFinite(baseGp)) return null
  return Math.round(baseGp * coefficientFor(policy, rarity))
}

/**
 * A set buy's approval aggregates by max rarity (C-16): it needs approval if
 * ANY constituent rarity requires it. `rarities` is the per-line rarity list.
 */
export function setBuyRequiresApproval(
  policy: ItemPurchasePolicy,
  rarities: ReadonlyArray<RarityKey>,
): boolean {
  return rarities.some((r) => approvalRequiredFor(policy, r))
}

/**
 * Resolve the per-unit buy price exactly as createPurchase does (C-13):
 *   base    = item.price_gp ?? rarity-default for the item's bucket
 *             (magic vs consumable, via pickBucket)
 *   charged = round(base × coefficient[rarity])
 * Returns null when there is no base price (the item isn't buyable, C-10).
 * Pure — the single source of truth for buy pricing, unit-tested directly.
 */
export function resolveBuyUnitPriceGp(args: {
  priceGp: number | null
  categorySlug: string
  rarity: RarityKey
  defaults: ItemDefaultPrices
  policy: ItemPurchasePolicy
}): number | null {
  const { priceGp, categorySlug, rarity, defaults, policy } = args
  const base = priceGp ?? defaults[pickBucket(categorySlug)][rarity]
  return chargedPriceGp(base, rarity, policy)
}
