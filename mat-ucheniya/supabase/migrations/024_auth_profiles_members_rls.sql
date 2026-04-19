-- 024_auth_profiles_members_rls.sql
-- Мать Учения: Authentication, roles, and Row Level Security.
-- Вводит user_profiles, campaign_members, nodes.owner_user_id.
-- Включает RLS на всех существующих таблицах.
-- Spec: 006-auth-and-roles (Инкремент 1).
--
-- ⚠️ ПОСЛЕ ПРИМЕНЕНИЯ этой миграции анонимный доступ ОТКЛЮЧАЕТСЯ.
-- Немедленно после apply нужно запустить scripts/seed-owner.ts,
-- иначе никто не сможет зайти в приложение.

-- ============================================================================
-- Tables
-- ============================================================================

create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login text unique not null check (login ~ '^[a-z0-9_-]{3,32}$'),
  display_name text,
  must_change_password boolean not null default true,
  created_at timestamptz default now()
);

create index idx_user_profiles_login on user_profiles (login);

comment on table user_profiles is
  'Per-user profile keyed to auth.users. Holds the human-readable login and
   the force-change-password flag. The synthetic email in auth.users is
   built as {login}@mol.local and is never shown in the UI.';

create table campaign_members (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'dm', 'player')),
  created_at timestamptz default now(),
  unique (campaign_id, user_id)
);

create index idx_campaign_members_user on campaign_members (user_id);
create index idx_campaign_members_campaign on campaign_members (campaign_id);

-- Enforce exactly one owner per campaign.
create unique index idx_campaign_members_one_owner
  on campaign_members (campaign_id)
  where role = 'owner';

comment on table campaign_members is
  'Membership and role of a user in a campaign. One user may be in multiple
   campaigns with different roles. Exactly one owner per campaign.';

-- PC ownership on nodes
alter table nodes
  add column owner_user_id uuid references auth.users(id) on delete set null;

comment on column nodes.owner_user_id is
  'The player who owns this PC. Only meaningful for nodes whose type is
   character. Nullable: NPCs never have an owner; unassigned PCs are null.';

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

-- Lock down EXECUTE: only authenticated users call these.
revoke all on function is_member(uuid) from public;
revoke all on function is_dm_or_owner(uuid) from public;
revoke all on function is_owner(uuid) from public;
grant execute on function is_member(uuid) to authenticated;
grant execute on function is_dm_or_owner(uuid) to authenticated;
grant execute on function is_owner(uuid) to authenticated;

-- ============================================================================
-- RLS: Enable on all tables
-- ============================================================================

alter table campaigns enable row level security;
alter table node_types enable row level security;
alter table edge_types enable row level security;
alter table nodes enable row level security;
alter table edges enable row level security;
alter table encounters enable row level security;
alter table encounter_participants enable row level security;
alter table encounter_templates enable row level security;
alter table encounter_template_participants enable row level security;
alter table encounter_log enable row level security;
alter table encounter_events enable row level security;
alter table loops enable row level security;
alter table chronicles enable row level security;
alter table party enable row level security;
alter table party_members enable row level security;
alter table sessions enable row level security;
alter table user_profiles enable row level security;
alter table campaign_members enable row level security;

-- ============================================================================
-- Policies
-- ============================================================================

-- --- campaigns ---
create policy campaigns_select on campaigns
  for select to authenticated
  using (is_member(id));

-- No INSERT/UPDATE/DELETE policies: campaigns are managed only by migrations
-- or service role (which bypasses RLS). This locks down campaign creation.

-- --- campaign_members ---
create policy campaign_members_select on campaign_members
  for select to authenticated
  using (is_member(campaign_id));

create policy campaign_members_modify on campaign_members
  for all to authenticated
  using (is_owner(campaign_id))
  with check (is_owner(campaign_id));

-- --- user_profiles ---
-- A user can see: self, and anyone who shares at least one campaign with them.
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

create policy user_profiles_update_self on user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No INSERT/DELETE: profiles are managed via service role during account
-- creation/deletion in Server Actions.

-- --- node_types ---
create policy node_types_select on node_types
  for select to authenticated
  using (is_member(campaign_id));

create policy node_types_modify on node_types
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- edge_types ---
-- Base types have campaign_id = null and are readable by any authenticated.
create policy edge_types_select on edge_types
  for select to authenticated
  using (campaign_id is null or is_member(campaign_id));

create policy edge_types_modify on edge_types
  for all to authenticated
  using (campaign_id is not null and is_dm_or_owner(campaign_id))
  with check (campaign_id is not null and is_dm_or_owner(campaign_id));

-- --- nodes ---
create policy nodes_select on nodes
  for select to authenticated
  using (is_member(campaign_id));

create policy nodes_modify on nodes
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- Note: PC ownership edge case (player editing own PC) is deferred to
-- Incremental step 4. Current policy: only owner/dm can modify nodes.

-- --- edges ---
create policy edges_select on edges
  for select to authenticated
  using (is_member(campaign_id));

create policy edges_modify on edges
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- encounters ---
create policy encounters_select on encounters
  for select to authenticated
  using (is_member(campaign_id));

create policy encounters_modify on encounters
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- encounter_participants (no campaign_id: join via encounters) ---
create policy encounter_participants_select on encounter_participants
  for select to authenticated
  using (
    exists(
      select 1 from encounters e
      where e.id = encounter_participants.encounter_id
        and is_member(e.campaign_id)
    )
  );

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
create policy encounter_templates_select on encounter_templates
  for select to authenticated
  using (is_member(campaign_id));

create policy encounter_templates_modify on encounter_templates
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- encounter_template_participants (join via encounter_templates) ---
create policy encounter_template_participants_select on encounter_template_participants
  for select to authenticated
  using (
    exists(
      select 1 from encounter_templates t
      where t.id = encounter_template_participants.template_id
        and is_member(t.campaign_id)
    )
  );

create policy encounter_template_participants_modify on encounter_template_participants
  for all to authenticated
  using (
    exists(
      select 1 from encounter_templates t
      where t.id = encounter_template_participants.template_id
        and is_dm_or_owner(t.campaign_id)
    )
  )
  with check (
    exists(
      select 1 from encounter_templates t
      where t.id = encounter_template_participants.template_id
        and is_dm_or_owner(t.campaign_id)
    )
  );

-- --- encounter_log ---
create policy encounter_log_select on encounter_log
  for select to authenticated
  using (
    exists(
      select 1 from encounters e
      where e.id = encounter_log.encounter_id
        and is_member(e.campaign_id)
    )
  );

create policy encounter_log_modify on encounter_log
  for all to authenticated
  using (
    exists(
      select 1 from encounters e
      where e.id = encounter_log.encounter_id
        and is_dm_or_owner(e.campaign_id)
    )
  )
  with check (
    exists(
      select 1 from encounters e
      where e.id = encounter_log.encounter_id
        and is_dm_or_owner(e.campaign_id)
    )
  );

-- --- encounter_events ---
create policy encounter_events_select on encounter_events
  for select to authenticated
  using (
    exists(
      select 1 from encounters e
      where e.id = encounter_events.encounter_id
        and is_member(e.campaign_id)
    )
  );

create policy encounter_events_modify on encounter_events
  for all to authenticated
  using (
    exists(
      select 1 from encounters e
      where e.id = encounter_events.encounter_id
        and is_dm_or_owner(e.campaign_id)
    )
  )
  with check (
    exists(
      select 1 from encounters e
      where e.id = encounter_events.encounter_id
        and is_dm_or_owner(e.campaign_id)
    )
  );

-- --- loops (legacy; some rows may still exist) ---
create policy loops_select on loops
  for select to authenticated
  using (is_member(campaign_id));

create policy loops_modify on loops
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- chronicles ---
create policy chronicles_select on chronicles
  for select to authenticated
  using (is_member(campaign_id));

create policy chronicles_modify on chronicles
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- party (legacy) ---
create policy party_select on party
  for select to authenticated
  using (is_member(campaign_id));

create policy party_modify on party
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

-- --- party_members (join via party) ---
create policy party_members_select on party_members
  for select to authenticated
  using (
    exists(
      select 1 from party p
      where p.id = party_members.party_id
        and is_member(p.campaign_id)
    )
  );

create policy party_members_modify on party_members
  for all to authenticated
  using (
    exists(
      select 1 from party p
      where p.id = party_members.party_id
        and is_dm_or_owner(p.campaign_id)
    )
  )
  with check (
    exists(
      select 1 from party p
      where p.id = party_members.party_id
        and is_dm_or_owner(p.campaign_id)
    )
  );

-- --- sessions ---
create policy sessions_select on sessions
  for select to authenticated
  using (is_member(campaign_id));

create policy sessions_modify on sessions
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));
