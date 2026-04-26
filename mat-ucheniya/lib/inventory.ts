/**
 * Inventory read surface — spec-015.
 *
 * `getInventoryAt(actorNodeId, loop, day)` returns one row per
 * distinct item the actor (PC or stash) holds at the chosen
 * `(loop, day)` slice. Per FR-023 / Q8: the slice is a transparent
 * SQL filter, not a security gate — the picker is a tool, the
 * day chip on screen is the trust mechanism.
 *
 * Pipeline:
 *   1. Load every approved `kind='item'` leg for this actor in this
 *      loop with `day_in_loop ≤ day`. Includes direct loot rows,
 *      autogen rows (encounter loot via spec-013), and transfer-pair
 *      legs (PC ↔ stash, PC ↔ PC). Both signed_qty signs are kept;
 *      the aggregator handles direction via leg.direction.
 *   2. Load sibling legs (PC counterparty for transfers) in one
 *      grouped IN-query — populates "got from X" / "gave to X" in
 *      the expand-row instances.
 *   3. Load author display names in one IN-query.
 *   4. Shape into `ItemLeg[]` and pass to `aggregateItemLegs`. Default
 *      keyFn is collision-proof: linked items dedupe by `itemNodeId`,
 *      free-text by `name:${itemName}`.
 *   5. Hydrate hot fields from `item_attributes` for linked rows in
 *      one grouped IN-query. Free-text rows get `attributes: null`.
 *   6. Optionally override the display title with the **live** Образец
 *      title via the `nodes` join (FR-031: a renamed Образец shows
 *      the new name on every linked row).
 *
 * Single function — no pagination. Inventory at one slice is bounded
 * by the actor's lifetime activity in that loop, which is small in
 * mat-ucheniya scale (hundreds of legs at most).
 */

import { createClient } from '@/lib/supabase/server';
import { unwrapOne } from '@/lib/supabase/joins';
import {
  aggregateItemLegs,
  type ItemLeg,
} from './inventory-aggregation';
import type {
  InventoryRow,
  ItemNodeAttributes,
  Rarity,
} from './items-types';

// ─────────────────────────── Row shapes ───────────────────────────

type LegRow = {
  id: string;
  transfer_group_id: string | null;
  item_name: string | null;
  item_node_id: string | null;
  item_qty: number;
  loop_number: number;
  day_in_loop: number;
  session_id: string | null;
  comment: string;
  author_user_id: string | null;
  created_at: string;
  session: { id: string; title: string } | { id: string; title: string }[] | null;
};

type SiblingRow = {
  transfer_group_id: string | null;
  actor_pc_id: string | null;
  actor_pc: { id: string; title: string } | { id: string; title: string }[] | null;
};

type AttrsRow = {
  node_id: string;
  category_slug: string;
  rarity: string | null;
  price_gp: number | null;
  weight_lb: number | null;
  slot_slug: string | null;
  source_slug: string | null;
  availability_slug: string | null;
};

type LiveTitleRow = {
  id: string;
  title: string;
};

// ─────────────────────────── getInventoryAt ───────────────────────────

export async function getInventoryAt(
  actorNodeId: string,
  loopNumber: number,
  dayInLoop: number,
): Promise<InventoryRow[]> {
  const supabase = await createClient();

  // Step 1 — leg rows.
  const { data: legRows, error: legsErr } = await supabase
    .from('transactions')
    .select(
      `
      id, transfer_group_id, item_name, item_node_id, item_qty,
      loop_number, day_in_loop, session_id, comment,
      author_user_id, created_at,
      session:nodes!session_id ( id, title )
    `,
    )
    .eq('actor_pc_id', actorNodeId)
    .eq('loop_number', loopNumber)
    .lte('day_in_loop', dayInLoop)
    .eq('kind', 'item')
    .eq('status', 'approved');

  if (legsErr) {
    throw new Error(`getInventoryAt (legs): ${legsErr.message}`);
  }

  const rows = (legRows ?? []) as unknown as LegRow[];
  if (rows.length === 0) return [];

  // Step 2 — sibling legs for transfer-pair counterparty hydration.
  const groupIds = [
    ...new Set(rows.map((r) => r.transfer_group_id).filter((v): v is string => !!v)),
  ];
  const counterpartyByGroupId = new Map<string, { id: string; title: string }>();
  if (groupIds.length > 0) {
    const { data: siblings, error: sibErr } = await supabase
      .from('transactions')
      .select(
        `
        transfer_group_id, actor_pc_id,
        actor_pc:nodes!actor_pc_id ( id, title )
      `,
      )
      .in('transfer_group_id', groupIds)
      .eq('kind', 'item')
      .eq('status', 'approved')
      .neq('actor_pc_id', actorNodeId);

    if (sibErr) {
      throw new Error(`getInventoryAt (siblings): ${sibErr.message}`);
    }

    for (const s of (siblings ?? []) as unknown as SiblingRow[]) {
      const pc = unwrapOne(s.actor_pc);
      if (s.transfer_group_id && pc) {
        counterpartyByGroupId.set(s.transfer_group_id, pc);
      }
    }
  }

  // Step 3 — author display names.
  const authorIds = [
    ...new Set(rows.map((r) => r.author_user_id).filter((v): v is string => !!v)),
  ];
  const authorDisplayName = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profiles, error: profErr } = await supabase
      .from('user_profiles')
      .select('user_id, display_name')
      .in('user_id', authorIds);
    if (profErr) {
      throw new Error(`getInventoryAt (authors): ${profErr.message}`);
    }
    for (const p of (profiles ?? []) as { user_id: string; display_name: string | null }[]) {
      authorDisplayName.set(p.user_id, p.display_name);
    }
  }

  // Step 4 — shape into ItemLeg[]. Direction from sign; qty as
  // absolute magnitude (the aggregator encodes sign via direction).
  const legs: ItemLeg[] = rows.map((r) => {
    const session = unwrapOne(r.session);
    const counterparty = r.transfer_group_id
      ? counterpartyByGroupId.get(r.transfer_group_id) ?? null
      : null;
    const signedQty = r.item_qty;
    return {
      transactionId: r.id,
      transferGroupId: r.transfer_group_id,
      itemNodeId: r.item_node_id,
      itemName: r.item_name ?? '',
      qty: Math.abs(signedQty),
      direction: signedQty > 0 ? 'in' : 'out',
      loopNumber: r.loop_number,
      dayInLoop: r.day_in_loop,
      createdAt: r.created_at,
      sessionId: session?.id ?? null,
      sessionTitle: session?.title ?? null,
      droppedByPcId: counterparty?.id ?? null,
      droppedByPcTitle: counterparty?.title ?? null,
      comment: r.comment,
      authorUserId: r.author_user_id,
      authorDisplayName: r.author_user_id
        ? authorDisplayName.get(r.author_user_id) ?? null
        : null,
    };
  });

  // Step 5 — fold.
  const aggregated = aggregateItemLegs(legs);

  // Step 6 — hydrate hot fields and live titles for linked rows.
  const linkedNodeIds = [
    ...new Set(
      aggregated
        .map((row) => row.itemNodeId)
        .filter((v): v is string => v !== null),
    ),
  ];

  const attrsByNodeId = new Map<string, ItemNodeAttributes>();
  const liveTitleByNodeId = new Map<string, string>();
  if (linkedNodeIds.length > 0) {
    const [attrsRes, titlesRes] = await Promise.all([
      supabase
        .from('item_attributes')
        .select(
          'node_id, category_slug, rarity, price_gp, weight_lb, slot_slug, source_slug, availability_slug',
        )
        .in('node_id', linkedNodeIds),
      supabase.from('nodes').select('id, title').in('id', linkedNodeIds),
    ]);
    if (attrsRes.error) {
      throw new Error(`getInventoryAt (attrs): ${attrsRes.error.message}`);
    }
    if (titlesRes.error) {
      throw new Error(`getInventoryAt (titles): ${titlesRes.error.message}`);
    }
    for (const a of (attrsRes.data ?? []) as AttrsRow[]) {
      attrsByNodeId.set(a.node_id, {
        categorySlug: a.category_slug,
        rarity: (a.rarity as Rarity | null) ?? null,
        priceGp: a.price_gp,
        weightLb: a.weight_lb,
        slotSlug: a.slot_slug,
        sourceSlug: a.source_slug,
        availabilitySlug: a.availability_slug,
      });
    }
    for (const t of (titlesRes.data ?? []) as LiveTitleRow[]) {
      liveTitleByNodeId.set(t.id, t.title);
    }
  }

  // Step 7 — produce InventoryRow[].
  return aggregated.map<InventoryRow>((row) => ({
    itemNodeId: row.itemNodeId,
    // Linked rows: live Образец title via the nodes lookup (FR-031).
    // Free-text rows: snapshot from the leg.
    itemName:
      row.itemNodeId !== null
        ? liveTitleByNodeId.get(row.itemNodeId) ?? row.itemName
        : row.itemName,
    qty: row.qty,
    latestLoop: row.latestLoop,
    latestDay: row.latestDay,
    attributes: row.itemNodeId !== null ? attrsByNodeId.get(row.itemNodeId) ?? null : null,
    ...(row.warning ? { warning: true as const } : {}),
  }));
}
