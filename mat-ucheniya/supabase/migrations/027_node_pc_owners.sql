-- Миграция 027: Many-to-many PC ownership.
--
-- Заменяет single-owner (nodes.owner_user_id) на таблицу node_pc_owners.
-- Причина: у PC может быть несколько владельцев.
--   - «Общий» персонаж (Зак) — любой, кто читал книгу, может играть.
--   - Одолженный персонаж — Миша даёт Варваре на сессию поиграть за своего.
--
-- Migration plan:
-- 1. Создать node_pc_owners с RLS.
-- 2. Перенести существующие owner_user_id в node_pc_owners.
-- 3. Удалить nodes.owner_user_id (после того, как весь код перешёл на
--    новую таблицу — этот шаг идёт в той же миграции, поскольку код и
--    миграция деплоятся вместе).

-- ─────────────────────────── Table ───────────────────────────

create table if not exists node_pc_owners (
  node_id uuid not null references nodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (node_id, user_id)
);

comment on table node_pc_owners is
  'Many-to-many ownership of PC-nodes. A character-node may be owned by
   any number of users (for shared PCs like Zak, or temporary loans for
   a single session). Managed by DM/owner only (see RLS below).';

create index if not exists idx_node_pc_owners_user on node_pc_owners (user_id);
create index if not exists idx_node_pc_owners_node on node_pc_owners (node_id);

-- ─────────────────────────── Data migration ───────────────────────────

-- Перенести существующие owner_user_id в новую таблицу.
-- ON CONFLICT DO NOTHING — на случай повторного запуска миграции.
insert into node_pc_owners (node_id, user_id, created_at)
select id, owner_user_id, coalesce(updated_at, now())
from nodes
where owner_user_id is not null
on conflict (node_id, user_id) do nothing;

-- ─────────────────────────── Drop old column ───────────────────────────

-- Безопасно удаляем старую колонку. Проверка на существование — чтобы
-- миграция была идемпотентной.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'nodes'
      and column_name = 'owner_user_id'
  ) then
    alter table nodes drop column owner_user_id;
  end if;
end$$;

-- ─────────────────────────── RLS ───────────────────────────

alter table node_pc_owners enable row level security;

-- SELECT: members of the campaign (through the node) see all ownership rows.
-- Игрок видит владельцев PC, чтобы понимать, с кем делит контроль.
drop policy if exists node_pc_owners_select on node_pc_owners;
create policy node_pc_owners_select on node_pc_owners
  for select to authenticated
  using (
    exists (
      select 1 from nodes n
      where n.id = node_pc_owners.node_id
        and is_member(n.campaign_id)
    )
  );

-- MODIFY: owner/dm only. Only the DM/owner assigns or revokes PC ownership.
drop policy if exists node_pc_owners_modify on node_pc_owners;
create policy node_pc_owners_modify on node_pc_owners
  for all to authenticated
  using (
    exists (
      select 1 from nodes n
      where n.id = node_pc_owners.node_id
        and is_dm_or_owner(n.campaign_id)
    )
  )
  with check (
    exists (
      select 1 from nodes n
      where n.id = node_pc_owners.node_id
        and is_dm_or_owner(n.campaign_id)
    )
  );
