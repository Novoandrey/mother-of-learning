/**
 * Item-scope value lists seed for new campaigns — spec-015.
 *
 * Migration 043 seeded the 4 default lists (categories, slots, sources,
 * availabilities) for every campaign that existed at deploy time. This
 * helper hooks into `initializeCampaignFromTemplate` so future campaigns
 * land with the same baseline.
 *
 * Mirrors the idempotency pattern of `seedCampaignCategories` — safe to
 * re-run, existing rows are left alone (DM may have renamed labels).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Loose client type — matches the rest of `lib/seeds/*`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

type ValueListSpec = {
  slug: string;
  label: string;
  sort_order: number;
};

/**
 * Default item categories (FR-004). Slugs are stable English ids; labels
 * are Russian display.
 */
export const DEFAULT_ITEM_CATEGORIES: readonly ValueListSpec[] = [
  { slug: 'weapon',     label: 'Оружие',      sort_order: 10 },
  { slug: 'armor',      label: 'Доспехи',     sort_order: 20 },
  { slug: 'consumable', label: 'Расходники',  sort_order: 30 },
  { slug: 'magic-item', label: 'Магические',  sort_order: 40 },
  { slug: 'wondrous',   label: 'Чудесные',    sort_order: 50 },
  { slug: 'tool',       label: 'Инструменты', sort_order: 60 },
  { slug: 'treasure',   label: 'Сокровища',   sort_order: 70 },
  { slug: 'misc',       label: 'Прочее',      sort_order: 80 },
];

/**
 * Default item slots (FR-005a). 5e equipment positions; non-equippable
 * items leave the field NULL.
 */
export const DEFAULT_ITEM_SLOTS: readonly ValueListSpec[] = [
  { slug: 'ring',      label: 'Кольцо',         sort_order: 10 },
  { slug: 'cloak',     label: 'Плащ',           sort_order: 20 },
  { slug: 'amulet',    label: 'Амулет',         sort_order: 30 },
  { slug: 'boots',     label: 'Обувь',          sort_order: 40 },
  { slug: 'gloves',    label: 'Перчатки',       sort_order: 50 },
  { slug: 'headwear',  label: 'Головной убор',  sort_order: 60 },
  { slug: 'belt',      label: 'Пояс',           sort_order: 70 },
  { slug: 'body',      label: 'Тело',           sort_order: 80 },
  { slug: 'shield',    label: 'Щит',            sort_order: 90 },
  { slug: '1-handed',  label: 'Одноручное',     sort_order: 100 },
  { slug: '2-handed',  label: 'Двуручное',      sort_order: 110 },
  { slug: 'versatile', label: 'Универсальное',  sort_order: 120 },
  { slug: 'ranged',    label: 'Дальнобойное',   sort_order: 130 },
];

/**
 * Default item sources (FR-005b). DM extends per-campaign for Tasha's,
 * Xanathar's, third-party books, etc.
 */
export const DEFAULT_ITEM_SOURCES: readonly ValueListSpec[] = [
  { slug: 'srd-5e',   label: 'SRD 5e',  sort_order: 10 },
  { slug: 'homebrew', label: 'Хоумбрю', sort_order: 20 },
];

/**
 * Default item availabilities (FR-005c). DM extends per-campaign.
 */
export const DEFAULT_ITEM_AVAILABILITIES: readonly ValueListSpec[] = [
  { slug: 'for-sale', label: 'Свободно купить', sort_order: 10 },
  { slug: 'quest',    label: 'Квестовый',       sort_order: 20 },
  { slug: 'unique',   label: 'Уникум',          sort_order: 30 },
  { slug: 'starter',  label: 'Стартовый',       sort_order: 40 },
];

export type ItemValueListsSeedResult = {
  categories: { inserted: number; skipped_existing: number };
  slots: { inserted: number; skipped_existing: number };
  sources: { inserted: number; skipped_existing: number };
  availabilities: { inserted: number; skipped_existing: number };
};

type ScopeSpec = {
  scope: 'item' | 'item-slot' | 'item-source' | 'item-availability';
  specs: readonly ValueListSpec[];
};

/**
 * Per-scope idempotent seed. Same shape as `seedCampaignCategories` — read
 * existing slugs, insert only the missing ones.
 */
async function seedScope(
  supabase: AnySupabase,
  campaignId: string,
  scope: ScopeSpec['scope'],
  specs: readonly ValueListSpec[],
): Promise<{ inserted: number; skipped_existing: number }> {
  const slugs = specs.map((s) => s.slug);

  const { data: existing, error: existingErr } = await supabase
    .from('categories')
    .select('slug')
    .eq('campaign_id', campaignId)
    .eq('scope', scope)
    .in('slug', slugs);

  if (existingErr) {
    throw new Error(
      `seedCampaignItemValueLists(${scope}): failed to read: ${existingErr.message}`,
    );
  }

  const existingSlugs = new Set(
    (existing ?? []).map((r) => (r as { slug: string }).slug),
  );
  const missing = specs.filter((s) => !existingSlugs.has(s.slug));

  if (missing.length === 0) {
    return { inserted: 0, skipped_existing: specs.length };
  }

  const { error: insertErr } = await supabase.from('categories').insert(
    missing.map((s) => ({
      campaign_id: campaignId,
      scope,
      slug: s.slug,
      label: s.label,
      sort_order: s.sort_order,
    })),
  );

  if (insertErr) {
    throw new Error(
      `seedCampaignItemValueLists(${scope}): failed to insert: ${insertErr.message}`,
    );
  }

  return {
    inserted: missing.length,
    skipped_existing: specs.length - missing.length,
  };
}

/**
 * Seed all 4 item-scope value lists for `campaignId`. Idempotent across
 * re-runs and across migration-already-seeded campaigns (mat-ucheniya
 * came in via migration 043; new campaigns come through here).
 */
export async function seedCampaignItemValueLists(
  supabase: AnySupabase,
  campaignId: string,
): Promise<ItemValueListsSeedResult> {
  const [categories, slots, sources, availabilities] = await Promise.all([
    seedScope(supabase, campaignId, 'item', DEFAULT_ITEM_CATEGORIES),
    seedScope(supabase, campaignId, 'item-slot', DEFAULT_ITEM_SLOTS),
    seedScope(supabase, campaignId, 'item-source', DEFAULT_ITEM_SOURCES),
    seedScope(
      supabase,
      campaignId,
      'item-availability',
      DEFAULT_ITEM_AVAILABILITIES,
    ),
  ]);

  return { categories, slots, sources, availabilities };
}
