-- Миграция 037: Loop start setup + autogen layer (spec-012).
--
-- Делает семь вещей:
--   (1) campaign_starter_configs — campaign-level starter config,
--       one row per campaign. Seeds one row for every existing
--       campaign с дефолтами (zero loan, empty stash seed).
--   (2) pc_starter_configs — PC-level starter config, one row
--       per PC (node_types.slug='character'). Seeds one row для
--       каждого существующего PC с `takes_starting_loan=true` и
--       пустыми coins/items.
--   (3) autogen_tombstones — записи о hand-delete автоген-рядов,
--       consumed by `applyLoopStartSetup`. Trigger-populated.
--   (4) Три новых колонки на `transactions`:
--         * autogen_wizard_key       (text, nullable, open-ended)
--         * autogen_source_node_id   (uuid, FK to nodes, on delete cascade)
--         * autogen_hand_touched     (boolean, not null, default false)
--       + partial index (autogen_source_node_id, autogen_wizard_key)
--   (5) Триггер `trg_tx_autogen_hand_touched` (BEFORE UPDATE):
--       flips autogen_hand_touched = true если ряд отредактирован
--       вне apply/reapply. Guard — session setting `spec012.applying`.
--   (6) Триггер `trg_tx_autogen_tombstone` (AFTER DELETE):
--       пишет строку в autogen_tombstones если удаление
--       произошло вне apply/reapply.
--   (7) Seed категорий `starting_money` + `starting_items` для
--       mat-ucheniya и (через `lib/seeds/categories.ts` в коде)
--       будущих кампаний.
--
-- Модель:
--   * autogen_wizard_key — open-ended, без CHECK. Spec-012 пишет
--     ('starting_money', 'starting_loan', 'stash_seed', 'starting_items').
--     Spec-013 добавит 'encounter_loot' без миграции.
--   * Маркер — orthogonal property: не заменяет kind/category/session_id.
--   * Reconcile — по (autogen_wizard_key, autogen_source_node_id).
--   * Wizards → transactions: normal rows, с маркером.
--   * Hand-touched — set on edit (trigger), reset on apply (RPC).
--   * Hand-deleted — recorded as tombstone (trigger), consumed by apply.
--
-- Forward-compat:
--   * spec-015 добавит `item_node_id uuid nullable references nodes(id)
--     on delete set null` — с NULL по умолчанию, без backfill.
--   * IDEA-054 (PC↔Location epic) добавит `item_location_node_id` +
--     `carried_state` — тоже nullable, без backfill. Spec-012 starter-
--     items rows читаются post-addition как NULL (location=actor),
--     что идентично today's semantics.
--
-- ⚠️ Идемпотентна:
--   * `create table if not exists`
--   * `insert ... where not exists` / `on conflict do nothing`
--   * `alter table ... add column if not exists` (Postgres 9.6+)
--   * Триггеры: `drop trigger if exists ... ; create trigger ...`
--   * Функции: `create or replace function`
--
-- Rollback:
--   begin;
--     drop trigger if exists trg_tx_autogen_tombstone on transactions;
--     drop trigger if exists trg_tx_autogen_hand_touched on transactions;
--     drop function if exists record_autogen_tombstone();
--     drop function if exists mark_autogen_hand_touched();
--     drop index if exists idx_tx_autogen_source_wizard;
--     alter table transactions
--       drop column if exists autogen_hand_touched,
--       drop column if exists autogen_source_node_id,
--       drop column if exists autogen_wizard_key;
--     drop table if exists autogen_tombstones;
--     drop table if exists pc_starter_configs;
--     drop table if exists campaign_starter_configs;
--     -- Сидовые категории `starting_money` / `starting_items` остаются;
--     -- если нужно — `delete from categories where slug in ('starting_money','starting_items');`
--   commit;

begin;

-- ─────────────────────────── 1. campaign_starter_configs ───────────────────────────

create table if not exists campaign_starter_configs (
  campaign_id         uuid primary key
                      references campaigns(id) on delete cascade,

  -- starting loan (campaign-level default amount)
  loan_amount_cp      int  not null default 0,
  loan_amount_sp      int  not null default 0,
  loan_amount_gp      int  not null default 0,
  loan_amount_pp      int  not null default 0,

  -- stash seed (coins only; items live in stash_seed_items)
  stash_seed_cp       int  not null default 0,
  stash_seed_sp       int  not null default 0,
  stash_seed_gp       int  not null default 0,
  stash_seed_pp       int  not null default 0,

  -- stash seed items: [{name: text, qty: int>=1}]
  stash_seed_items    jsonb not null default '[]'::jsonb,

  updated_at          timestamptz not null default now(),

  constraint cfg_loan_non_neg check (
    loan_amount_cp >= 0 and loan_amount_sp >= 0 and
    loan_amount_gp >= 0 and loan_amount_pp >= 0
  ),
  constraint cfg_seed_non_neg check (
    stash_seed_cp >= 0 and stash_seed_sp >= 0 and
    stash_seed_gp >= 0 and stash_seed_pp >= 0
  ),
  constraint cfg_seed_items_is_array check (
    jsonb_typeof(stash_seed_items) = 'array'
  )
);

-- Seed: one row per existing campaign.
insert into campaign_starter_configs (campaign_id)
select c.id from campaigns c
 where not exists (
   select 1 from campaign_starter_configs csc
    where csc.campaign_id = c.id
 );

alter table campaign_starter_configs enable row level security;

drop policy if exists csc_select on campaign_starter_configs;
create policy csc_select on campaign_starter_configs
  for select to authenticated
  using (is_member(campaign_id));

-- Writes happen via admin client in server actions. RLS — safety net.
drop policy if exists csc_modify on campaign_starter_configs;
create policy csc_modify on campaign_starter_configs
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- ─────────────────────────── 2. pc_starter_configs ───────────────────────────

create table if not exists pc_starter_configs (
  pc_id                 uuid primary key
                        references nodes(id) on delete cascade,

  -- The sole player-editable field (narrative choice owned by the
  -- character's author). Permission enforced in the app layer via
  -- a dedicated server action; RLS stays DM-only as a safety net.
  takes_starting_loan   boolean not null default true,

  -- Starting money (coins)
  starting_cp           int not null default 0,
  starting_sp           int not null default 0,
  starting_gp           int not null default 0,
  starting_pp           int not null default 0,

  -- Starting items: [{name: text, qty: int>=1}]
  starting_items        jsonb not null default '[]'::jsonb,

  updated_at            timestamptz not null default now(),

  constraint pc_cfg_coins_non_neg check (
    starting_cp >= 0 and starting_sp >= 0 and
    starting_gp >= 0 and starting_pp >= 0
  ),
  constraint pc_cfg_items_is_array check (
    jsonb_typeof(starting_items) = 'array'
  )
);

-- Seed: one row per existing PC (node_types.slug='character').
insert into pc_starter_configs (pc_id)
select n.id
  from nodes n
  join node_types nt on nt.id = n.type_id
 where nt.slug = 'character'
   and not exists (
     select 1 from pc_starter_configs p where p.pc_id = n.id
   );

alter table pc_starter_configs enable row level security;

-- Read: any campaign member may read starter configs for PCs in their campaign.
drop policy if exists pcsc_select on pc_starter_configs;
create policy pcsc_select on pc_starter_configs
  for select to authenticated
  using (
    exists (
      select 1 from nodes n
       where n.id = pc_starter_configs.pc_id
         and is_member(n.campaign_id)
    )
  );

-- Write: DM/owner of the PC's campaign. Player's takes_starting_loan
-- edit goes through the admin client in a dedicated server action; the
-- RLS below is the safety net if anyone ever writes directly.
drop policy if exists pcsc_modify on pc_starter_configs;
create policy pcsc_modify on pc_starter_configs
  for all to authenticated
  using (
    exists (
      select 1 from nodes n
       where n.id = pc_starter_configs.pc_id
         and is_dm_or_owner(n.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from nodes n
       where n.id = pc_starter_configs.pc_id
         and is_dm_or_owner(n.campaign_id)
    )
  );

-- ─────────────────────────── 3. autogen_tombstones ───────────────────────────

create table if not exists autogen_tombstones (
  id                       uuid primary key default gen_random_uuid(),
  campaign_id              uuid not null
                           references campaigns(id) on delete cascade,
  autogen_wizard_key       text not null,
  autogen_source_node_id   uuid not null
                           references nodes(id) on delete cascade,
  actor_pc_id              uuid
                           references nodes(id) on delete set null,
  kind                     text not null,
  item_name                text,
  deleted_at               timestamptz not null default now()
);

create index if not exists idx_autogen_tombstones_source
  on autogen_tombstones (autogen_source_node_id, autogen_wizard_key);

alter table autogen_tombstones enable row level security;

-- Read: campaign members can see tombstones in their campaign.
drop policy if exists atb_select on autogen_tombstones;
create policy atb_select on autogen_tombstones
  for select to authenticated
  using (is_member(campaign_id));

-- No write policy — tombstones are inserted by the AFTER DELETE trigger
-- (SECURITY DEFINER) and cleaned up by the apply RPC via admin client.

-- ─────────────────────────── 4. transactions: autogen columns + index ───────────────────────────

alter table transactions
  add column if not exists autogen_wizard_key       text;

alter table transactions
  add column if not exists autogen_source_node_id   uuid
    references nodes(id) on delete cascade;

alter table transactions
  add column if not exists autogen_hand_touched     boolean not null default false;

-- Partial index — most rows are not autogen; index only those that are.
-- Supports the reconcile lookup: "every row tagged with wizard X for source Y"
-- is O(output-size), not O(all-transactions). Spec FR-008b.
create index if not exists idx_tx_autogen_source_wizard
  on transactions (autogen_source_node_id, autogen_wizard_key)
  where autogen_source_node_id is not null;

-- ─────────────────────────── 5. Trigger: mark hand-touched on edit ───────────────────────────
--
-- Session-local setting `spec012.applying = 'on'` disables the trigger
-- while the apply RPC is running. Any other UPDATE of an autogen row
-- flips autogen_hand_touched = true, so the next reapply can surface
-- a confirmation dialog (spec FR-013b).
--
-- Name `spec012.applying` uses a dotted namespace so Postgres accepts
-- the custom setting without explicit registration (per
-- https://www.postgresql.org/docs/current/runtime-config-custom.html).

create or replace function mark_autogen_hand_touched()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip if apply/reapply is running in the current transaction.
  if current_setting('spec012.applying', true) = 'on' then
    return new;
  end if;

  -- Only flag rows that actually have an autogen marker. (The trigger's
  -- WHEN clause already filters this, but guard defensively.)
  if new.autogen_wizard_key is null then
    return new;
  end if;

  new.autogen_hand_touched := true;
  return new;
end;
$$;

drop trigger if exists trg_tx_autogen_hand_touched on transactions;
create trigger trg_tx_autogen_hand_touched
  before update on transactions
  for each row
  when (new.autogen_wizard_key is not null
        or old.autogen_wizard_key is not null)
  execute function mark_autogen_hand_touched();

-- ─────────────────────────── 6. Trigger: record tombstone on delete ───────────────────────────
--
-- Same session-setting guard — apply/reapply's own deletes do NOT write
-- tombstones. Hand-deletes (normal spec-010 row-delete flow) trigger an
-- INSERT into autogen_tombstones so the next reapply can surface the
-- hand-delete in its confirmation dialog (spec US3.5).

create or replace function record_autogen_tombstone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Skip if apply/reapply is running in the current transaction.
  if current_setting('spec012.applying', true) = 'on' then
    return old;
  end if;

  -- Only tombstone autogen rows.
  if old.autogen_wizard_key is null or old.autogen_source_node_id is null then
    return old;
  end if;

  insert into autogen_tombstones (
    campaign_id,
    autogen_wizard_key,
    autogen_source_node_id,
    actor_pc_id,
    kind,
    item_name
  ) values (
    old.campaign_id,
    old.autogen_wizard_key,
    old.autogen_source_node_id,
    old.actor_pc_id,
    old.kind,
    old.item_name
  );

  return old;
end;
$$;

drop trigger if exists trg_tx_autogen_tombstone on transactions;
create trigger trg_tx_autogen_tombstone
  after delete on transactions
  for each row
  when (old.autogen_wizard_key is not null)
  execute function record_autogen_tombstone();

-- ─────────────────────────── 7. Seed categories ───────────────────────────
--
-- Two new category slugs per campaign:
--   * starting_money  (label 'Стартовые деньги', sort_order 15)
--   * starting_items  (label 'Стартовые предметы', sort_order 25)
--
-- `credit` category (used by starting_loan wizard) already seeded by
-- migration 034.
--
-- Slugs are English identifiers (stable across campaigns); labels are
-- Russian (mat-ucheniya primary language). DMs may rename labels via
-- the categories settings page — idempotency check uses the unique
-- (campaign_id, scope, slug) constraint.

insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'transaction', 'starting_money', 'Стартовые деньги', 15
  from campaigns c
  on conflict (campaign_id, scope, slug) do nothing;

insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'transaction', 'starting_items', 'Стартовые предметы', 25
  from campaigns c
  on conflict (campaign_id, scope, slug) do nothing;

commit;
