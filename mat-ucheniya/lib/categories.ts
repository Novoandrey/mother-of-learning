/**
 * Category read queries — spec-010.
 *
 * Write-side lives in `app/actions/categories.ts` (T035, P2). This
 * module is the read surface shared by server components and
 * server actions; the client receives plain `Category[]` via server
 * component props or server-action return values.
 */

import { createClient } from '@/lib/supabase/server';
import type { Category } from './transactions';

export type CategoryScope = 'transaction' | 'item';

export type ListCategoriesOpts = {
  /** Include soft-deleted rows. Default: false. */
  includeDeleted?: boolean;
};

/**
 * List categories for a campaign in a given scope, ordered by
 * `sort_order` ascending (DM-defined) then `label` ascending
 * (stable tiebreaker for equal sort values).
 *
 * Soft-deleted rows are hidden unless `includeDeleted` is true —
 * historical transactions still render their category label via
 * a separate by-id lookup, so deleted categories do not need to
 * appear in dropdowns.
 */
export async function listCategories(
  campaignId: string,
  scope: CategoryScope,
  opts: ListCategoriesOpts = {},
): Promise<Category[]> {
  const supabase = await createClient();

  let query = supabase
    .from('categories')
    .select('slug, label, sort_order, is_deleted')
    .eq('campaign_id', campaignId)
    .eq('scope', scope)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (!opts.includeDeleted) {
    query = query.eq('is_deleted', false);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`listCategories failed: ${error.message}`);
  }

  return (data ?? []) as Category[];
}
