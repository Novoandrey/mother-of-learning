-- Migration 127: craft (spec-056 — Крафт).
--
-- Player-facing /tg feature on the trust model (like вылазки, 124/125):
--
--   * `craft_runs` — one completed craft act: which schema was used, when
--     (loop/day + optional start minute), who invested hours (participants
--     jsonb, форма [{nodeId, hours}] — часы per-крафтер, не uuid[]), the
--     working cost written off the общак (invested_gp), what came out
--     (output_item_node_id/name) and who received it (recipient_node_id,
--     NULL = общак). The run's FINANCIAL effect is real `transactions` rows
--     on the общак written by the runCraft server action (membership-gated,
--     admin client — app/actions/craft.ts); this table carries the
--     narrative/history, NOT balances. Append-only v1 (модель доверия).
--
--   * categories: seed scope='item', slug='schema', label='Схема' per
--     existing campaign — same per-campaign cross-join + ON CONFLICT DO
--     NOTHING shape as migration 125's «Ресурс»; conflict target is the
--     unique (campaign_id, scope, slug) from migration 034. sort_order 95
--     sits after 'resource' (90). New campaigns pick the category up
--     through the TS seeder (lib/seeds/item-value-lists.ts).
--
--   * `item_attributes.schema_for_node_id` — nullable FK to nodes(id): the
--     catalog item this schema teaches to craft (plan-056: a column, not an
--     edge — precedent `transactions.item_node_id`; edges would cost an
--     edge_type + join). NULL on non-schema items and on schemas whose
--     target isn't in the catalog. Partial index for the reverse lookup
--     («какие схемы крафтят этот предмет»).
--
-- ⚠️ Idempotent + non-destructive: CREATE/ADD IF NOT EXISTS, ON CONFLICT DO
--    NOTHING. Re-running is safe.
-- Rollback:
--   drop index if exists idx_item_attributes_schema_for;
--   alter table item_attributes drop column if exists schema_for_node_id;
--   delete from categories where scope = 'item' and slug = 'schema';
--   drop table if exists craft_runs;

begin;

-- ── craft_runs: one completed craft act ──────────────────────────────────────
create table if not exists craft_runs (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references campaigns(id) on delete cascade,
  schema_item_node_id uuid references nodes(id) on delete set null,
  loop_number         int not null,   -- «дата» = (loop, day), как в transactions
  day_in_loop         int not null,
  start_minute        int,            -- 0..1439 внутри day_in_loop; NULL = без времени
  participants        jsonb not null default '[]'::jsonb, -- [{nodeId, hours}]
  invested_gp         numeric(12,2) not null default 0,   -- рабочая цена, списанная с общака
  output_item_node_id uuid references nodes(id) on delete set null,
  output_item_name    text not null default '',
  recipient_node_id   uuid references nodes(id) on delete set null, -- NULL = общак
  created_by          uuid,           -- auth user id (кто провёл крафт)
  created_at          timestamptz not null default now()
);

create index if not exists idx_craft_runs_campaign on craft_runs (campaign_id);
create index if not exists idx_craft_runs_schema on craft_runs (schema_item_node_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Same stance as expedition_runs (124): member-wide SELECT (history visible to
-- all members), any member may log a run (модель доверия — spec-056 наследует
-- «и ДМ, и игроки» от вылазок). Fine-grained gating lives in the server action.
alter table craft_runs enable row level security;
drop policy if exists craft_runs_select on craft_runs;
create policy craft_runs_select on craft_runs
  for select to authenticated using (is_member(campaign_id));
drop policy if exists craft_runs_modify on craft_runs;
create policy craft_runs_modify on craft_runs
  for all to authenticated
  using (is_member(campaign_id)) with check (is_member(campaign_id));

-- ── categories: «Схема» item category, per existing campaign ─────────────────
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item', 'schema', 'Схема', 95
from campaigns c
on conflict (campaign_id, scope, slug) do nothing;

-- ── item_attributes: schema → target item link ───────────────────────────────
alter table item_attributes
  add column if not exists schema_for_node_id uuid references nodes(id) on delete set null;

create index if not exists idx_item_attributes_schema_for
  on item_attributes (schema_for_node_id)
  where schema_for_node_id is not null;

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when to_regclass('public.craft_runs') is not null
   and (select count(*) from pg_policies where tablename = 'craft_runs') >= 2
   and exists (
         select 1 from information_schema.columns
         where table_name = 'item_attributes'
           and column_name = 'schema_for_node_id'
       )
   and (select count(*) from categories where scope = 'item' and slug = 'schema')
       >= (select count(*) from campaigns)
  then '✅ craft_runs + RLS, «Схема» item category, item_attributes.schema_for_node_id'
  else '❌ 127 incomplete'
end as result;
