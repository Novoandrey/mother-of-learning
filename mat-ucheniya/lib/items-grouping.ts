/**
 * Item-catalog group-by + sort helpers — spec-015 (pure).
 *
 * Group-by re-folds a list of items into named sections. Sort orders
 * within a section. Both are UI re-folds (no refetch); per FR-008/010.
 *
 * The price-band thresholds are also mirrored in `items-filters.ts`
 * (kept in sync by tests covering the boundary cases).
 */

import type {
  GroupBy,
  ItemNode,
  PriceBand,
  Rarity,
  SortDir,
  SortKey,
} from './items-types';

/**
 * Map a price (in gold) to its display band. NULL is `priceless`
 * (different from `0`-priced "free" items — a pile of pebbles).
 *
 * Bands: 0 → `free`, 1..50 → `cheap`, 51..500 → `mid`, > 500 →
 * `expensive`, null → `priceless`. Values picked for mat-ucheniya
 * scale; tasks.md may tune.
 */
export function priceBandFor(priceGp: number | null): PriceBand {
  if (priceGp === null) return 'priceless';
  if (priceGp === 0) return 'free';
  if (priceGp <= 50) return 'cheap';
  if (priceGp <= 500) return 'mid';
  return 'expensive';
}

/** 5e rarity ladder rank (1..6). NULL → 0 (sorts before `common`). */
export function rarityOrder(rarity: Rarity | null): number {
  switch (rarity) {
    case 'common':
      return 1;
    case 'uncommon':
      return 2;
    case 'rare':
      return 3;
    case 'very-rare':
      return 4;
    case 'legendary':
      return 5;
    case 'artifact':
      return 6;
    case null:
      return 0;
  }
}

/** Display label per group key. UI may translate further; this is the default. */
const PRICE_BAND_LABELS: Record<PriceBand, string> = {
  free: 'Бесплатно',
  cheap: 'Дёшево (≤ 50 gp)',
  mid: 'Средне (51–500 gp)',
  expensive: 'Дорого (> 500 gp)',
  priceless: 'Без цены',
};

const RARITY_LABELS: Record<string, string> = {
  '': 'Без редкости',
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  'very-rare': 'Very Rare',
  legendary: 'Legendary',
  artifact: 'Artifact',
};

export type ItemGroup = {
  /** Stable key used for collapse state. */
  key: string;
  /** Display label rendered in the section header. */
  label: string;
  items: ItemNode[];
};

/**
 * Re-fold items into sections by `groupBy` axis. Group order is the
 * canonical order for the axis (rarity ladder for rarity, sort_order
 * for slug-based axes — but slug→sort_order is a DB read; this pure
 * function falls back to slug alphabetical, which the UI overrides
 * by passing pre-sorted slug→label map). Items inside groups are
 * NOT sorted here — pass through `sortItems` first if needed.
 *
 * `slugLabels` is an optional override map for slug-based axes —
 * pass the campaign's `categories.label` map so groups display
 * Russian names. Without it, group labels fall back to slugs.
 */
export function groupItems(
  items: ItemNode[],
  groupBy: GroupBy,
  slugLabels?: Partial<Record<GroupBy, Record<string, string>>>,
): ItemGroup[] {
  const buckets = new Map<string, ItemNode[]>();

  for (const item of items) {
    const key = groupKeyOf(item, groupBy);
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const out: ItemGroup[] = [];
  for (const [key, list] of buckets) {
    out.push({
      key,
      label: groupLabelOf(key, groupBy, slugLabels?.[groupBy]),
      items: list,
    });
  }

  // Order groups canonically.
  return orderGroups(out, groupBy);
}

function groupKeyOf(item: ItemNode, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'category':
      return item.categorySlug;
    case 'rarity':
      return item.rarity ?? '';
    case 'slot':
      return item.slotSlug ?? '';
    case 'priceBand':
      return priceBandFor(item.priceGp);
    case 'source':
      return item.sourceSlug ?? '';
    case 'availability':
      return item.availabilitySlug ?? '';
  }
}

function groupLabelOf(
  key: string,
  groupBy: GroupBy,
  slugMap: Record<string, string> | undefined,
): string {
  // priceBand has its own labels.
  if (groupBy === 'priceBand') return PRICE_BAND_LABELS[key as PriceBand];
  // rarity has its own labels.
  if (groupBy === 'rarity') return RARITY_LABELS[key] ?? key;
  // Slug-based axes: prefer DB-passed map; fall back to slug.
  if (key === '') return 'Без значения';
  return slugMap?.[key] ?? key;
}

function orderGroups(groups: ItemGroup[], groupBy: GroupBy): ItemGroup[] {
  if (groupBy === 'rarity') {
    return [...groups].sort(
      (a, b) => rarityOrder(a.key === '' ? null : (a.key as Rarity)) - rarityOrder(b.key === '' ? null : (b.key as Rarity)),
    );
  }
  if (groupBy === 'priceBand') {
    const priceOrder: Record<PriceBand, number> = {
      free: 0,
      cheap: 1,
      mid: 2,
      expensive: 3,
      priceless: 4,
    };
    return [...groups].sort(
      (a, b) => priceOrder[a.key as PriceBand] - priceOrder[b.key as PriceBand],
    );
  }
  // Slug-based: alphabetical by label as a stable fallback. The UI
  // can re-sort by sort_order if it wants — pure function stays
  // dependency-free.
  return [...groups].sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

/**
 * Sort items in place (returns new array). Handles NULL values:
 * - `name` sort uses `localeCompare('ru')`.
 * - `price` / `weight` NULLs sort to the end (asc) or beginning (desc).
 * - `rarity` NULL sorts before `common` per `rarityOrder`.
 */
export function sortItems(
  items: ItemNode[],
  sortKey: SortKey,
  dir: SortDir = 'asc',
): ItemNode[] {
  const factor = dir === 'asc' ? 1 : -1;
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'name':
        return factor * a.title.localeCompare(b.title, 'ru');
      case 'price':
        return factor * compareNullableNumber(a.priceGp, b.priceGp, dir);
      case 'weight':
        return factor * compareNullableNumber(a.weightLb, b.weightLb, dir);
      case 'rarity':
        return factor * (rarityOrder(a.rarity) - rarityOrder(b.rarity));
    }
  });
  return sorted;
}

/**
 * NULL-aware number compare. NULLs always sort to the end regardless
 * of `dir` — matches user intent ("show me priced items first, then
 * the unpriced ones at the bottom").
 */
function compareNullableNumber(
  a: number | null,
  b: number | null,
  dir: SortDir,
): number {
  if (a === null && b === null) return 0;
  // NULL → end. We've already multiplied by `factor` outside, so
  // negate that effect for NULL comparisons by returning the
  // "end" position relative to `dir`.
  if (a === null) return dir === 'asc' ? 1 : -1;
  if (b === null) return dir === 'asc' ? -1 : 1;
  return a - b;
}
