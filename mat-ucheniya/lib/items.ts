/**
 * Items read surface — spec-015.
 *
 * Server-only Supabase queries that hydrate `ItemNode` from the
 * `nodes` + `item_attributes` join. Catalog page, item permalink,
 * typeahead, item-history all consume this module.
 *
 * Shape choice: every public function returns plain `ItemNode[]` /
 * `ItemNode | null` — the catalog UI is dumb about Supabase types.
 *
 * Write-side lives in `app/actions/items.ts` (T014).
 */

import { createClient } from '@/lib/supabase/server';
import { unwrapOne } from '@/lib/supabase/joins';
import type {
  ItemFilters,
  ItemNode,
  Rarity,
} from './items-types';
import {
  getLedgerPage,
  type TransactionWithRelations,
} from './transactions';

// ─────────────────────────── Row shapes ───────────────────────────

type ItemAttrsRow = {
  node_id: string;
  category_slug: string;
  rarity: string | null;
  price_gp: number | null;
  weight_lb: number | null;
  slot_slug: string | null;
  source_slug: string | null;
  availability_slug: string | null;
  use_default_price: boolean | null;
  requires_attunement: boolean | null;
};

type NodeRow = {
  id: string;
  campaign_id: string;
  title: string;
  fields: Record<string, unknown> | null;
  type: { slug: string } | { slug: string }[] | null;
};

// ─────────────────────────── Hydration ───────────────────────────

/**
 * Combine a `nodes` row with its `item_attributes` row into the
 * canonical `ItemNode` shape. Cold fields come from `nodes.fields`
 * JSONB. Returns `null` if either side is missing (defensive — a
 * node without attributes shouldn't exist post-mig 043, but the
 * read layer doesn't trust that invariant).
 */
function hydrate(node: NodeRow, attrs: ItemAttrsRow | null): ItemNode | null {
  if (!attrs) return null;
  const fields = node.fields ?? {};
  const srdSlug = typeof fields.srd_slug === 'string' ? fields.srd_slug : null;
  const description =
    typeof fields.description === 'string' ? fields.description : null;
  const sourceDetail =
    typeof fields.source_detail === 'string' ? fields.source_detail : null;
  const dndsuUrl =
    typeof fields.dndsu_url === 'string' ? fields.dndsu_url : null;

  return {
    id: node.id,
    campaignId: node.campaign_id,
    title: node.title,
    categorySlug: attrs.category_slug,
    rarity: (attrs.rarity as Rarity | null) ?? null,
    priceGp: attrs.price_gp,
    weightLb: attrs.weight_lb,
    slotSlug: attrs.slot_slug,
    sourceSlug: attrs.source_slug,
    availabilitySlug: attrs.availability_slug,
    useDefaultPrice: attrs.use_default_price ?? true,
    requiresAttunement: attrs.requires_attunement ?? false,
    srdSlug,
    description,
    sourceDetail,
    dndsuUrl,
  };
}

// ─────────────────────────── getCatalogItems ───────────────────────────

/**
 * Return all items in the campaign that match `filters`. Implements
 * FR-007/008/009: name search, category, rarity, slot, source,
 * availability filters. Sort and group are done client-side
 * (FR-010/008) — this function returns the unordered set.
 *
 * Performance budget per NFR-001: < 500ms TTFB at 500 items. The
 * `(category_slug, rarity)` composite index from migration 043
 * covers the common browse pattern; partial indexes cover the
 * rare-but-filterable optional fields.
 *
 * `priceBand` is applied **client-side** (in
 * `applyItemFilters`) — translating bands to numeric ranges in SQL
 * would couple this module to `priceBandFor`. The page hands the
 * full result to `applyItemFilters` after fetching anyway.
 */
export async function getCatalogItems(
  campaignId: string,
  filters: ItemFilters = {},
): Promise<ItemNode[]> {
  const supabase = await createClient();

  // Single embedded query: nodes -[:type]→ node_types(slug='item')
  //                       nodes -[:attrs]→ item_attributes
  // Filters that target attrs are applied via the embed-target syntax
  // `attrs.<col>=eq.<v>`. Filters on title go on the outer level.
  //
  // `!inner` makes the join required so we drop nodes lacking attrs
  // and PostgREST evaluates attribute filters in SQL (not after).
  //
  // Pagination: Supabase project sets db-max-rows ≈ 1000, server-side
  // clamp regardless of client .range(). mat-ucheniya passes that cap
  // post-spec-018, so we loop pages until a page comes back smaller
  // than PAGE_SIZE. Hard ceiling at PAGE_SIZE * MAX_PAGES = 10 000.
  type Embedded = {
    id: string;
    campaign_id: string;
    title: string;
    fields: Record<string, unknown> | null;
    attrs: ItemAttrsRow | ItemAttrsRow[] | null;
  };

  const PAGE_SIZE = 1000;
  const MAX_PAGES = 10;
  const allRows: Embedded[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let query = supabase
      .from('nodes')
      .select(
        `
        id, campaign_id, title, fields,
        type:node_types!inner(slug),
        attrs:item_attributes!inner(
          node_id, category_slug, rarity, price_gp, weight_lb,
          slot_slug, source_slug, availability_slug,
          use_default_price, requires_attunement
        )
      `,
      )
      .eq('campaign_id', campaignId)
      .eq('type.slug', 'item')
      .order('title', { ascending: true })
      .range(from, to);

    if (filters.q && filters.q.length > 0) {
      query = query.ilike('title', `%${filters.q}%`);
    }
    if (filters.category) query = query.eq('attrs.category_slug', filters.category);
    if (filters.rarity) query = query.eq('attrs.rarity', filters.rarity);
    if (filters.slot) query = query.eq('attrs.slot_slug', filters.slot);
    if (filters.source) query = query.eq('attrs.source_slug', filters.source);
    if (filters.availability) {
      query = query.eq('attrs.availability_slug', filters.availability);
    }

    const { data, error } = await query;
    if (error) throw new Error(`getCatalogItems: ${error.message}`);
    const rows = (data ?? []) as Embedded[];
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }

  const out: ItemNode[] = [];
  for (const row of allRows) {
    const attrs = unwrapOne(row.attrs);
    const item = hydrate(
      {
        id: row.id,
        campaign_id: row.campaign_id,
        title: row.title,
        fields: row.fields,
        type: null,
      },
      attrs,
    );
    if (item) out.push(item);
  }
  return out;
}

// ─────────────────────────── getItemById ───────────────────────────

export async function getItemById(
  campaignId: string,
  itemId: string,
): Promise<ItemNode | null> {
  const supabase = await createClient();

  const { data: nodeRow, error: nodeErr } = await supabase
    .from('nodes')
    .select('id, campaign_id, title, fields, type:node_types(slug)')
    .eq('id', itemId)
    .eq('campaign_id', campaignId)
    .maybeSingle();

  if (nodeErr) throw new Error(`getItemById (node): ${nodeErr.message}`);
  if (!nodeRow) return null;

  // Type guard — only return if it's actually an item node.
  const type = unwrapOne((nodeRow as NodeRow).type);
  if (!type || type.slug !== 'item') return null;

  const { data: attrs, error: attrsErr } = await supabase
    .from('item_attributes')
    .select(
      'node_id, category_slug, rarity, price_gp, weight_lb, slot_slug, source_slug, availability_slug, use_default_price, requires_attunement',
    )
    .eq('node_id', itemId)
    .maybeSingle();

  if (attrsErr) throw new Error(`getItemById (attrs): ${attrsErr.message}`);

  return hydrate(nodeRow as NodeRow, (attrs as ItemAttrsRow | null) ?? null);
}

// ─────────────────────────── searchItemsForTypeahead ───────────────────────────

/**
 * Top N items matching `query`, ranked: exact > prefix > substring.
 * Used by `<ItemTypeahead>` (T022). Per NFR-002, this MUST return
 * within 100 ms at 500-item catalog scale.
 *
 * Single-roundtrip implementation (chat 66 perf fix). Originally three
 * sequential queries (`node_types` → `nodes` → `item_attributes`) —
 * cumulative ~600 ms even on a 1-item dataset because each Postgrest
 * call is its own HTTPS round trip. Replaced with one nested-select
 * via `!inner` joins so Postgrest hits Postgres exactly once.
 *
 * Ranking still happens in memory (Postgrest can't do it cleanly):
 *   1. Pull up to 30 ILIKE matches with attrs embedded.
 *   2. Re-rank by exact > prefix > substring.
 *   3. Slice to `limit`.
 */
export async function searchItemsForTypeahead(
  campaignId: string,
  query: string,
  limit = 10,
): Promise<ItemNode[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const supabase = await createClient();

  type Embedded = Omit<NodeRow, 'type'> & {
    type: { slug: string } | { slug: string }[] | null;
    attrs: ItemAttrsRow | ItemAttrsRow[] | null;
  };

  // `!inner` on both joins drops nodes without attrs (defensive
  // against the post-mig 043 invariant being broken) and lets us
  // filter by `node_types.slug` without a separate id lookup.
  // Search both `title` (Russian display) and `fields->>srd_slug`
  // (English alias) — the JSONB path arg works inside `ilike`.
  const { data, error } = await supabase
    .from('nodes')
    .select(
      `
      id, campaign_id, title, fields,
      type:node_types!inner(slug),
      attrs:item_attributes!inner(
        node_id, category_slug, rarity, price_gp, weight_lb,
        slot_slug, source_slug, availability_slug, use_default_price, requires_attunement
      )
    `,
    )
    .eq('campaign_id', campaignId)
    .eq('type.slug', 'item')
    .or(`title.ilike.%${trimmed}%,fields->>srd_slug.ilike.%${trimmed.toLowerCase()}%`)
    .limit(30);

  if (error) throw new Error(`searchItemsForTypeahead: ${error.message}`);

  const rows = (data ?? []) as Embedded[];
  if (rows.length === 0) return [];

  // Score and re-rank. Score lower = better.
  const needle = trimmed.toLowerCase();
  const scored = rows
    .map((r) => {
      const title = r.title.toLowerCase();
      const fields = (r.fields ?? {}) as { srd_slug?: string };
      const srdSlug = (fields.srd_slug ?? '').toLowerCase();
      let score = 100;
      if (title === needle || srdSlug === needle) score = 0;
      else if (title.startsWith(needle) || srdSlug.startsWith(needle)) score = 1;
      else if (title.includes(needle) || srdSlug.includes(needle)) score = 2;
      return { row: r, score };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.row.title.localeCompare(b.row.title, 'ru');
    })
    .slice(0, limit);

  const out: ItemNode[] = [];
  for (const { row } of scored) {
    const attrs = unwrapOne(row.attrs as ItemAttrsRow | ItemAttrsRow[] | null);
    const item = hydrate(
      {
        id: row.id,
        campaign_id: row.campaign_id,
        title: row.title,
        fields: row.fields,
        type: null,
      },
      attrs ?? null,
    );
    if (item) out.push(item);
  }
  return out;
}

// ─────────────────────────── getItemHistory ───────────────────────────

/**
 * Every approved transaction with `item_node_id = itemNodeId`,
 * chronologically (loop ascending → day_in_loop ascending →
 * created_at ascending). Per FR-Q7=A: only linked rows; free-text
 * matches by name are NOT included.
 *
 * Delegates to `getLedgerPage` so all hydration paths (category
 * labels, author display names, transfer-pair counterparties,
 * actor titles, session titles, autogen markers) are shared. The
 * ledger feed is newest-first; we reverse for chronological display.
 *
 * Returns `TransactionWithRelations[]` so the item page can re-use
 * the existing `<TransactionRow>` component (chat 42 polish).
 */
export async function getItemHistory(
  campaignId: string,
  itemNodeId: string,
  limit = 50,
): Promise<TransactionWithRelations[]> {
  const page = await getLedgerPage(
    campaignId,
    { itemNodeId, kind: ['item'] },
    null,
    limit,
  );
  // getLedgerPage returns newest-first; flip to oldest-first per FR-025.
  return [...page.rows].reverse();
}

// ─────────────────────────── getLinkedTransactionCount ───────────────────────────

/**
 * Count of approved transactions referencing this Образец. Surfaced
 * in `<ItemEditDialog>` (FR-030) so the DM sees the scope of an
 * edit before saving.
 */
export async function getLinkedTransactionCount(itemNodeId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('item_node_id', itemNodeId)
    .eq('status', 'approved');
  if (error) throw new Error(`getLinkedTransactionCount: ${error.message}`);
  return count ?? 0;
}
