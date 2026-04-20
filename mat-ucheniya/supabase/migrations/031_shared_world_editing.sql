-- Миграция 031: Player edit rights — expanded to shared world editing.
--
-- ПРЕДЫДУЩАЯ МОДЕЛЬ (миграция 028) оказалась слишком жёсткой:
-- игрок мог редактировать только СВОЙ PC, и не мог создавать ни одной ноды.
-- На практике кампания совместная: игроки добавляют лор, NPC, заклинания,
-- и ожидают что любой может поправить любую ноду мира.
--
-- НОВАЯ МОДЕЛЬ:
--   - Любой member (включая player) может:
--     - INSERT ноду любого типа;
--     - UPDATE/DELETE любую ноду, КРОМЕ чужих PC;
--     - INSERT/UPDATE/DELETE любые связи (edges);
--   - Игрок НЕ может:
--     - UPDATE/DELETE чужой character-ноды (чужой PC);
--     - Менять настройки кампании, состав участников.
--   - Owner/DM: полные права, как и раньше.
--
-- PC-защита:
--   Только owner/dm или текущий владелец (node_pc_owners) может менять PC.
--   Не-character ноды открыты для всех member'ов.
--
-- Chronicles: логика наследуется через can_edit_node — campaign-wide
-- хроники (node_id IS NULL) остаются за owner/dm, хроники привязанные
-- к конкретной ноде — по правилам can_edit_node.

begin;

-- ─────────────────────────── can_edit_node v2 ───────────────────────────
-- Теперь возвращает true для любого member'а, если нода НЕ character.
-- Для character — только owner/dm или текущий владелец PC.

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
    left join node_types t on t.id = n.type_id
    where n.id = p_node_id
      and is_member(n.campaign_id)
      and (
        -- Менеджеры кампании: полные права на любую ноду.
        is_dm_or_owner(n.campaign_id)
        -- Любой member: любая не-character нода.
        or t.slug <> 'character'
        -- Игрок + его PC: через node_pc_owners.
        or (
          t.slug = 'character'
          and exists (
            select 1
            from node_pc_owners npo
            where npo.node_id = n.id
              and npo.user_id = auth.uid()
          )
        )
      )
  )
$$;

comment on function can_edit_node(uuid) is
  'True if auth.uid() can edit the given node. v2 (migration 031):
   any member can edit non-character nodes; character (PC) nodes are
   protected — only dm/owner or entries in node_pc_owners may edit.';

-- ─────────────────────────── Nodes ───────────────────────────
-- INSERT: любой member (было: только dm/owner).
-- UPDATE: can_edit_node (как раньше, но теперь шире через новую логику).
-- DELETE: can_edit_node (было: только dm/owner).

alter table nodes enable row level security;

drop policy if exists nodes_modify on nodes;
drop policy if exists nodes_update on nodes;
drop policy if exists nodes_insert on nodes;
drop policy if exists nodes_delete on nodes;

create policy nodes_insert on nodes
  for insert to authenticated
  with check (is_member(campaign_id));

create policy nodes_update on nodes
  for update to authenticated
  using (can_edit_node(id))
  with check (can_edit_node(id));

create policy nodes_delete on nodes
  for delete to authenticated
  using (can_edit_node(id));

-- ─────────────────────────── Edges ───────────────────────────
-- Связи открыты для всех member'ов — это метаданные, а не сам PC.
-- Игрок может добавить "мой PC knows <чужой PC>" — это не меняет чужой PC.
-- FK CASCADE на source_id/target_id из миграции 001 сам подчистит связи
-- при удалении ноды.

alter table edges enable row level security;

drop policy if exists edges_modify on edges;
drop policy if exists edges_select on edges;
drop policy if exists edges_update on edges;
drop policy if exists edges_insert on edges;
drop policy if exists edges_delete on edges;

create policy edges_select on edges
  for select to authenticated
  using (is_member(campaign_id));

create policy edges_insert on edges
  for insert to authenticated
  with check (is_member(campaign_id));

create policy edges_update on edges
  for update to authenticated
  using (is_member(campaign_id))
  with check (is_member(campaign_id));

create policy edges_delete on edges
  for delete to authenticated
  using (is_member(campaign_id));

-- ─────────────────────────── Chronicles ───────────────────────────
-- Логика через can_edit_node автоматически становится шире: хроники
-- привязанные к NPC/локации теперь может править любой member.
-- Campaign-wide (node_id IS NULL) — по-прежнему dm/owner only.
-- Пересоздаём политики явно, чтобы закрепить текущее состояние.

do $$
begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='chronicles') then
    execute 'alter table chronicles enable row level security';

    execute 'drop policy if exists chronicles_modify on chronicles';
    execute 'drop policy if exists chronicles_update on chronicles';
    execute 'drop policy if exists chronicles_insert on chronicles';
    execute 'drop policy if exists chronicles_delete on chronicles';

    -- INSERT: campaign-wide → только dm/owner; привязанная к ноде → can_edit_node.
    execute 'create policy chronicles_insert on chronicles '
         || 'for insert to authenticated '
         || 'with check ( '
         || '  (node_id is null and is_dm_or_owner(campaign_id)) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ')';

    execute 'create policy chronicles_update on chronicles '
         || 'for update to authenticated '
         || 'using ( '
         || '  (node_id is null and is_dm_or_owner(campaign_id)) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ') '
         || 'with check ( '
         || '  (node_id is null and is_dm_or_owner(campaign_id)) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ')';

    execute 'create policy chronicles_delete on chronicles '
         || 'for delete to authenticated '
         || 'using ( '
         || '  (node_id is null and is_dm_or_owner(campaign_id)) '
         || '  or (node_id is not null and can_edit_node(node_id)) '
         || ')';
  end if;
end $$;

commit;
