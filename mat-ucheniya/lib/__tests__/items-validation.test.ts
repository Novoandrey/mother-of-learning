import { describe, expect, it } from 'vitest';

import {
  isValidItemPayload,
  validateItemPayload,
  type AvailableSlugs,
} from '../items-validation';
import type { ItemPayload } from '../items-types';

const SLUGS: AvailableSlugs = {
  categories: new Set(['weapon', 'armor', 'consumable', 'magic-item']),
  slots: new Set(['ring', '1-handed', '2-handed']),
  sources: new Set(['srd-5e', 'homebrew']),
  availabilities: new Set(['for-sale', 'unique']),
};

function payload(partial: Partial<ItemPayload> = {}): ItemPayload {
  return {
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
    dndsuUrl: null,
    requiresAttunement: false,
    ...partial,
  };
}

// ─────────────────────────── Happy path ───────────────────────────

describe('validateItemPayload — happy path', () => {
  it('returns no errors for a fully-valid payload', () => {
    expect(validateItemPayload(payload(), SLUGS)).toEqual([]);
  });

  it('accepts NULL on every optional field', () => {
    expect(
      validateItemPayload(
        payload({
          rarity: null,
          priceGp: null,
          weightLb: null,
          slotSlug: null,
          sourceSlug: null,
          availabilitySlug: null,
          srdSlug: null,
          description: null,
          sourceDetail: null,
          dndsuUrl: null,
        }),
        SLUGS,
      ),
    ).toEqual([]);
  });

  it('isValidItemPayload returns true when no errors', () => {
    expect(isValidItemPayload(payload(), SLUGS)).toBe(true);
  });
});

// ─────────────────────────── title ───────────────────────────

describe('validateItemPayload — title', () => {
  it('rejects empty title', () => {
    const errs = validateItemPayload(payload({ title: '' }), SLUGS);
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe('title');
  });

  it('rejects whitespace-only title', () => {
    const errs = validateItemPayload(payload({ title: '   ' }), SLUGS);
    expect(errs).toHaveLength(1);
    expect(errs[0].field).toBe('title');
  });

  it('rejects title > 200 chars', () => {
    const errs = validateItemPayload(payload({ title: 'X'.repeat(201) }), SLUGS);
    expect(errs.find((e) => e.field === 'title')).toBeDefined();
  });

  it('accepts title at exactly 200 chars', () => {
    const errs = validateItemPayload(payload({ title: 'X'.repeat(200) }), SLUGS);
    expect(errs.find((e) => e.field === 'title')).toBeUndefined();
  });
});

// ─────────────────────────── categorySlug ───────────────────────────

describe('validateItemPayload — categorySlug', () => {
  it('rejects empty categorySlug', () => {
    const errs = validateItemPayload(payload({ categorySlug: '' }), SLUGS);
    expect(errs.find((e) => e.field === 'categorySlug')).toBeDefined();
  });

  it('rejects unknown categorySlug', () => {
    const errs = validateItemPayload(
      payload({ categorySlug: 'unknown-category' }),
      SLUGS,
    );
    expect(errs.find((e) => e.field === 'categorySlug')).toBeDefined();
  });
});

// ─────────────────────────── rarity ───────────────────────────

describe('validateItemPayload — rarity', () => {
  it('accepts null', () => {
    const errs = validateItemPayload(payload({ rarity: null }), SLUGS);
    expect(errs.find((e) => e.field === 'rarity')).toBeUndefined();
  });

  it.each(['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact'])(
    'accepts canonical rarity %s',
    (r) => {
      const errs = validateItemPayload(
        payload({ rarity: r as ItemPayload['rarity'] }),
        SLUGS,
      );
      expect(errs.find((e) => e.field === 'rarity')).toBeUndefined();
    },
  );

  it('rejects invalid rarity', () => {
    const errs = validateItemPayload(
      // @ts-expect-error — testing runtime guard
      payload({ rarity: 'mythic' }),
      SLUGS,
    );
    expect(errs.find((e) => e.field === 'rarity')).toBeDefined();
  });
});

// ─────────────────────────── priceGp / weightLb ───────────────────────────

describe('validateItemPayload — priceGp & weightLb', () => {
  it('rejects negative priceGp', () => {
    const errs = validateItemPayload(payload({ priceGp: -1 }), SLUGS);
    expect(errs.find((e) => e.field === 'priceGp')).toBeDefined();
  });

  it('accepts priceGp = 0 (free)', () => {
    const errs = validateItemPayload(payload({ priceGp: 0 }), SLUGS);
    expect(errs.find((e) => e.field === 'priceGp')).toBeUndefined();
  });

  it('rejects NaN priceGp', () => {
    const errs = validateItemPayload(payload({ priceGp: Number.NaN }), SLUGS);
    expect(errs.find((e) => e.field === 'priceGp')).toBeDefined();
  });

  it('rejects negative weightLb', () => {
    const errs = validateItemPayload(payload({ weightLb: -0.5 }), SLUGS);
    expect(errs.find((e) => e.field === 'weightLb')).toBeDefined();
  });

  it('accepts weightLb = 0 (massless)', () => {
    const errs = validateItemPayload(payload({ weightLb: 0 }), SLUGS);
    expect(errs.find((e) => e.field === 'weightLb')).toBeUndefined();
  });
});

// ─────────────────────────── slot / source / availability slugs ───────────────────────────

describe('validateItemPayload — slug refs', () => {
  it('rejects unknown slotSlug', () => {
    const errs = validateItemPayload(payload({ slotSlug: 'helmet' }), SLUGS);
    expect(errs.find((e) => e.field === 'slotSlug')).toBeDefined();
  });

  it('rejects unknown sourceSlug', () => {
    const errs = validateItemPayload(payload({ sourceSlug: 'tashas' }), SLUGS);
    expect(errs.find((e) => e.field === 'sourceSlug')).toBeDefined();
  });

  it('rejects unknown availabilitySlug', () => {
    const errs = validateItemPayload(payload({ availabilitySlug: 'starter' }), SLUGS);
    expect(errs.find((e) => e.field === 'availabilitySlug')).toBeDefined();
  });

  it('accepts NULL on each slug field', () => {
    const errs = validateItemPayload(
      payload({ slotSlug: null, sourceSlug: null, availabilitySlug: null }),
      SLUGS,
    );
    expect(errs).toEqual([]);
  });
});

// ─────────────────────────── srdSlug format ───────────────────────────

describe('validateItemPayload — srdSlug', () => {
  it('rejects uppercase srdSlug', () => {
    const errs = validateItemPayload(payload({ srdSlug: 'Longsword' }), SLUGS);
    expect(errs.find((e) => e.field === 'srdSlug')).toBeDefined();
  });

  it('rejects srdSlug with spaces', () => {
    const errs = validateItemPayload(payload({ srdSlug: 'long sword' }), SLUGS);
    expect(errs.find((e) => e.field === 'srdSlug')).toBeDefined();
  });

  it('accepts kebab-case', () => {
    const errs = validateItemPayload(
      payload({ srdSlug: 'potion-of-healing' }),
      SLUGS,
    );
    expect(errs.find((e) => e.field === 'srdSlug')).toBeUndefined();
  });

  it('accepts numbers in slug', () => {
    const errs = validateItemPayload(payload({ srdSlug: '5-foot-rope' }), SLUGS);
    expect(errs.find((e) => e.field === 'srdSlug')).toBeUndefined();
  });

  it('rejects srdSlug > 80 chars', () => {
    const errs = validateItemPayload(payload({ srdSlug: 'a'.repeat(81) }), SLUGS);
    expect(errs.find((e) => e.field === 'srdSlug')).toBeDefined();
  });

  it('treats whitespace-only srdSlug as null (no error)', () => {
    const errs = validateItemPayload(payload({ srdSlug: '   ' }), SLUGS);
    expect(errs.find((e) => e.field === 'srdSlug')).toBeUndefined();
  });
});

// ─────────────────────────── multi-error case ───────────────────────────

describe('validateItemPayload — multi-error', () => {
  it('returns all errors, not just the first', () => {
    const errs = validateItemPayload(
      payload({
        title: '',
        categorySlug: 'unknown',
        priceGp: -10,
        srdSlug: 'BAD SLUG',
      }),
      SLUGS,
    );
    expect(errs.length).toBeGreaterThanOrEqual(4);
    const fields = new Set(errs.map((e) => e.field));
    expect(fields.has('title')).toBe(true);
    expect(fields.has('categorySlug')).toBe(true);
    expect(fields.has('priceGp')).toBe(true);
    expect(fields.has('srdSlug')).toBe(true);
  });
});
