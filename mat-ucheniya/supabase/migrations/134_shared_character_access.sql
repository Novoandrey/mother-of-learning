-- 134: Character ownership remains roster metadata, not an access boundary.
-- Every authenticated member of a campaign may edit/delete every node in it.

begin;

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
    join campaign_members cm on cm.campaign_id = n.campaign_id
    where n.id = p_node_id
      and cm.user_id = auth.uid()
  );
$$;

comment on function can_edit_node(uuid) is
  'Any campaign member may edit any campaign node; PC owners are roster metadata only.';

commit;
