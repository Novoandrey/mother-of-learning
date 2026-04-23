/**
 * Categories seed for new campaigns — spec-010.
 *
 * Hooked into `initializeCampaignFromTemplate` so every fresh campaign
 * lands with the same 6 default transaction categories. mat-ucheniya
 * got these directly in migration 034; this helper catches every
 * campaign created afterwards.
 *
 * Mirrors the idempotency pattern of `seedCampaignSrd` — safe to
 * re-run any number of times. Existing categories are left alone
 * (DMs may have renamed labels).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Loose client type — matches `seedCampaignSrd` so the seeder stays
// compatible with both server (anon) and admin (service) clients.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

type CategorySpec = {
  slug: string;
  label: string;
  sort_order: number;
};

/**
 * Default transaction categories for a new campaign. Labels are in
 * Russian (primary campaign language for mat-ucheniya); DMs can
 * rename them via the settings UI in spec-010 phase 12.
 *
 * Slugs are stable English identifiers — queries and URLs use them,
 * labels are display-only.
 */
export const DEFAULT_TRANSACTION_CATEGORIES: readonly CategorySpec[] = [
  { slug: 'income',   label: 'Доход',   sort_order: 10 },
  { slug: 'expense',  label: 'Расход',  sort_order: 20 },
  { slug: 'credit',   label: 'Кредит',  sort_order: 30 },
  { slug: 'loot',     label: 'Добыча',  sort_order: 40 },
  { slug: 'transfer', label: 'Перевод', sort_order: 50 },
  { slug: 'other',    label: 'Прочее',  sort_order: 100 },
];

export type CategoriesSeedResult = {
  inserted: number;
  skipped_existing: number;
};

/**
 * Insert the default transaction categories for `campaignId`. Uses
 * the `(campaign_id, scope, slug)` uniqueness constraint as the
 * idempotency key — missing rows are inserted, existing ones are
 * left as-is (preserves DM label edits).
 */
export async function seedCampaignCategories(
  supabase: AnySupabase,
  campaignId: string,
): Promise<CategoriesSeedResult> {
  const slugs = DEFAULT_TRANSACTION_CATEGORIES.map((c) => c.slug);

  const { data: existing, error: existingErr } = await supabase
    .from('categories')
    .select('slug')
    .eq('campaign_id', campaignId)
    .eq('scope', 'transaction')
    .in('slug', slugs);

  if (existingErr) {
    throw new Error(
      `seedCampaignCategories: failed to read categories: ${existingErr.message}`,
    );
  }

  const existingSlugs = new Set(
    (existing ?? []).map((r) => (r as { slug: string }).slug),
  );
  const missing = DEFAULT_TRANSACTION_CATEGORIES.filter(
    (c) => !existingSlugs.has(c.slug),
  );

  if (missing.length === 0) {
    return { inserted: 0, skipped_existing: DEFAULT_TRANSACTION_CATEGORIES.length };
  }

  const { error: insertErr } = await supabase.from('categories').insert(
    missing.map((c) => ({
      campaign_id: campaignId,
      scope: 'transaction',
      slug: c.slug,
      label: c.label,
      sort_order: c.sort_order,
    })),
  );

  if (insertErr) {
    throw new Error(
      `seedCampaignCategories: failed to insert: ${insertErr.message}`,
    );
  }

  return {
    inserted: missing.length,
    skipped_existing: DEFAULT_TRANSACTION_CATEGORIES.length - missing.length,
  };
}
