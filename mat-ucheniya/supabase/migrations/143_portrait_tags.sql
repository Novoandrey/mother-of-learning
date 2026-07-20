-- 143: classify portrait usage for cutout generation and token rendering.
--
-- A portrait's subject class is derived from its node, never supplied by the
-- client: player characters use `pc`; NPCs and creatures use `npc`.

begin;

alter table public.character_portraits
  add column if not exists portrait_tag text;

update public.character_portraits cp
set portrait_tag = case when nt.slug = 'character' then 'pc' else 'npc' end
from public.nodes n
join public.node_types nt on nt.id = n.type_id
where n.id = cp.character_node_id
  and (cp.portrait_tag is null or cp.portrait_tag not in ('pc', 'npc'));

alter table public.character_portraits
  alter column portrait_tag set default 'npc',
  alter column portrait_tag set not null;

alter table public.character_portraits
  drop constraint if exists character_portraits_portrait_tag_check,
  add constraint character_portraits_portrait_tag_check
    check (portrait_tag in ('pc', 'npc'));

create index if not exists character_portraits_portrait_tag
  on public.character_portraits (portrait_tag);

create or replace function public.assign_character_portrait_tag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_node_type text;
begin
  select nt.slug into v_node_type
  from public.nodes n
  join public.node_types nt on nt.id = n.type_id
  where n.id = new.character_node_id;

  if v_node_type is null then
    raise exception 'PORTRAIT_NODE_NOT_FOUND';
  end if;
  new.portrait_tag := case when v_node_type = 'character' then 'pc' else 'npc' end;
  return new;
end;
$$;

drop trigger if exists character_portraits_assign_tag on public.character_portraits;
create trigger character_portraits_assign_tag
  before insert or update of character_node_id on public.character_portraits
  for each row execute function public.assign_character_portrait_tag();

commit;

-- Verification: rows are derived from node type and no unclassified portrait remains.
select cp.id, cp.portrait_tag, nt.slug as node_type
from public.character_portraits cp
join public.nodes n on n.id = cp.character_node_id
join public.node_types nt on nt.id = n.type_id
where (nt.slug = 'character' and cp.portrait_tag <> 'pc')
   or (nt.slug <> 'character' and cp.portrait_tag <> 'npc');
