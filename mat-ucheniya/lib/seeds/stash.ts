/**
 * Stash seeder for new campaigns — spec-011.
 *
 * Hooked into `initializeCampaignFromTemplate` so every fresh campaign
 * lands with exactly one `stash` node (the shared Общак). mat-ucheniya
 * and all existing campaigns got this directly in migration 035; this
 * helper catches every campaign created afterwards.
 *
 * Idempotent: mirrors `seedCampaignCategories` / `seedCampaignSrd`.
 * Safe to re-run — if a stash node already exists, nothing happens.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// Loose client type — compatible with both server (anon) and admin (service)
// clients, same as `seedCampaignCategories` / `seedCampaignSrd`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export type EnsureStashResult = {
  created: boolean;
  nodeId: string;
};

/**
 * Ensure the campaign has exactly one stash node. Returns the node id
 * either way. `created` reflects whether this call inserted a new row
 * (used by the caller to decide whether to invalidate the sidebar
 * cache).
 *
 * Two-step: look up the existing stash node first; insert only if
 * missing. We don't use `ON CONFLICT` because the idempotency key here
 * is `(campaign_id, type.slug='stash')` and there's no unique index
 * matching that shape — a campaign could theoretically have multiple
 * stash-typed nodes, though the migration and this seeder together
 * prevent that.
 */
export async function ensureCampaignStash(
  supabase: AnySupabase,
  campaignId: string,
): Promise<EnsureStashResult> {
  if (!campaignId) {
    throw new Error('ensureCampaignStash: campaignId is required');
  }

  // 1. Resolve the campaign's `stash` node_type id (seeded per campaign
  //    in migration 035 and in this campaign-init flow for new campaigns
  //    via a sibling seeder, if one is ever added; otherwise the migration
  //    already covers existing campaigns).
  const { data: typeRow, error: typeErr } = await supabase
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'stash')
    .maybeSingle();

  if (typeErr) {
    throw new Error(
      `ensureCampaignStash: failed to read node_types: ${typeErr.message}`,
    );
  }

  // If the node_type is missing for this campaign (fresh campaign created
  // after migration 035 without an explicit type seed), insert it now.
  // Matches migration 035's shape so the outcomes are identical.
  let typeId: string;
  if (!typeRow) {
    const { data: inserted, error: insTypeErr } = await supabase
      .from('node_types')
      .insert({
        campaign_id: campaignId,
        slug: 'stash',
        label: 'Общак',
        icon: '💰',
        default_fields: {},
        sort_order: 50,
      })
      .select('id')
      .single();

    if (insTypeErr) {
      throw new Error(
        `ensureCampaignStash: failed to seed node_type: ${insTypeErr.message}`,
      );
    }
    typeId = (inserted as { id: string }).id;
  } else {
    typeId = (typeRow as { id: string }).id;
  }

  // 2. Look up an existing stash node.
  const { data: existing, error: nodeErr } = await supabase
    .from('nodes')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('type_id', typeId)
    .limit(1)
    .maybeSingle();

  if (nodeErr) {
    throw new Error(
      `ensureCampaignStash: failed to read nodes: ${nodeErr.message}`,
    );
  }

  if (existing) {
    return { created: false, nodeId: (existing as { id: string }).id };
  }

  // 3. Insert one stash node.
  const { data: created, error: insNodeErr } = await supabase
    .from('nodes')
    .insert({
      campaign_id: campaignId,
      type_id: typeId,
      title: 'Общак',
      fields: {},
    })
    .select('id')
    .single();

  if (insNodeErr) {
    throw new Error(
      `ensureCampaignStash: failed to insert node: ${insNodeErr.message}`,
    );
  }

  return { created: true, nodeId: (created as { id: string }).id };
}
