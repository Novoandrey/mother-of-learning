import { describe, expect, it } from 'vitest';

import {
  applyItemFilters,
  buildItemFiltersUrl,
  parseItemFiltersFromSearchParams,
  summarizeActiveFilters,
} from '../items-filters';
import type { ItemNode } from '../items-types';

// ─────────────────────────── Fixtures ───────────────────────────

function item(partial: Partial<ItemNode>): ItemNode {
  return {
    id: 'i1',
    campaignId: 'c1',
    title: 'Длинный меч',
    categorySlug: 'weapon',
    rarity: null,
    priceGp: 15,
    weightLb: 3,
    slotSlug: '1-handed',
    sourceSlug: 'srd-5e',
    availabilitySlug: 'for-sale',
    srdSlug: 'longsword',
    description: null,
    sourceDetail: null,
    ...partial,
  };
}

// ─────────────────────────── parseItemFiltersFromSearchParams ───────────────────────────

describe('parseItemFiltersFromSearchParams', () => {
  it('returns empty object on empty input', () => {
    expect(parseItemFiltersFromSearchParams({})).toEqual({});
  });

  it('parses q with trim', () => {
    expect(parseItemFiltersFromSearchParams({ q: '  меч  ' })).toEqual({ q: 'меч' });
  });

  it('drops empty / whitespace-only q', () => {
    expect(parseItemFiltersFromSearchParams({ q: '   ' })).toEqual({});
    expect(parseItemFiltersFromSearchParams({ q: '' })).toEqual({});
  });

  it('parses category as opaque slug', () => {
    expect(parseItemFiltersFromSearchParams({ category: 'weapon' })).toEqual({
      category: 'weapon',
    });
  });

  it('accepts every valid rarity', () => {
    for (const r of ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact']) {
      expect(parseItemFiltersFromSearchParams({ rarity: r })).toEqual({ rarity: r });
    }
  });

  it('drops unknown rarity silently', () => {
    expect(parseItemFiltersFromSearchParams({ rarity: 'mythic' })).toEqual({});
  });

  it('accepts every valid priceBand', () => {
    for (const b of ['free', 'cheap', 'mid', 'expensive', 'priceless']) {
      expect(parseItemFiltersFromSearchParams({ priceBand: b })).toEqual({ priceBand: b });
    }
  });

  it('drops unknown priceBand silently', () => {
    expect(parseItemFiltersFromSearchParams({ priceBand: 'astronomical' })).toEqual({});
  });

  it('flattens array values to first element', () => {
    expect(parseItemFiltersFromSearchParams({ q: ['меч', 'другое'] })).toEqual({ q: 'меч' });
  });

  it('parses all filters at once', () => {
    expect(
      parseItemFiltersFromSearchParams({
        q: 'меч',
        category: 'weapon',
        rarity: 'rare',
        slot: '1-handed',
        source: 'srd-5e',
        availability: 'for-sale',
        priceBand: 'cheap',
      }),
    ).toEqual({
      q: 'меч',
      category: 'weapon',
      rarity: 'rare',
      slot: '1-handed',
      source: 'srd-5e',
      availability: 'for-sale',
      priceBand: 'cheap',
    });
  });

  it('drops undefined values', () => {
    expect(parseItemFiltersFromSearchParams({ q: undefined, category: 'weapon' })).toEqual({
      category: 'weapon',
    });
  });
});

// ─────────────────────────── buildItemFiltersUrl ───────────────────────────

describe('buildItemFiltersUrl', () => {
  it('returns base path on empty filters', () => {
    expect(buildItemFiltersUrl('/c/abc/items', {})).toBe('/c/abc/items');
  });

  it('appends single filter', () => {
    expect(buildItemFiltersUrl('/c/abc/items', { rarity: 'rare' })).toBe(
      '/c/abc/items?rarity=rare',
    );
  });

  it('appends multiple filters', () => {
    const url = buildItemFiltersUrl('/c/abc/items', {
      category: 'weapon',
      rarity: 'rare',
    });
    // URLSearchParams ordering is insertion-order; we add category before rarity
    expect(url).toBe('/c/abc/items?category=weapon&rarity=rare');
  });

  it('encodes special chars in q', () => {
    const url = buildItemFiltersUrl('/c/abc/items', { q: 'меч & щит' });
    expect(url).toContain('q=');
    // URL-decoded round-trip must match
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('меч & щит');
  });

  it('skips empty q', () => {
    expect(buildItemFiltersUrl('/c/abc/items', { q: '' })).toBe('/c/abc/items');
  });
});

// ─────────────────────────── applyItemFilters ───────────────────────────

describe('applyItemFilters', () => {
  const items: ItemNode[] = [
    item({ id: 'i1', title: 'Длинный меч', categorySlug: 'weapon', rarity: null, priceGp: 15 }),
    item({ id: 'i2', title: 'Кольцо защиты', categorySlug: 'magic-item', rarity: 'rare', priceGp: 700, slotSlug: 'ring' }),
    item({ id: 'i3', title: 'Зелье лечения', categorySlug: 'consumable', rarity: 'common', priceGp: 50, slotSlug: null }),
    item({ id: 'i4', title: 'Артефакт', categorySlug: 'wondrous', rarity: 'artifact', priceGp: null }),
  ];

  it('returns all on empty filter', () => {
    expect(applyItemFilters(items, {})).toHaveLength(4);
  });

  it('filters by q (case-insensitive substring)', () => {
    const out = applyItemFilters(items, { q: 'меч' });
    expect(out.map((i) => i.id)).toEqual(['i1']);
  });

  it('filters by q (russian, case-insensitive)', () => {
    const out = applyItemFilters(items, { q: 'КОЛЬЦО' });
    expect(out.map((i) => i.id)).toEqual(['i2']);
  });

  it('filters by category', () => {
    const out = applyItemFilters(items, { category: 'magic-item' });
    expect(out.map((i) => i.id)).toEqual(['i2']);
  });

  it('filters by rarity', () => {
    const out = applyItemFilters(items, { rarity: 'rare' });
    expect(out.map((i) => i.id)).toEqual(['i2']);
  });

  it('filters by slot (NULL slot excluded by slot filter)', () => {
    const out = applyItemFilters(items, { slot: 'ring' });
    expect(out.map((i) => i.id)).toEqual(['i2']);
  });

  it('filters by priceBand=free (priceGp === 0 only, NOT null)', () => {
    const withFree = item({ id: 'i5', priceGp: 0 });
    const out = applyItemFilters([...items, withFree], { priceBand: 'free' });
    expect(out.map((i) => i.id)).toEqual(['i5']);
  });

  it('filters by priceBand=cheap (≤ 50)', () => {
    const out = applyItemFilters(items, { priceBand: 'cheap' });
    expect(out.map((i) => i.id).sort()).toEqual(['i1', 'i3']);
  });

  it('filters by priceBand=mid (51-500)', () => {
    const i6 = item({ id: 'i6', priceGp: 51 });
    const i7 = item({ id: 'i7', priceGp: 500 });
    const i8 = item({ id: 'i8', priceGp: 501 });
    const out = applyItemFilters([i6, i7, i8], { priceBand: 'mid' });
    expect(out.map((i) => i.id).sort()).toEqual(['i6', 'i7']);
  });

  it('filters by priceBand=expensive (>500)', () => {
    const out = applyItemFilters(items, { priceBand: 'expensive' });
    expect(out.map((i) => i.id)).toEqual(['i2']);
  });

  it('filters by priceBand=priceless (priceGp === null)', () => {
    const out = applyItemFilters(items, { priceBand: 'priceless' });
    expect(out.map((i) => i.id)).toEqual(['i4']);
  });

  it('combines filters (AND)', () => {
    const out = applyItemFilters(items, { rarity: 'rare', category: 'magic-item' });
    expect(out.map((i) => i.id)).toEqual(['i2']);

    const empty = applyItemFilters(items, { rarity: 'rare', category: 'consumable' });
    expect(empty).toEqual([]);
  });
});

// ─────────────────────────── summarizeActiveFilters ───────────────────────────

describe('summarizeActiveFilters', () => {
  it('returns empty list on empty filters', () => {
    expect(summarizeActiveFilters('/c/abc/items', {})).toEqual([]);
  });

  it('returns one entry per applied filter with removeUrl', () => {
    const out = summarizeActiveFilters('/c/abc/items', {
      q: 'меч',
      category: 'weapon',
    });
    expect(out).toHaveLength(2);
    expect(out[0].key).toBe('q');
    expect(out[0].removeUrl).toBe('/c/abc/items?category=weapon');
    expect(out[1].key).toBe('category');
    expect(out[1].removeUrl).toBe('/c/abc/items?q=%D0%BC%D0%B5%D1%87');
  });
});
