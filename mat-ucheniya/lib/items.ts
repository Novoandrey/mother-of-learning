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
    srdSlug,
    description,
    sourceDetail,
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

  // Resolve item type id once per call (used for filtering).
  const { data: itemType } = await supabase
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'item')
    .maybeSingle();

  if (!itemType) return [];

  // Step 1 — load nodes filtered by name search if any.
  let nodesQuery = supabase
    .from('nodes')
    .select('id, campaign_id, title, fields')
    .eq('campaign_id', campaignId)
    .eq('type_id', (itemType as { id: string }).id)
    .order('title', { ascending: true });

  if (filters.q && filters.q.length > 0) {
    nodesQuery = nodesQuery.ilike('title', `%${filters.q}%`);
  }

  const { data: nodeRows, error: nodesErr } = await nodesQuery;
  if (nodesErr) {
    throw new Error(`getCatalogItems (nodes): ${nodesErr.message}`);
  }

  const nodes = (nodeRows ?? []) as Array<Omit<NodeRow, 'type'>>;
  if (nodes.length === 0) return [];

  // Step 2 — load matching item_attributes rows in one IN-query.
  const ids = nodes.map((n) => n.id);
  let attrsQuery = supabase
    .from('item_attributes')
    .select(
      'node_id, category_slug, rarity, price_gp, weight_lb, slot_slug, source_slug, availability_slug',
    )
    .in('node_id', ids);

  if (filters.category) attrsQuery = attrsQuery.eq('category_slug', filters.category);
  if (filters.rarity) attrsQuery = attrsQuery.eq('rarity', filters.rarity);
  if (filters.slot) attrsQuery = attrsQuery.eq('slot_slug', filters.slot);
  if (filters.source) attrsQuery = attrsQuery.eq('source_slug', filters.source);
  if (filters.availability) {
    attrsQuery = attrsQuery.eq('availability_slug', filters.availability);
  }

  const { data: attrRows, error: attrsErr } = await attrsQuery;
  if (attrsErr) {
    throw new Error(`getCatalogItems (attrs): ${attrsErr.message}`);
  }

  const attrsByNodeId = new Map<string, ItemAttrsRow>();
  for (const a of (attrRows ?? []) as ItemAttrsRow[]) {
    attrsByNodeId.set(a.node_id, a);
  }

  // Step 3 — hydrate. Nodes with no attrs row (e.g. deleted attrs
  // or filtered-out by a non-q filter) are silently dropped.
  const out: ItemNode[] = [];
  for (const n of nodes) {
    const node: NodeRow = { ...n, type: null };
    const item = hydrate(node, attrsByNodeId.get(n.id) ?? null);
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
      'node_id, category_slug, rarity, price_gp, weight_lb, slot_slug, source_slug, availability_slug',
    )
    .eq('node_id', itemId)
    .maybeSingle();

  if (attrsErr) throw new Error(`getItemById (attrs): ${attrsErr.message}`);

  return hydrate(nodeRow as NodeRow, (attrs as ItemAttrsRow | null) ?? null);
}

// ─────────────────────────── searchItemsForTypeahead ───────────────────────────

/**
 * Top 10 items matching `query`, ranked: exact prefix > exact substring >
 * fuzzy match. Used by `<ItemTypeahead>` (T022). Per NFR-002, this
 * MUST return within 100 ms at 500-item catalog scale.
 *
 * Ranking is implemented in two passes:
 *   1. Pull up to 30 ILIKE-substring matches from Postgres (cheap).
 *   2. Re-rank in memory by prefix > substring > full match.
 *   3. Slice to 10.
 */
export async function searchItemsForTypeahead(
  campaignId: string,
  query: string,
  limit = 10,
): Promise<ItemNode[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];

  const supabase = await createClient();

  const { data: itemType } = await supabase
    .from('node_types')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('slug', 'item')
    .maybeSingle();
  if (!itemType) return [];

  // Step 1 — broad ILIKE pull. Search both `title` (Russian display)
  // and `srd_slug` (English alias). The latter is in JSONB so we use
  // the `->>` operator inside ILIKE.
  const { data: candidates, error: candErr } = await supabase
    .from('nodes')
    .select('id, campaign_id, title, fields')
    .eq('campaign_id', campaignId)
    .eq('type_id', (itemType as { id: string }).id)
    .or(`title.ilike.%${trimmed}%,fields->>srd_slug.ilike.%${trimmed.toLowerCase()}%`)
    .limit(30);

  if (candErr) throw new Error(`searchItemsForTypeahead: ${candErr.message}`);

  const rows = (candidates ?? []) as Array<Omit<NodeRow, 'type'>>;
  if (rows.length === 0) return [];

  // Step 2 — load attrs for the candidates.
  const ids = rows.map((r) => r.id);
  const { data: attrRows, error: attrsErr } = await supabase
    .from('item_attributes')
    .select(
      'node_id, category_slug, rarity, price_gp, weight_lb, slot_slug, source_slug, availability_slug',
    )
    .in('node_id', ids);
  if (attrsErr) throw new Error(`searchItemsForTypeahead (attrs): ${attrsErr.message}`);

  const attrsByNodeId = new Map<string, ItemAttrsRow>();
  for (const a of (attrRows ?? []) as ItemAttrsRow[]) {
    attrsByNodeId.set(a.node_id, a);
  }

  // Step 3 — score and re-rank. Score lower = better.
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
    const item = hydrate({ ...row, type: null }, attrsByNodeId.get(row.id) ?? null);
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
