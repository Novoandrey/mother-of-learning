-- Migration 128: drop item_attributes → nodes SECOND foreign key (fix crafting fallout).
--
-- Migration 127 (crafting) added `item_attributes.schema_for_node_id` AS A
-- FOREIGN KEY to nodes(id). That gave item_attributes TWO FKs to nodes
-- (node_id + schema_for_node_id) — which makes every PostgREST embed
-- `nodes -> item_attributes` AMBIGUOUS (PostgREST 300 «more than one
-- relationship was found»). Callers do `const { data } = await ...` WITHOUT
-- checking `error`, so `data` comes back null → empty result. This silently
-- broke: /tg purchase search (searchBuyableItemsTg), set pricing (sets.ts),
-- desktop catalog (lib/items.ts getCatalogItems/typeahead), apply-prices
-- (settings/actions.ts) and crafting-schema reads (craft-tg.ts) — everything
-- that embeds item_attributes from nodes, live since spec-056 merged.
--
-- Fix: DROP the FK, KEEP the column. `schema_for_node_id` stays a soft
-- app-layer link (resolved by an explicit join in craft-tg; a dangling id
-- reads as «target not found», already handled). This matches the existing
-- convention — category_slug / source_slug / availability_slug are app-layer
-- links with NO db FK (mig 043 note: same-campaign coherence is checked in the
-- app, not by FK). Removing the FK restores unambiguous embeds for ALL current
-- AND future queries — no per-query PostgREST hint needed, no silent-breakage
-- footgun for the next person who embeds item_attributes.
--
-- ⚠️ Idempotent. Rollback (NOT recommended — reintroduces the ambiguity):
--   alter table item_attributes
--     add constraint item_attributes_schema_for_node_id_fkey
--     foreign key (schema_for_node_id) references nodes(id) on delete set null;

begin;

alter table item_attributes
  drop constraint if exists item_attributes_schema_for_node_id_fkey;

commit;

-- PostgREST caches the schema; nudge it to forget the dropped relationship
-- immediately (self-hosted Supabase also reloads via its DDL event trigger).
notify pgrst, 'reload schema';

-- ─────────────────────────── Verify ───────────────────────────
select case
  when (select count(*) from pg_constraint
        where conrelid = 'item_attributes'::regclass and contype = 'f'
          and confrelid = 'nodes'::regclass) = 1
  then '✅ item_attributes has a single FK to nodes — embeds unambiguous'
  else '❌ 128 — unexpected FK count from item_attributes to nodes'
end as result;
