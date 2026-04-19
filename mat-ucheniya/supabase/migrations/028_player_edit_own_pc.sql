-- Миграция 028: Player edit rights — limited to their own PCs.
--
-- Игрок может:
--   - читать всё в своей кампании (как и раньше, через is_member);
--   - UPDATE только character-нод, где он в node_pc_owners;
--   - UPDATE связей (edges), где source или target — его PC;
--   - INSERT/UPDATE/DELETE хроник (chronicles), где node_id — его PC.
--
-- Игрок НЕ может:
--   - INSERT/DELETE ноды (создание/удаление — только owner/dm);
--   - Менять ноды, которыми не владеет;
--   - Менять campaign-wide хроники (node_id IS NULL);
--   - Создавать связи между чужими нодами.
--
-- Все owner/dm-разрешения сохраняются.

-- ─────────────────────────── Helper ───────────────────────────

-- Можно ли текущему пользователю редактировать эту ноду?
-- true, если он owner/dm кампании ИЛИ он player и состоит в node_pc_owners
-- character-ноды.
create or replace function can_edit_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from nodes n
    where n.id = p_node_id
      and (
        -- Менеджеры: полные права.
        is_dm_or_owner(n.campaign_id)
        or (
          -- Игроки: только свои PC.
          exists (
            select 1
            from node_pc_owners npo
            where npo.node_id = n.id
              and npo.user_id = auth.uid()
          )
          and exists (
            select 1
            from node_types t
            where t.id = n.type_id
              and t.slug = 'character'
          )
        )
      )
  )
$$;

comment on function can_edit_node(uuid) is
  'True if auth.uid() can edit the given node. Used by RLS on nodes, edges,
   and chronicles.';

-- ─────────────────────────── Nodes ───────────────────────────
-- Раздельные политики для UPDATE и INSERT/DELETE: UPDATE шире
-- (включает игроков со своими PC), а создание/удаление — только менеджеры.

alter table nodes enable row level security;

drop policy if exists nodes_modify on nodes;
drop policy if exists nodes_update on nodes;
drop policy if exists nodes_insert on nodes;
drop policy if exists nodes_delete on nodes;

create policy nodes_update on nodes
  for update to authenticated
  using (can_edit_node(id))
  with check (can_edit_node(id));

create policy nodes_insert on nodes
  for insert to authenticated
  with check (is_dm_or_owner(campaign_id));

create policy nodes_delete on nodes
  for delete to authenticated
  using (is_dm_or_owner(campaign_id));

-- ─────────────────────────── Edges ───────────────────────────
-- Игрок может создавать/удалять связи, если он управляет хотя бы одной из
-- двух связанных нод (source ИЛИ target — его PC). Менеджеры — как раньше.

alter table edges enable row level security;

drop policy if exists edges_modify on edges;
drop policy if exists edges_update on edges;
drop policy if exists edges_insert on edges;
drop policy if exists edges_delete on edges;

create policy edges_update on edges
  for update to authenticated
  using (
    is_dm_or_owner(campaign_id)
    or can_edit_node(source_id)
    or can_edit_node(target_id)
  )
  with check (
    is_dm_or_owner(campaign_id)
    or can_edit_node(source_id)
    or can_edit_node(target_id)
  );

create policy edges_insert on edges
  for insert to authenticated
  with check (
    is_dm_or_owner(campaign_id)
    or can_edit_node(source_id)
    or can_edit_node(target_id)
  );

create policy edges_delete on edges
  for delete to authenticated
  using (
    is_dm_or_owner(campaign_id)
    or can_edit_node(source_id)
    or can_edit_node(target_id)
  );

-- ─────────────────────────── Chronicles ───────────────────────────
-- Игрок правит хроники только своих PC. Campaign-wide (node_id IS NULL)
-- и чужие — только менеджеры.

do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='chronicles') then
    execute 'alter table chronicles enable row level security';

    execute 'drop policy if exists chronicles_modify on chronicles';
    execute 'drop policy if exists chronicles_update on chronicles';
    execute 'drop policy if exists chronicles_insert on chronicles';
    execute 'drop policy if exists chronicles_delete on chronicles';

    execute 'create policy chronicles_update on chronicles '
         || 'for update to authenticated '
         || 'using ( '
         || '  is_dm_or_owner(campaign_id) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ') '
         || 'with check ( '
         || '  is_dm_or_owner(campaign_id) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ')';

    execute 'create policy chronicles_insert on chronicles '
         || 'for insert to authenticated '
         || 'with check ( '
         || '  is_dm_or_owner(campaign_id) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ')';

    execute 'create policy chronicles_delete on chronicles '
         || 'for delete to authenticated '
         || 'using ( '
         || '  is_dm_or_owner(campaign_id) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ')';
  end if;
end $$;
