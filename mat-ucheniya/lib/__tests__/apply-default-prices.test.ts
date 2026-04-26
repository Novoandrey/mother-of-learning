import { describe, expect, it } from 'vitest'

import {
  computeApplyPlan,
  type ApplyPlanItem,
} from '../apply-default-prices'
import type { ItemDefaultPrices } from '../item-default-prices'

const FULL_DEFAULTS: ItemDefaultPrices = {
  magic: {
    common: 100,
    uncommon: 500,
    rare: 5000,
    'very-rare': 25000,
    legendary: 50000,
  },
  consumable: {
    common: 50,
    uncommon: 250,
    rare: 2500,
    'very-rare': 12500,
    legendary: 25000,
  },
}

const PARTIAL_DEFAULTS: ItemDefaultPrices = {
  magic: {
    common: 100,
    uncommon: 500,
    rare: null, // gap
    'very-rare': null,
    legendary: 50000,
  },
  consumable: {
    common: null, // gap
    uncommon: null,
    rare: null,
    'very-rare': null,
    legendary: null,
  },
}

describe('computeApplyPlan', () => {
  it('empty input → empty plan', () => {
    const plan = computeApplyPlan([], FULL_DEFAULTS)
    expect(plan).toEqual({
      updates: [],
      skippedByFlag: 0,
      skippedByRarity: 0,
      skippedByMissingCell: 0,
      unchanged: 0,
    })
  })

  it('single magic item with mismatched price → 1 update', () => {
    const items: ApplyPlanItem[] = [
      {
        itemId: 'i1',
        categorySlug: 'magic-item',
        rarity: 'rare',
        priceGp: 1000,
        useDefaultPrice: true,
      },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    expect(plan.updates).toEqual([
      { itemId: 'i1', oldPrice: 1000, newPrice: 5000 },
    ])
    expect(plan.skippedByFlag).toBe(0)
    expect(plan.unchanged).toBe(0)
  })

  it('opt-out flag → skippedByFlag', () => {
    const items: ApplyPlanItem[] = [
      {
        itemId: 'i1',
        categorySlug: 'magic-item',
        rarity: 'legendary',
        priceGp: 100000,
        useDefaultPrice: false, // opt-out
      },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    expect(plan.updates).toEqual([])
    expect(plan.skippedByFlag).toBe(1)
  })

  it('artifact rarity → skippedByRarity', () => {
    const items: ApplyPlanItem[] = [
      {
        itemId: 'i1',
        categorySlug: 'magic-item',
        rarity: 'artifact',
        priceGp: 999999,
        useDefaultPrice: true,
      },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    expect(plan.updates).toEqual([])
    expect(plan.skippedByRarity).toBe(1)
  })

  it('null rarity → skippedByRarity (mundane items)', () => {
    const items: ApplyPlanItem[] = [
      {
        itemId: 'i1',
        categorySlug: 'weapon',
        rarity: null,
        priceGp: 15,
        useDefaultPrice: true,
      },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    expect(plan.skippedByRarity).toBe(1)
  })

  it('missing cell in defaults → skippedByMissingCell', () => {
    const items: ApplyPlanItem[] = [
      {
        itemId: 'i1',
        categorySlug: 'magic-item',
        rarity: 'rare',
        priceGp: 5000,
        useDefaultPrice: true,
      },
    ]
    const plan = computeApplyPlan(items, PARTIAL_DEFAULTS)
    expect(plan.skippedByMissingCell).toBe(1)
    expect(plan.updates).toEqual([])
  })

  it('matching price → unchanged (no UPDATE)', () => {
    const items: ApplyPlanItem[] = [
      {
        itemId: 'i1',
        categorySlug: 'magic-item',
        rarity: 'rare',
        priceGp: 5000, // already matches default
        useDefaultPrice: true,
      },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    expect(plan.updates).toEqual([])
    expect(plan.unchanged).toBe(1)
  })

  it('consumable bucket: category=consumable → consumable cell', () => {
    const items: ApplyPlanItem[] = [
      {
        itemId: 'potion',
        categorySlug: 'consumable',
        rarity: 'uncommon',
        priceGp: 999,
        useDefaultPrice: true,
      },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    // Consumable uncommon = 250 (vs magic uncommon = 500).
    expect(plan.updates).toEqual([
      { itemId: 'potion', oldPrice: 999, newPrice: 250 },
    ])
  })

  it('mixed catalog → all 4 skip kinds + updates', () => {
    const items: ApplyPlanItem[] = [
      // 1 update (magic rare, wrong price)
      { itemId: 'a', categorySlug: 'wondrous', rarity: 'rare', priceGp: 1, useDefaultPrice: true },
      // skipped by flag
      { itemId: 'b', categorySlug: 'magic-item', rarity: 'legendary', priceGp: 9, useDefaultPrice: false },
      // skipped by rarity (artifact)
      { itemId: 'c', categorySlug: 'magic-item', rarity: 'artifact', priceGp: 9, useDefaultPrice: true },
      // skipped by rarity (null)
      { itemId: 'd', categorySlug: 'weapon', rarity: null, priceGp: 9, useDefaultPrice: true },
      // unchanged (matches default)
      { itemId: 'e', categorySlug: 'magic-item', rarity: 'common', priceGp: 100, useDefaultPrice: true },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    expect(plan.updates).toHaveLength(1)
    expect(plan.updates[0].itemId).toBe('a')
    expect(plan.skippedByFlag).toBe(1)
    expect(plan.skippedByRarity).toBe(2)
    expect(plan.unchanged).toBe(1)
    expect(plan.skippedByMissingCell).toBe(0)
  })

  it('null priceGp → produces update if cell exists', () => {
    // Item с priceGp=null and use_default=true → должен получить
    // дефолтную цену.
    const items: ApplyPlanItem[] = [
      { itemId: 'newitem', categorySlug: 'magic-item', rarity: 'common', priceGp: null, useDefaultPrice: true },
    ]
    const plan = computeApplyPlan(items, FULL_DEFAULTS)
    expect(plan.updates).toEqual([
      { itemId: 'newitem', oldPrice: null, newPrice: 100 },
    ])
  })

  it('partial defaults: only legendary → only legendary updated', () => {
    const items: ApplyPlanItem[] = [
      { itemId: 'a', categorySlug: 'magic-item', rarity: 'common', priceGp: 0, useDefaultPrice: true },
      { itemId: 'b', categorySlug: 'magic-item', rarity: 'legendary', priceGp: 0, useDefaultPrice: true },
      { itemId: 'c', categorySlug: 'magic-item', rarity: 'rare', priceGp: 0, useDefaultPrice: true },
    ]
    const plan = computeApplyPlan(items, PARTIAL_DEFAULTS)
    // PARTIAL_DEFAULTS.magic: common=100, uncommon=500, rare=null,
    // very-rare=null, legendary=50000.
    expect(plan.updates).toHaveLength(2)
    const ids = plan.updates.map((u) => u.itemId).sort()
    expect(ids).toEqual(['a', 'b'])
    expect(plan.skippedByMissingCell).toBe(1) // 'c' (rare)
  })
})
