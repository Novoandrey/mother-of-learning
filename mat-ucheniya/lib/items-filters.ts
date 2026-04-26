/**
 * Item-catalog filter parsing / URL-building — spec-015 (pure).
 *
 * Mirrors the spec-010/011 ledger filter pattern: URL is the single
 * source of truth, the filter bar is a URL editor, the page render is
 * `f(searchParams) → list`. No state, no Supabase imports — testable
 * in isolation.
 */

import type {
  ItemFilters,
  ItemNode,
  PriceBand,
  Rarity,
} from './items-types';

const RARITY_VALUES: readonly Rarity[] = [
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
];

const PRICE_BAND_VALUES: readonly PriceBand[] = [
  'free',
  'cheap',
  'mid',
  'expensive',
  'priceless',
];

/**
 * Parse `URLSearchParams`-shaped input into `ItemFilters`. Tolerates
 * the Next.js `searchParams` shape (`Record<string, string | string[] | undefined>`)
 * — array values are flattened to the first element.
 *
 * Unknown keys are dropped. Unknown values for closed-enum fields
 * (`rarity`, `priceBand`) are dropped silently — no errors thrown.
 */
export function parseItemFiltersFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): ItemFilters {
  const out: ItemFilters = {};

  const get = (key: string): string | undefined => {
    const v = sp[key];
    if (Array.isArray(v)) return v[0];
    return v;
  };

  const q = get('q');
  if (q && q.trim().length > 0) out.q = q.trim();

  const category = get('category');
  if (category) out.category = category;

  const rarity = get('rarity');
  if (rarity && (RARITY_VALUES as readonly string[]).includes(rarity)) {
    out.rarity = rarity as Rarity;
  }

  const slot = get('slot');
  if (slot) out.slot = slot;

  const source = get('source');
  if (source) out.source = source;

  const availability = get('availability');
  if (availability) out.availability = availability;

  const priceBand = get('priceBand');
  if (priceBand && (PRICE_BAND_VALUES as readonly string[]).includes(priceBand)) {
    out.priceBand = priceBand as PriceBand;
  }

  return out;
}

/**
 * Build a URL that represents `filters` applied to `basePath` (e.g.
 * `/c/abc/items`). Used by the filter chip × buttons to construct
 * "remove this filter" hrefs.
 *
 * Empty filters → just the base path. `undefined` / empty-string
 * filter values are skipped.
 */
export function buildItemFiltersUrl(
  basePath: string,
  filters: ItemFilters,
): string {
  const params = new URLSearchParams();

  if (filters.q && filters.q.length > 0) params.set('q', filters.q);
  if (filters.category) params.set('category', filters.category);
  if (filters.rarity) params.set('rarity', filters.rarity);
  if (filters.slot) params.set('slot', filters.slot);
  if (filters.source) params.set('source', filters.source);
  if (filters.availability) params.set('availability', filters.availability);
  if (filters.priceBand) params.set('priceBand', filters.priceBand);

  const qs = params.toString();
  return qs.length === 0 ? basePath : `${basePath}?${qs}`;
}

/**
 * Apply `filters` in-memory to a list of items. Used for client-side
 * group-by re-fold without refetch (the page already loaded a filtered
 * list, but secondary group-by toggling shouldn't trigger a roundtrip).
 *
 * NOTE: `priceBand` filter is delegated to `priceBandFor` from
 * `items-grouping` — but that function is in another module to keep
 * `items-filters` import-free of grouping logic. Instead we inline the
 * thresholds here; if the bands ever drift, both modules need updating.
 * Tests cover the boundary cases.
 */
export function applyItemFilters(
  items: ItemNode[],
  filters: ItemFilters,
): ItemNode[] {
  return items.filter((item) => {
    if (filters.q) {
      const needle = filters.q.toLowerCase();
      if (!item.title.toLowerCase().includes(needle)) return false;
    }
    if (filters.category && item.categorySlug !== filters.category) return false;
    if (filters.rarity && item.rarity !== filters.rarity) return false;
    if (filters.slot && item.slotSlug !== filters.slot) return false;
    if (filters.source && item.sourceSlug !== filters.source) return false;
    if (
      filters.availability &&
      item.availabilitySlug !== filters.availability
    )
      return false;
    if (filters.priceBand) {
      const band = priceBandForLocal(item.priceGp);
      if (band !== filters.priceBand) return false;
    }
    return true;
  });
}

/**
 * Local copy of `priceBandFor` — kept here to keep this module
 * dependency-free. The canonical implementation lives in
 * `items-grouping.ts`; both must agree (covered by tests).
 */
function priceBandForLocal(priceGp: number | null): PriceBand {
  if (priceGp === null) return 'priceless';
  if (priceGp === 0) return 'free';
  if (priceGp <= 50) return 'cheap';
  if (priceGp <= 500) return 'mid';
  return 'expensive';
}

/**
 * Active-filter summary for chip rendering. Returns one entry per
 * applied filter, in display order. Each entry's `removeUrl` is what
 * the chip × button navigates to.
 */
export function summarizeActiveFilters(
  basePath: string,
  filters: ItemFilters,
): Array<{ key: keyof ItemFilters; value: string; removeUrl: string }> {
  const out: Array<{
    key: keyof ItemFilters;
    value: string;
    removeUrl: string;
  }> = [];

  const omit = <K extends keyof ItemFilters>(k: K): ItemFilters => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [k]: _omitted, ...rest } = filters;
    return rest;
  };

  if (filters.q) {
    out.push({ key: 'q', value: filters.q, removeUrl: buildItemFiltersUrl(basePath, omit('q')) });
  }
  if (filters.category) {
    out.push({
      key: 'category',
      value: filters.category,
      removeUrl: buildItemFiltersUrl(basePath, omit('category')),
    });
  }
  if (filters.rarity) {
    out.push({
      key: 'rarity',
      value: filters.rarity,
      removeUrl: buildItemFiltersUrl(basePath, omit('rarity')),
    });
  }
  if (filters.slot) {
    out.push({ key: 'slot', value: filters.slot, removeUrl: buildItemFiltersUrl(basePath, omit('slot')) });
  }
  if (filters.source) {
    out.push({
      key: 'source',
      value: filters.source,
      removeUrl: buildItemFiltersUrl(basePath, omit('source')),
    });
  }
  if (filters.availability) {
    out.push({
      key: 'availability',
      value: filters.availability,
      removeUrl: buildItemFiltersUrl(basePath, omit('availability')),
    });
  }
  if (filters.priceBand) {
    out.push({
      key: 'priceBand',
      value: filters.priceBand,
      removeUrl: buildItemFiltersUrl(basePath, omit('priceBand')),
    });
  }

  return out;
}
