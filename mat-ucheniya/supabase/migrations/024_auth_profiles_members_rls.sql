-- 024_auth_profiles_members_rls.sql
-- Мать Учения: Authentication, roles, and Row Level Security.
-- Вводит user_profiles, campaign_members, nodes.owner_user_id.
-- Включает RLS на всех существующих таблицах.
-- Spec: 006-auth-and-roles (Инкремент 1).
--
-- ⚠️ ПОСЛЕ ПРИМЕНЕНИЯ этой миграции анонимный доступ ОТКЛЮЧАЕТСЯ.
-- Немедленно после apply нужно запустить scripts/seed-owner.ts.
--
-- ✅ Миграция идемпотентная — безопасно запускать повторно.
-- ✅ Опциональные legacy таблицы (loops, chronicles, party, ...)
--    обрабатываются условно через DO-блоки: если таблицы нет, её
--    секция тихо пропускается.

-- ============================================================================
-- Tables (new)
-- ============================================================================

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login text unique not null check (login ~ '^[a-z0-9_-]{3,32}$'),
  display_name text,
  must_change_password boolean not null default true,
  created_at timestamptz default now()
);

create index if not exists idx_user_profiles_login on user_profiles (login);

comment on table user_profiles is
  'Per-user profile keyed to auth.users. Holds the human-readable login and
   the force-change-password flag. The synthetic email in auth.users is
   built as {login}@mol.local and is never shown in the UI.';

create table if not exists campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'dm', 'player')),
  created_at timestamptz default now(),
  unique (campaign_id, user_id)
);

create index if not exists idx_campaign_members_user on campaign_members (user_id);
create index if not exists idx_campaign_members_campaign on campaign_members (campaign_id);

-- Enforce exactly one owner per campaign.
create unique index if not exists idx_campaign_members_one_owner
  on campaign_members (campaign_id)
  where role = 'owner';

comment on table campaign_members is
  'Membership and role of a user in a campaign. One user may be in multiple
   campaigns with different roles. Exactly one owner per campaign.';

-- PC ownership on nodes — добавляется условно на случай повторного запуска.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'nodes' and column_name = 'owner_user_id'
  ) then
    alter table nodes
      add column owner_user_id uuid references auth.users(id) on delete set null;
    comment on column nodes.owner_user_id is
      'The player who owns this PC. Only meaningful for nodes whose type is
       character. Nullable: NPCs never have an owner; unassigned PCs are null.';
  end if;
end $$;

-- ============================================================================
-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================================

create or replace function is_member(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
  )
$$;

create or replace function is_dm_or_owner(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role in ('owner', 'dm')
  )
$$;

create or replace function is_owner(p_campaign_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from campaign_members
    where campaign_id = p_campaign_id
      and user_id = auth.uid()
      and role = 'owner'
  )
$$;

revoke all on function is_member(uuid) from public;
revoke all on function is_dm_or_owner(uuid) from public;
revoke all on function is_owner(uuid) from public;
grant execute on function is_member(uuid) to authenticated;
grant execute on function is_dm_or_owner(uuid) to authenticated;
grant execute on function is_owner(uuid) to authenticated;

-- ============================================================================
-- RLS: ENABLE + policies
--
-- Core tables (known to exist): enabled unconditionally.
-- Legacy / optional tables: wrapped in DO blocks that check pg_tables.
-- All `create policy` preceded by `drop policy if exists` so the whole
-- migration is idempotent.
-- ============================================================================

-- --- campaigns ---
alter table campaigns enable row level security;
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns
  for select to authenticated
  using (is_member(id));

-- --- campaign_members ---
alter table campaign_members enable row level security;
drop policy if exists campaign_members_select on campaign_members;
create policy campaign_members_select on campaign_members
  for select to authenticated
  using (is_member(campaign_id));

drop policy if exists campaign_members_modify on campaign_members;
create policy campaign_members_modify on campaign_members
  for all to authenticated
  using (is_owner(campaign_id))
  with check (is_owner(campaign_id));

-- --- user_profiles ---
alter table user_profiles enable row level security;
drop policy if exists user_profiles_select on user_profiles;
create policy user_profiles_select on user_profiles
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists(
      select 1
      from campaign_members mine
      join campaign_members theirs on theirs.campaign_id = mine.campaign_id
      where mine.user_id = auth.uid()
        and theirs.user_id = user_profiles.user_id
    )
  );

drop policy if exists user_profiles_update_self on user_profiles;
create policy user_profiles_update_self on user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- --- node_types ---
alter table node_types enable row level security;
drop policy if exists node_types_select on node_types;
create policy node_types_select on node_types
  for select to authenticated
  using (is_member(campaign_id));

drop policy if exists node_types_modify on node_types;
create policy node_types_modify on node_types
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- edge_types ---
alter table edge_types enable row level security;
drop policy if exists edge_types_select on edge_types;
create policy edge_types_select on edge_types
  for select to authenticated
  using (campaign_id is null or is_member(campaign_id));

drop policy if exists edge_types_modify on edge_types;
create policy edge_types_modify on edge_types
  for all to authenticated
  using (campaign_id is not null and is_dm_or_owner(campaign_id))
  with check (campaign_id is not null and is_dm_or_owner(campaign_id));

-- --- nodes ---
alter table nodes enable row level security;
drop policy if exists nodes_select on nodes;
create policy nodes_select on nodes
  for select to authenticated
  using (is_member(campaign_id));

drop policy if exists nodes_modify on nodes;
create policy nodes_modify on nodes
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- edges ---
alter table edges enable row level security;
drop policy if exists edges_select on edges;
create policy edges_select on edges
  for select to authenticated
  using (is_member(campaign_id));

drop policy if exists edges_modify on edges;
create policy edges_modify on edges
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- encounters ---
alter table encounters enable row level security;
drop policy if exists encounters_select on encounters;
create policy encounters_select on encounters
  for select to authenticated
  using (is_member(campaign_id));

drop policy if exists encounters_modify on encounters;
create policy encounters_modify on encounters
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- encounter_participants (join via encounters) ---
alter table encounter_participants enable row level security;
drop policy if exists encounter_participants_select on encounter_participants;
create policy encounter_participants_select on encounter_participants
  for select to authenticated
  using (
    exists(
      select 1 from encounters e
      where e.id = encounter_participants.encounter_id
        and is_member(e.campaign_id)
    )
  );

drop policy if exists encounter_participants_modify on encounter_participants;
create policy encounter_participants_modify on encounter_participants
  for all to authenticated
  using (
    exists(
      select 1 from encounters e
      where e.id = encounter_participants.encounter_id
        and is_dm_or_owner(e.campaign_id)
    )
  )
  with check (
    exists(
      select 1 from encounters e
      where e.id = encounter_participants.encounter_id
        and is_dm_or_owner(e.campaign_id)
    )
  );

-- --- encounter_templates ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='encounter_templates') then
    execute 'alter table encounter_templates enable row level security';
    execute 'drop policy if exists encounter_templates_select on encounter_templates';
    execute 'create policy encounter_templates_select on encounter_templates '
         || 'for select to authenticated using (is_member(campaign_id))';
    execute 'drop policy if exists encounter_templates_modify on encounter_templates';
    execute 'create policy encounter_templates_modify on encounter_templates '
         || 'for all to authenticated '
         || 'using (is_dm_or_owner(campaign_id)) '
         || 'with check (is_dm_or_owner(campaign_id))';
  end if;
end $$;

-- --- encounter_template_participants (join via encounter_templates) ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='encounter_template_participants') then
    execute 'alter table encounter_template_participants enable row level security';
    execute 'drop policy if exists encounter_template_participants_select on encounter_template_participants';
    execute 'create policy encounter_template_participants_select on encounter_template_participants '
         || 'for select to authenticated using ( '
         || '  exists(select 1 from encounter_templates t '
         || '         where t.id = encounter_template_participants.template_id '
         || '         and is_member(t.campaign_id)) '
         || ')';
    execute 'drop policy if exists encounter_template_participants_modify on encounter_template_participants';
    execute 'create policy encounter_template_participants_modify on encounter_template_participants '
         || 'for all to authenticated '
         || 'using ( '
         || '  exists(select 1 from encounter_templates t '
         || '         where t.id = encounter_template_participants.template_id '
         || '         and is_dm_or_owner(t.campaign_id)) '
         || ') '
         || 'with check ( '
         || '  exists(select 1 from encounter_templates t '
         || '         where t.id = encounter_template_participants.template_id '
         || '         and is_dm_or_owner(t.campaign_id)) '
         || ')';
  end if;
end $$;

-- --- encounter_log ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='encounter_log') then
    execute 'alter table encounter_log enable row level security';
    execute 'drop policy if exists encounter_log_select on encounter_log';
    execute 'create policy encounter_log_select on encounter_log '
         || 'for select to authenticated using ( '
         || '  exists(select 1 from encounters e '
         || '         where e.id = encounter_log.encounter_id and is_member(e.campaign_id)) '
         || ')';
    execute 'drop policy if exists encounter_log_modify on encounter_log';
    execute 'create policy encounter_log_modify on encounter_log '
         || 'for all to authenticated '
         || 'using ( '
         || '  exists(select 1 from encounters e '
         || '         where e.id = encounter_log.encounter_id and is_dm_or_owner(e.campaign_id)) '
         || ') '
         || 'with check ( '
         || '  exists(select 1 from encounters e '
         || '         where e.id = encounter_log.encounter_id and is_dm_or_owner(e.campaign_id)) '
         || ')';
  end if;
end $$;

-- --- encounter_events ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='encounter_events') then
    execute 'alter table encounter_events enable row level security';
    execute 'drop policy if exists encounter_events_select on encounter_events';
    execute 'create policy encounter_events_select on encounter_events '
         || 'for select to authenticated using ( '
         || '  exists(select 1 from encounters e '
         || '         where e.id = encounter_events.encounter_id and is_member(e.campaign_id)) '
         || ')';
    execute 'drop policy if exists encounter_events_modify on encounter_events';
    execute 'create policy encounter_events_modify on encounter_events '
         || 'for all to authenticated '
         || 'using ( '
         || '  exists(select 1 from encounters e '
         || '         where e.id = encounter_events.encounter_id and is_dm_or_owner(e.campaign_id)) '
         || ') '
         || 'with check ( '
         || '  exists(select 1 from encounters e '
         || '         where e.id = encounter_events.encounter_id and is_dm_or_owner(e.campaign_id)) '
         || ')';
  end if;
end $$;

-- --- loops (legacy: может быть дропнута в 012) ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='loops') then
    execute 'alter table loops enable row level security';
    execute 'drop policy if exists loops_select on loops';
    execute 'create policy loops_select on loops '
         || 'for select to authenticated using (is_member(campaign_id))';
    execute 'drop policy if exists loops_modify on loops';
    execute 'create policy loops_modify on loops '
         || 'for all to authenticated '
         || 'using (is_dm_or_owner(campaign_id)) '
         || 'with check (is_dm_or_owner(campaign_id))';
  end if;
end $$;

-- --- chronicles ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='chronicles') then
    execute 'alter table chronicles enable row level security';
    execute 'drop policy if exists chronicles_select on chronicles';
    execute 'create policy chronicles_select on chronicles '
         || 'for select to authenticated using (is_member(campaign_id))';
    execute 'drop policy if exists chronicles_modify on chronicles';
    execute 'create policy chronicles_modify on chronicles '
         || 'for all to authenticated '
         || 'using (is_dm_or_owner(campaign_id)) '
         || 'with check (is_dm_or_owner(campaign_id))';
  end if;
end $$;

-- --- party (legacy) ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='party') then
    execute 'alter table party enable row level security';
    execute 'drop policy if exists party_select on party';
    execute 'create policy party_select on party '
         || 'for select to authenticated using (is_member(campaign_id))';
    execute 'drop policy if exists party_modify on party';
    execute 'create policy party_modify on party '
         || 'for all to authenticated '
         || 'using (is_dm_or_owner(campaign_id)) '
         || 'with check (is_dm_or_owner(campaign_id))';
  end if;
end $$;

-- --- party_members (join via party) ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='party_members')
     and exists (select 1 from pg_tables where schemaname='public' and tablename='party') then
    execute 'alter table party_members enable row level security';
    execute 'drop policy if exists party_members_select on party_members';
    execute 'create policy party_members_select on party_members '
         || 'for select to authenticated using ( '
         || '  exists(select 1 from party p '
         || '         where p.id = party_members.party_id and is_member(p.campaign_id)) '
         || ')';
    execute 'drop policy if exists party_members_modify on party_members';
    execute 'create policy party_members_modify on party_members '
         || 'for all to authenticated '
         || 'using ( '
         || '  exists(select 1 from party p '
         || '         where p.id = party_members.party_id and is_dm_or_owner(p.campaign_id)) '
         || ') '
         || 'with check ( '
         || '  exists(select 1 from party p '
         || '         where p.id = party_members.party_id and is_dm_or_owner(p.campaign_id)) '
         || ')';
  end if;
end $$;

-- --- sessions (может быть дропнута в 012) ---
do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='sessions') then
    execute 'alter table sessions enable row level security';
    execute 'drop policy if exists sessions_select on sessions';
    execute 'create policy sessions_select on sessions '
         || 'for select to authenticated using (is_member(campaign_id))';
    execute 'drop policy if exists sessions_modify on sessions';
    execute 'create policy sessions_modify on sessions '
         || 'for all to authenticated '
         || 'using (is_dm_or_owner(campaign_id)) '
         || 'with check (is_dm_or_owner(campaign_id))';
  end if;
end $$;
