import { describe, expect, it } from 'vitest';

import { groupItems, priceBandFor, rarityOrder, sortItems } from '../items-grouping';
import type { ItemNode, Rarity } from '../items-types';

function item(partial: Partial<ItemNode>): ItemNode {
  return {
    id: 'i1',
    campaignId: 'c1',
    title: 'X',
    categorySlug: 'misc',
    rarity: null,
    priceGp: null,
    weightLb: null,
    slotSlug: null,
    sourceSlug: null,
    availabilitySlug: null,
    srdSlug: null,
    description: null,
    sourceDetail: null,
    ...partial,
  };
}

// ─────────────────────────── priceBandFor ───────────────────────────

describe('priceBandFor', () => {
  it('null → priceless', () => expect(priceBandFor(null)).toBe('priceless'));
  it('0 → free', () => expect(priceBandFor(0)).toBe('free'));
  it('1 → cheap', () => expect(priceBandFor(1)).toBe('cheap'));
  it('50 → cheap (boundary)', () => expect(priceBandFor(50)).toBe('cheap'));
  it('51 → mid', () => expect(priceBandFor(51)).toBe('mid'));
  it('500 → mid (boundary)', () => expect(priceBandFor(500)).toBe('mid'));
  it('501 → expensive', () => expect(priceBandFor(501)).toBe('expensive'));
  it('1000000 → expensive', () => expect(priceBandFor(1_000_000)).toBe('expensive'));
});

// ─────────────────────────── rarityOrder ───────────────────────────

describe('rarityOrder', () => {
  it('null → 0 (sorts before common)', () => expect(rarityOrder(null)).toBe(0));
  it('common → 1', () => expect(rarityOrder('common')).toBe(1));
  it('artifact → 6 (top of ladder)', () => expect(rarityOrder('artifact')).toBe(6));
  it('preserves canonical order', () => {
    const ladder: Rarity[] = [
      'common',
      'uncommon',
      'rare',
      'very-rare',
      'legendary',
      'artifact',
    ];
    const orders = ladder.map(rarityOrder);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]).toBeGreaterThan(orders[i - 1]);
    }
  });
});

// ─────────────────────────── groupItems ───────────────────────────

describe('groupItems', () => {
  const items: ItemNode[] = [
    item({ id: 'i1', categorySlug: 'weapon', rarity: null, priceGp: 15 }),
    item({ id: 'i2', categorySlug: 'weapon', rarity: 'rare', priceGp: 700 }),
    item({ id: 'i3', categorySlug: 'consumable', rarity: 'common', priceGp: 50 }),
    item({ id: 'i4', categorySlug: 'magic-item', rarity: 'rare', priceGp: null }),
  ];

  it('groups by category', () => {
    const groups = groupItems(items, 'category');
    expect(groups).toHaveLength(3);
    const weaponGroup = groups.find((g) => g.key === 'weapon');
    expect(weaponGroup?.items.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('uses slugLabels for category labels when provided', () => {
    const groups = groupItems(items, 'category', {
      category: { weapon: 'Оружие', consumable: 'Расходники', 'magic-item': 'Магические' },
    });
    const weaponGroup = groups.find((g) => g.key === 'weapon');
    expect(weaponGroup?.label).toBe('Оружие');
  });

  it('falls back to slug when no slugLabels', () => {
    const groups = groupItems(items, 'category');
    const weaponGroup = groups.find((g) => g.key === 'weapon');
    expect(weaponGroup?.label).toBe('weapon');
  });

  it('groups by rarity in canonical ladder order', () => {
    const groups = groupItems(items, 'rarity');
    // 4 distinct: null, rare (×2), common — but null is one bucket, rare one, common one
    const keys = groups.map((g) => g.key);
    expect(keys).toEqual(['', 'common', 'rare']); // null=''<common(1)<rare(3)
  });

  it('groups by priceBand in canonical ascending order', () => {
    const groups = groupItems(items, 'priceBand');
    expect(groups.map((g) => g.key)).toEqual(['cheap', 'expensive', 'priceless']);
    // i1=15 → cheap; i2=700 → expensive; i3=50 → cheap; i4=null → priceless
    expect(groups.find((g) => g.key === 'cheap')?.items.map((i) => i.id).sort()).toEqual(['i1', 'i3']);
  });

  it('handles NULL-only group (e.g. all items missing slot)', () => {
    const groups = groupItems(items, 'slot');
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('');
    expect(groups[0].label).toBe('Без значения');
    expect(groups[0].items).toHaveLength(4);
  });

  it('returns empty when items is empty', () => {
    expect(groupItems([], 'category')).toEqual([]);
  });
});

// ─────────────────────────── sortItems ───────────────────────────

describe('sortItems', () => {
  const items: ItemNode[] = [
    item({ id: 'a', title: 'Длинный меч', priceGp: 15, weightLb: 3, rarity: null }),
    item({ id: 'b', title: 'Зелье лечения', priceGp: 50, weightLb: 0.5, rarity: 'common' }),
    item({ id: 'c', title: 'Кольцо защиты', priceGp: 700, weightLb: null, rarity: 'rare' }),
    item({ id: 'd', title: 'Артефакт', priceGp: null, weightLb: 5, rarity: 'artifact' }),
  ];

  it('sorts by name ascending (russian collation)', () => {
    const sorted = sortItems(items, 'name', 'asc');
    expect(sorted.map((i) => i.id)).toEqual(['d', 'a', 'b', 'c']);
    // Артефакт (А) → Длинный (Д) → Зелье (З) → Кольцо (К)
  });

  it('sorts by name descending', () => {
    const sorted = sortItems(items, 'name', 'desc');
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a', 'd']);
  });

  it('sorts by price ascending — NULLs at end', () => {
    const sorted = sortItems(items, 'price', 'asc');
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    // 15 < 50 < 700 < null
  });

  it('sorts by price descending — NULLs at end (still)', () => {
    const sorted = sortItems(items, 'price', 'desc');
    expect(sorted.map((i) => i.id)).toEqual(['c', 'b', 'a', 'd']);
    // 700 > 50 > 15, then null at end
  });

  it('sorts by weight with NULLs at end', () => {
    const sorted = sortItems(items, 'weight', 'asc');
    expect(sorted.map((i) => i.id)).toEqual(['b', 'a', 'd', 'c']);
    // 0.5 < 3 < 5 < null
  });

  it('sorts by rarity (null first, artifact last)', () => {
    const sorted = sortItems(items, 'rarity', 'asc');
    expect(sorted.map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    // null(0) → common(1) → rare(3) → artifact(6)
  });

  it('does not mutate input', () => {
    const original = [...items];
    sortItems(items, 'name', 'desc');
    expect(items).toEqual(original);
  });
});
