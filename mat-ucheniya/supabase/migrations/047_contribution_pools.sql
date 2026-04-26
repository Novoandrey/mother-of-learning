-- Миграция 047: Складчина / Real-money chip-in (spec-017).
--
-- Sidecar к in-game ledger (spec-010/011): не трогает
-- transactions, nodes, петли, сессии. Делит с остальным
-- приложением только Supabase auth, campaign_members,
-- campaigns, и хелперы is_member() / is_dm_or_owner() из
-- миграции 024.
--
-- Делает четыре вещи:
--   (1) Создаёт contribution_pools — header pool'а: campaign,
--       автор (created_by → auth.users), title, payment_hint
--       (свободный текст реквизитов), total. Поддерживает
--       soft-delete через deleted_at.
--   (2) Создаёт contribution_participants — строки участников.
--       user_id nullable: NULL = ad-hoc free-text участник
--       (не member кампании). display_name всегда populated:
--       снимок для linked, raw для ad-hoc. paid_at nullable:
--       NULL = не сдал.
--   (3) Создаёт два триггера: set_contribution_pool_updated_at
--       (BEFORE UPDATE on pool — стандартный updated_at bump);
--       bump_contribution_pool_updated_at (AFTER mutate on
--       participants — поднимает pool.updated_at чтобы list
--       view сортировался по «последней активности» когда
--       автор тыкает чекбоксы).
--   (4) Включает RLS на обеих таблицах. SELECT — для всех
--       member'ов кампании (через is_member). INSERT pool —
--       любому member'у кампании, при условии created_by =
--       auth.uid(). UPDATE pool — автору или DM/owner. DELETE
--       pool — default-deny (полиси не создаётся): soft-delete
--       only через UPDATE deleted_at. Participants
--       SELECT/INSERT/UPDATE/DELETE — автору родительского pool
--       или DM/owner (mutate policy через FOR ALL).
--
-- Архивность pool'а — DERIVED, не stored. Pool «архивный» когда
-- (deleted_at IS NOT NULL) OR (every participant has paid_at IS
-- NOT NULL). Никаких status enum'ов, никаких triggers поверх
-- архивации — list view фильтрует SQL-стороной через подзапрос.
--
-- ⚠️ Полностью additive и идемпотентна: CREATE TABLE IF NOT
-- EXISTS, CREATE INDEX IF NOT EXISTS, OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS перед CREATE TRIGGER, DROP POLICY IF
-- EXISTS перед CREATE POLICY. Можно прогонять повторно без
-- ущерба.
--
-- Rollback (manual):
--   drop policy if exists contribution_participants_mutate
--     on contribution_participants;
--   drop policy if exists contribution_participants_select
--     on contribution_participants;
--   drop policy if exists contribution_pools_update
--     on contribution_pools;
--   drop policy if exists contribution_pools_insert
--     on contribution_pools;
--   drop policy if exists contribution_pools_select
--     on contribution_pools;
--   drop trigger if exists trg_contribution_participants_bump_pool
--     on contribution_participants;
--   drop trigger if exists trg_contribution_pools_updated_at
--     on contribution_pools;
--   drop function if exists bump_contribution_pool_updated_at();
--   drop function if exists set_contribution_pool_updated_at();
--   drop table if exists contribution_participants;
--   drop table if exists contribution_pools;

-- ============================================================================
-- (1) Header table: contribution_pools
-- ============================================================================

create table if not exists contribution_pools (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references campaigns(id) on delete cascade,
  created_by uuid not null
    references auth.users(id),
  title text not null
    check (char_length(title) between 1 and 100),
  payment_hint text
    check (payment_hint is null or char_length(payment_hint) <= 200),
  total numeric(12, 2) not null
    check (total > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_contribution_pools_campaign
  on contribution_pools (campaign_id, updated_at desc);

comment on table contribution_pools is
  'Spec-017 Складчина — real-money chip-in pool. Sidecar to
   the in-game ledger (spec-010/011); does not touch
   transactions. Archived = derived: (deleted_at IS NOT NULL)
   OR (every participant has paid_at IS NOT NULL).';

comment on column contribution_pools.payment_hint is
  'Free-text реквизиты — телефон, IBAN, "мой", "наличкой"
   и т.п. Никакой валидации, max 200 chars.';

-- ============================================================================
-- (2) Rows table: contribution_participants
-- ============================================================================

create table if not exists contribution_participants (
  id uuid primary key default gen_random_uuid(),
  pool_id uuid not null
    references contribution_pools(id) on delete cascade,
  user_id uuid
    references auth.users(id) on delete set null,
  display_name text not null
    check (char_length(display_name) between 1 and 100),
  share numeric(12, 2) not null
    check (share >= 0),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_contribution_participants_pool
  on contribution_participants (pool_id);

create index if not exists idx_contribution_participants_user
  on contribution_participants (user_id)
  where user_id is not null;

comment on table contribution_participants is
  'Per-participant rows for a contribution pool. user_id NULL
   = ad-hoc (free-text name, не member кампании).
   display_name always populated: snapshot for linked rows,
   raw for ad-hoc — display не ломается если member выйдет
   из кампании.';

-- ============================================================================
-- (3) Triggers
-- ============================================================================

-- BEFORE UPDATE on pool — стандартный updated_at bump.
create or replace function set_contribution_pool_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_contribution_pools_updated_at
  on contribution_pools;

create trigger trg_contribution_pools_updated_at
  before update on contribution_pools
  for each row execute function set_contribution_pool_updated_at();

-- AFTER mutate on participants — поднимает pool.updated_at,
-- чтобы list-view сортировался по «последней активности»
-- когда автор тыкает чекбоксы.
create or replace function bump_contribution_pool_updated_at()
returns trigger
language plpgsql
as $$
begin
  update contribution_pools
     set updated_at = now()
   where id = coalesce(new.pool_id, old.pool_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_contribution_participants_bump_pool
  on contribution_participants;

create trigger trg_contribution_participants_bump_pool
  after insert or update or delete on contribution_participants
  for each row execute function bump_contribution_pool_updated_at();

-- ============================================================================
-- (4) RLS
-- ============================================================================

alter table contribution_pools enable row level security;
alter table contribution_participants enable row level security;

-- ----- Pools -----

-- SELECT — любому member'у кампании.
drop policy if exists contribution_pools_select on contribution_pools;
create policy contribution_pools_select on contribution_pools
  for select using (is_member(campaign_id));

-- INSERT — любому member'у кампании, обязательно self-author.
drop policy if exists contribution_pools_insert on contribution_pools;
create policy contribution_pools_insert on contribution_pools
  for insert with check (
    is_member(campaign_id) and created_by = auth.uid()
  );

-- UPDATE — автору или DM/owner. Soft-delete = UPDATE deleted_at.
drop policy if exists contribution_pools_update on contribution_pools;
create policy contribution_pools_update on contribution_pools
  for update using (
    created_by = auth.uid() or is_dm_or_owner(campaign_id)
  ) with check (
    created_by = auth.uid() or is_dm_or_owner(campaign_id)
  );

-- DELETE — НИКАКОЙ полиси, default-deny. Hard delete отсутствует
-- в коде; soft-delete only через UPDATE deleted_at = now().

-- ----- Participants -----

-- SELECT — любому member'у кампании родительского pool'а.
drop policy if exists contribution_participants_select on contribution_participants;
create policy contribution_participants_select on contribution_participants
  for select using (
    exists (
      select 1 from contribution_pools p
       where p.id = contribution_participants.pool_id
         and is_member(p.campaign_id)
    )
  );

-- INSERT/UPDATE/DELETE — автору родительского pool'а или
-- DM/owner кампании (FOR ALL объединяет три mutation'а одной
-- полиси).
drop policy if exists contribution_participants_mutate on contribution_participants;
create policy contribution_participants_mutate on contribution_participants
  for all using (
    exists (
      select 1 from contribution_pools p
       where p.id = contribution_participants.pool_id
         and (p.created_by = auth.uid() or is_dm_or_owner(p.campaign_id))
    )
  ) with check (
    exists (
      select 1 from contribution_pools p
       where p.id = contribution_participants.pool_id
         and (p.created_by = auth.uid() or is_dm_or_owner(p.campaign_id))
    )
  );

-- ============================================================================
-- Smoke checks (выполнить вручную после применения)
-- ============================================================================
--
-- 1. Таблицы созданы:
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('contribution_pools', 'contribution_participants');
--   -- Ожидается: 2 строки.
--
-- 2. RLS включён:
--   select tablename, rowsecurity from pg_tables
--    where tablename in ('contribution_pools', 'contribution_participants');
--   -- Ожидается: rowsecurity = true для обеих.
--
-- 3. Полиси на месте:
--   select schemaname, tablename, policyname, cmd
--     from pg_policies
--    where tablename in ('contribution_pools', 'contribution_participants')
--    order by tablename, policyname;
--   -- Ожидается: 5 строк (3 на pools: select/insert/update;
--   --             2 на participants: select + mutate FOR ALL).
--
-- 4. Триггеры на месте:
--   select trigger_name, event_manipulation, event_object_table
--     from information_schema.triggers
--    where event_object_table in ('contribution_pools', 'contribution_participants')
--    order by event_object_table, trigger_name;
--   -- Ожидается:
--   --   trg_contribution_pools_updated_at | UPDATE | contribution_pools
--   --   trg_contribution_participants_bump_pool | INSERT/UPDATE/DELETE
--   --     | contribution_participants (3 строки — по одной на event)
--
-- 5. RLS smoke (вручную через psql/Studio с выставленным auth):
--   -- Как member кампании:
--   --   insert into contribution_pools (campaign_id, created_by, title, total)
--   --   values ('<campaign-id>', auth.uid(), 'Тест', 100);  -- ok
--   --   select count(*) from contribution_pools where campaign_id = '<campaign-id>';
--   --   -- > 0
--   -- Как outsider:
--   --   select count(*) from contribution_pools where campaign_id = '<campaign-id>';
--   --   -- 0
--   -- Как другой member (не автор):
--   --   update contribution_pools set title = 'X' where id = '<pool-id>';
--   --   -- 0 rows affected (RLS blocks)
--   -- Как DM:
--   --   update contribution_pools set title = 'X' where id = '<pool-id>';
--   --   -- 1 row affected
--   -- DELETE как любой:
--   --   delete from contribution_pools where id = '<pool-id>';
--   --   -- 0 rows affected (default-deny)
