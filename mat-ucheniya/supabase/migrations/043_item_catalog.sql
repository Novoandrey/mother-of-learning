-- Миграция 043: Item catalog schema (spec-015).
--
-- Layered on top of `nodes` (spec-001) + `categories` (spec-010, mig 034).
-- Promotes items from free-text `transactions.item_name` strings to
-- first-class graph nodes of `type='item'`, backed by a side table
-- `item_attributes` for typed hot fields (category, rarity, price,
-- weight, slot, source, availability). Cold fields (srd_slug,
-- description, source_detail) keep living in `nodes.fields` JSONB.
--
-- Adds:
--   * node_types row for 'item' per existing campaign (idempotent UPSERT)
--   * item_attributes side table — PK on node_id, FK to nodes(id)
--     ON DELETE CASCADE. Indexed for catalog filter / sort / group-by
--     paths. RLS read-by-member; writes through admin client.
--   * transactions.item_node_id column — nullable FK to nodes(id)
--     ON DELETE SET NULL (FR-013/032). Indexed (partial, NOT NULL).
--   * transactions_item_node_id_kind_match CHECK — link only allowed
--     when kind='item'; non-item rows MUST have NULL.
--   * categories.scope CHECK extension to 5 values: 'transaction'
--     (existing), 'item' (existing slot, never seeded by 034),
--     'item-slot', 'item-source', 'item-availability' (new).
--   * Per-campaign default seeds for the 4 item-scope value lists:
--     8 categories, 13 slots, 2 sources, 4 availabilities.
--
-- New campaigns get the seeds via `seedCampaignCategories` extension
-- (separate TS task, not this migration). This migration backfills
-- existing campaigns only.
--
-- The SRD item seed itself (~400 items) ships separately as
-- migration 044, so 043 stays pure schema and idempotent.
--
-- ⚠️ Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- DROP CONSTRAINT IF EXISTS / ADD CONSTRAINT, ON CONFLICT DO NOTHING
-- on every seed insert. Re-running is safe.
--
-- Rollback:
--   alter table transactions drop constraint transactions_item_node_id_kind_match;
--   drop index if exists idx_transactions_item_node_id;
--   alter table transactions drop column item_node_id;
--   drop function if exists touch_item_attributes_updated_at();
--   drop table if exists item_attributes;
--   delete from categories where scope in ('item','item-slot','item-source','item-availability');
--   alter table categories drop constraint categories_scope_check;
--   alter table categories add constraint categories_scope_check
--     check (scope in ('transaction','item'));
--   delete from node_types where slug = 'item';

begin;

-- ─────────────────────────── node_types: 'item' ───────────────────────────

-- Seed 'item' node type per existing campaign. New campaigns pick this
-- up through initializeCampaignFromTemplate (TS-side, T004 in tasks.md).
-- default_fields stays '{}' — the item form is a custom dialog
-- (<ItemCreateDialog> / <ItemEditDialog>), not the generic node form.

insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select c.id, 'item', 'Предметы', 'package', '{}'::jsonb, 60
from campaigns c
on conflict (campaign_id, slug) do nothing;

-- ─────────────────────────── item_attributes ───────────────────────────

create table if not exists item_attributes (
  node_id            uuid primary key references nodes(id) on delete cascade,

  -- Hot fields (FR-002 — typed columns for filter/sort/group-by speed).
  -- All slug refs target categories(scope='…', campaign_id=<via nodes>).
  -- App layer enforces same-campaign coherence; DB doesn't (it would
  -- need a multi-table FK, which Postgres doesn't support cleanly).

  category_slug      text not null,                          -- categories(scope='item').slug
  rarity             text                                    -- closed enum (FR-005); NULL for non-magical
                       check (rarity in (
                         'common','uncommon','rare','very-rare','legendary','artifact'
                       )),
  price_gp           numeric(12,2),                          -- nullable; some items priceless / not for sale
  weight_lb          numeric(8,2),                           -- nullable
  slot_slug          text,                                   -- categories(scope='item-slot').slug; NULL = doesn't occupy slot
  source_slug        text,                                   -- categories(scope='item-source').slug
  availability_slug  text,                                   -- categories(scope='item-availability').slug

  -- srd_slug, description, source_detail live in nodes.fields JSONB.

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Sanity: prices and weights non-negative when present.
  check (price_gp   is null or price_gp   >= 0),
  check (weight_lb  is null or weight_lb  >= 0)
);

-- Composite index for the most common browse pattern: filter by
-- category, then sort/group by rarity inside it.
create index if not exists idx_item_attributes_category_rarity
  on item_attributes (category_slug, rarity);

-- Partial indexes for filterable optional fields. `where … is not null`
-- keeps index size minimal (most items don't fill every slot).
create index if not exists idx_item_attributes_price
  on item_attributes (price_gp)
  where price_gp is not null;

create index if not exists idx_item_attributes_slot
  on item_attributes (slot_slug)
  where slot_slug is not null;

create index if not exists idx_item_attributes_source
  on item_attributes (source_slug)
  where source_slug is not null;

create index if not exists idx_item_attributes_availability
  on item_attributes (availability_slug)
  where availability_slug is not null;

-- updated_at trigger (codebase convention: per-table function).
create or replace function touch_item_attributes_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_item_attributes_updated_at on item_attributes;
create trigger trg_item_attributes_updated_at
  before update on item_attributes
  for each row
  execute function touch_item_attributes_updated_at();

-- RLS: select by any campaign member (membership derived through the
-- linked node's campaign). Writes happen via admin client in server
-- actions, gated DM-only at the app layer (FR-003). No insert/update/
-- delete policy declared.

alter table item_attributes enable row level security;

drop policy if exists item_attributes_select on item_attributes;
create policy item_attributes_select on item_attributes
  for select to authenticated
  using (
    exists (
      select 1 from nodes n
      where n.id = item_attributes.node_id
        and is_member(n.campaign_id)
    )
  );

-- ─────────────────────────── transactions.item_node_id ───────────────────────────

-- Nullable FK — NULL means free-text fallback (back-compat for
-- pre-spec-015 rows AND for player free-text submissions per FR-015).
-- ON DELETE SET NULL implements FR-032: deleting an Образец preserves
-- linked transactions, just severs the link; the `item_name` snapshot
-- (FR-014) keeps the row displayable.

alter table transactions
  add column if not exists item_node_id uuid
    references nodes(id) on delete set null;

-- Partial index on NOT NULL — typeahead history join, item page «История»
-- query, both filter `item_node_id is not null`. ~95%+ of rows in
-- mat-ucheniya are non-item, so partial keeps the index tiny.
create index if not exists idx_transactions_item_node_id
  on transactions (item_node_id)
  where item_node_id is not null;

-- CHECK: link only valid when kind='item'. The clause "item_node_id IS
-- NULL OR kind = 'item'" reads as "no link, or kind matches"; rejects
-- the (kind='money', item_node_id=<some uuid>) corruption case.
alter table transactions
  drop constraint if exists transactions_item_node_id_kind_match;
alter table transactions
  add constraint transactions_item_node_id_kind_match
  check (item_node_id is null or kind = 'item');

-- ─────────────────────────── categories.scope expansion ───────────────────────────

-- Postgres doesn't support ALTER CHECK in place; drop + recreate.
-- The 'item' scope was already allowed by 034 but never seeded
-- (spec-010 reserved the slot for spec-015). 043 adds 3 more scopes
-- and seeds default rows for all 4 item-scope lists below.

alter table categories
  drop constraint if exists categories_scope_check;
alter table categories
  add constraint categories_scope_check
  check (scope in (
    'transaction',
    'item',
    'item-slot',
    'item-source',
    'item-availability'
  ));

-- ─────────────────────────── per-campaign value-list seeds ───────────────────────────

-- 4 lists × per-campaign × ON CONFLICT DO NOTHING for idempotency.
-- The unique constraint (campaign_id, scope, slug) on `categories`
-- (from 034) is the conflict target.

-- (1) Item categories — FR-004. 8 default buckets.
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item', s.slug, s.label, s.sort_order
from campaigns c
cross join (values
  ('weapon',     'Оружие',          10),
  ('armor',      'Доспехи',         20),
  ('consumable', 'Расходники',      30),
  ('magic-item', 'Магические',      40),
  ('wondrous',   'Чудесные',        50),
  ('tool',       'Инструменты',     60),
  ('treasure',   'Сокровища',       70),
  ('misc',       'Прочее',          80)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

-- (2) Item slots — FR-005a. 13 default slots (5e equipment positions).
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item-slot', s.slug, s.label, s.sort_order
from campaigns c
cross join (values
  ('ring',      'Кольцо',           10),
  ('cloak',     'Плащ',             20),
  ('amulet',    'Амулет',           30),
  ('boots',     'Обувь',            40),
  ('gloves',    'Перчатки',         50),
  ('headwear',  'Головной убор',    60),
  ('belt',      'Пояс',             70),
  ('body',      'Тело',             80),
  ('shield',    'Щит',              90),
  ('1-handed',  'Одноручное',      100),
  ('2-handed',  'Двуручное',       110),
  ('versatile', 'Универсальное',   120),
  ('ranged',    'Дальнобойное',    130)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

-- (3) Item sources — FR-005b. SRD + homebrew defaults; DM extends.
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item-source', s.slug, s.label, s.sort_order
from campaigns c
cross join (values
  ('srd-5e',   'SRD 5e',   10),
  ('homebrew', 'Хоумбрю',  20)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

-- (4) Item availabilities — FR-005c. 4 default tiers; DM extends.
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item-availability', s.slug, s.label, s.sort_order
from campaigns c
cross join (values
  ('for-sale', 'Свободно купить',  10),
  ('quest',    'Квестовый',        20),
  ('unique',   'Уникум',           30),
  ('starter',  'Стартовый',        40)
) as s(slug, label, sort_order)
on conflict (campaign_id, scope, slug) do nothing;

commit;

-- ─────────────────────────── post-deploy verification ───────────────────────────
-- Run these manually (or via T003 / scripts/check-rls-015.sql) after
-- applying. All should return expected counts and shapes.
--
-- 1. node_type 'item' present per campaign:
--    select count(*) from node_types where slug = 'item';
--    -- expect: count(campaigns)
--
-- 2. item_attributes empty but reachable:
--    select count(*) from item_attributes;
--    -- expect: 0
--
-- 3. transactions.item_node_id present and NULL on all existing rows:
--    select count(*) from transactions where item_node_id is not null;
--    -- expect: 0
--
-- 4. New CHECK rejects non-item link (run inside BEGIN / ROLLBACK):
--    begin;
--    insert into transactions (campaign_id, kind, actor_pc_id, ...)
--    values (..., 'money', ..., item_node_id => '<some node uuid>');
--    -- expect: ERROR violates check transactions_item_node_id_kind_match
--    rollback;
--
-- 5. Per-campaign seed counts:
--    select scope, count(*)
--    from categories
--    where scope in ('item','item-slot','item-source','item-availability')
--    group by scope;
--    -- expect: item=8 × #campaigns, item-slot=13 × #campaigns,
--    --         item-source=2 × #campaigns, item-availability=4 × #campaigns
