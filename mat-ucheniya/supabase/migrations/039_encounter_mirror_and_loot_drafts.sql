-- Миграция 039: Encounter mirror nodes + encounter_loot_drafts (spec-013).
--
-- Делает шесть вещей:
--   (1) Сидит node_type 'encounter' для каждой кампании (idempotent
--       через on conflict do update).
--   (2) Добавляет колонку `encounters.node_id` (nullable initially).
--   (3) Бэкфилит по одному mirror-ноду на каждый существующий encounter
--       и заполняет node_id через CTE. T001 (см. tasks.md) подтвердил,
--       что в проде нет дублей по (campaign_id, title), так что match
--       по этой паре однозначен; row_number() tiebreaker не нужен.
--   (3a) Defensive verify: если хоть один encounter остался без node_id —
--        raise exception, миграция роллбэкается.
--   (4) Делает encounters.node_id NOT NULL + FK on delete restrict +
--       unique index.
--   (5) Три триггера encounter↔mirror, все security definer:
--       * `create_encounter_mirror_node` (BEFORE INSERT) — создаёт
--         mirror-ноду и записывает её id в new.node_id.
--       * `sync_encounter_title_to_mirror` (AFTER UPDATE OF title) —
--         синхронизирует title в mirror-ноду.
--       * `delete_encounter_mirror_node` (AFTER DELETE) — удаляет
--         mirror-ноду. FK с RESTRICT не мешает: триггер срабатывает
--         после удаления encounter'а, к моменту DELETE mirror'а
--         нет ссылающихся encounter-ов.
--   (6) Таблица `encounter_loot_drafts`:
--       * encounter_id (PK, FK on delete cascade)
--       * lines jsonb (default '[]')
--       * loop_number int, day_in_loop int (1..30)
--       * updated_by uuid (FK auth.users on delete set null)
--       * created_at, updated_at timestamptz
--       * Index on encounter_id (technically PK is enough, но симметрия
--         с другими таблицами).
--       * trigger `touch_encounter_loot_drafts_updated_at` (BEFORE UPDATE).
--       * RLS: select for members; no write policy (writes go через admin
--         client в server actions, gated DM-only).
--
-- Catalog filter — НЕ часть миграции. mirror-ноды отфильтровываются
-- из sidebar/catalog/typeaheads на уровне SQL-запросов в коде
-- (T025–T027). Plan: explicit per-call filter `node_types.slug != 'encounter'`,
-- без центрального helper'а.
--
-- Forward-compat:
--   * lines.kind ∈ {'coin', 'item'} — open enum в коде, без CHECK.
--     Spec-018 при необходимости добавит другие kind'ы (XP, milestone,
--     reputation) без миграции.
--   * encounter_loot_drafts.day_in_loop хранится top-level (per-draft,
--     не per-line) — encounter happens once per (loop, day). Per-line
--     override может появиться в future spec без breaking change'а.
--
-- ⚠️ Идемпотентна частично:
--   * Section 1 (node_types seed): on conflict do update.
--   * Section 5 (триггеры): drop trigger if exists + create.
--   * Section 6 (новая таблица): create table if not exists.
--   * Sections 2–4 (alter encounters): rerun на уже мигрированной
--     схеме упадёт (column already exists / constraint already exists).
--     Это OK — миграция применяется один раз на прод. Для локального
--     dev: `npx supabase db reset` пересоздаёт всё с нуля.
--
-- Rollback:
--   begin;
--     drop trigger if exists trg_encounter_loot_drafts_updated_at on encounter_loot_drafts;
--     drop function if exists touch_encounter_loot_drafts_updated_at();
--     drop table if exists encounter_loot_drafts;
--
--     drop trigger if exists trg_encounter_delete_mirror on encounters;
--     drop trigger if exists trg_encounter_sync_title on encounters;
--     drop trigger if exists trg_encounter_create_mirror on encounters;
--     drop function if exists delete_encounter_mirror_node();
--     drop function if exists sync_encounter_title_to_mirror();
--     drop function if exists create_encounter_mirror_node();
--
--     alter table encounters drop constraint if exists encounters_node_id_fkey;
--     drop index if exists idx_encounters_node_id;
--     -- Удалить mirror-ноды до того как ронять колонку (FK был с RESTRICT,
--     -- так что нужно удалять явно).
--     delete from nodes where type_id in (
--       select id from node_types where slug = 'encounter'
--     );
--     alter table encounters drop column if exists node_id;
--
--     delete from node_types where slug = 'encounter';
--   commit;

begin;

-- ─────────────────────────── 1. node_types seed ───────────────────────────
-- One 'encounter' node_type per campaign. Pattern matches 035 stash seed.
-- Idempotent: rerun обновит label/icon, новые campaigns подхватятся.

insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
select
  c.id,
  'encounter',
  'Энкаунтер',
  '⚔️',
  '{}'::jsonb,
  60
from campaigns c
on conflict (campaign_id, slug) do update
  set label = excluded.label,
      icon  = excluded.icon;

-- ─────────────────────────── 2. encounters.node_id column ───────────────────────────

alter table encounters add column if not exists node_id uuid;

-- ─────────────────────────── 3. backfill mirror nodes ───────────────────────────
-- T001 confirmed: 0 duplicates по (campaign_id, title) в проде → straight
-- CTE matching работает однозначно. Если бы были дубли, тут шёл бы вариант
-- с row_number() partition.

with new_mirrors as (
  insert into nodes (campaign_id, type_id, title, fields)
  select
    e.campaign_id,
    (select id from node_types nt
     where nt.campaign_id = e.campaign_id and nt.slug = 'encounter'),
    e.title,
    '{}'::jsonb
  from encounters e
  where e.node_id is null
  returning id, campaign_id, title
)
update encounters e
set node_id = nm.id
from new_mirrors nm
where e.node_id is null
  and nm.campaign_id = e.campaign_id
  and nm.title = e.title;

-- ─────────────────────────── 3a. defensive verify ───────────────────────────

do $$
declare v_orphan_count int;
begin
  select count(*) into v_orphan_count from encounters where node_id is null;
  if v_orphan_count > 0 then
    raise exception 'Migration 039 failed: % encounter(s) without node_id after backfill',
      v_orphan_count;
  end if;
end $$;

-- ─────────────────────────── 4. NOT NULL + FK + unique index ───────────────────────────

alter table encounters
  alter column node_id set not null;

alter table encounters
  add constraint encounters_node_id_fkey
    foreign key (node_id) references nodes(id) on delete restrict;

create unique index if not exists idx_encounters_node_id on encounters(node_id);

-- ─────────────────────────── 5. encounter↔mirror triggers ───────────────────────────

-- 5a. BEFORE INSERT: create mirror node + capture id into new.node_id.
create or replace function create_encounter_mirror_node()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type_id uuid;
  v_node_id uuid;
begin
  -- Resolve campaign's 'encounter' node_type.
  select id into v_type_id
  from node_types
  where campaign_id = new.campaign_id and slug = 'encounter';

  -- Defence: lazy-seed if migration somehow missed this campaign
  -- (e.g. a campaign created between migration apply and code deploy).
  if v_type_id is null then
    insert into node_types (campaign_id, slug, label, icon, default_fields, sort_order)
    values (new.campaign_id, 'encounter', 'Энкаунтер', '⚔️', '{}'::jsonb, 60)
    returning id into v_type_id;
  end if;

  -- Create mirror node.
  insert into nodes (campaign_id, type_id, title, fields)
  values (new.campaign_id, v_type_id, new.title, '{}'::jsonb)
  returning id into v_node_id;

  new.node_id := v_node_id;
  return new;
end;
$$;

drop trigger if exists trg_encounter_create_mirror on encounters;
create trigger trg_encounter_create_mirror
  before insert on encounters
  for each row
  execute function create_encounter_mirror_node();

-- 5b. AFTER UPDATE OF title: keep mirror title in sync.
create or replace function sync_encounter_title_to_mirror()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title then
    update nodes set title = new.title where id = new.node_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_encounter_sync_title on encounters;
create trigger trg_encounter_sync_title
  after update of title on encounters
  for each row
  execute function sync_encounter_title_to_mirror();

-- 5c. AFTER DELETE: drop mirror node.
-- FK (encounters.node_id → nodes.id) is ON DELETE RESTRICT, but by the
-- time AFTER DELETE на encounters fires, the encounter row is gone and
-- nothing references the mirror anymore — safe to delete.
create or replace function delete_encounter_mirror_node()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from nodes where id = old.node_id;
  return old;
end;
$$;

drop trigger if exists trg_encounter_delete_mirror on encounters;
create trigger trg_encounter_delete_mirror
  after delete on encounters
  for each row
  execute function delete_encounter_mirror_node();

-- ─────────────────────────── 6. encounter_loot_drafts ───────────────────────────

create table if not exists encounter_loot_drafts (
  encounter_id  uuid primary key
                references encounters(id) on delete cascade,
  lines         jsonb not null default '[]'::jsonb,
  loop_number   int,
  day_in_loop   int check (day_in_loop is null or (day_in_loop between 1 and 30)),
  updated_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- PK уже создаёт unique index, дополнительный idx избыточен.
-- Plan.md упоминает `idx_loot_drafts_encounter`, но он бы дублировал PK.
-- Оставляем только PK — query patterns читают по encounter_id.

-- updated_at trigger.
create or replace function touch_encounter_loot_drafts_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_encounter_loot_drafts_updated_at on encounter_loot_drafts;
create trigger trg_encounter_loot_drafts_updated_at
  before update on encounter_loot_drafts
  for each row
  execute function touch_encounter_loot_drafts_updated_at();

-- RLS: members of the campaign can read; writes go через admin client
-- в server actions (DM-gated в коде). The table itself has no
-- INSERT/UPDATE/DELETE policy — RLS is read-only safety net.
alter table encounter_loot_drafts enable row level security;

drop policy if exists eld_select on encounter_loot_drafts;
create policy eld_select on encounter_loot_drafts
  for select to authenticated
  using (
    is_member(
      (select campaign_id from encounters
       where id = encounter_loot_drafts.encounter_id)
    )
  );

commit;
