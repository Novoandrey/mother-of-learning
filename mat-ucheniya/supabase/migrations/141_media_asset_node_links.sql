-- 141: connect reusable media assets to their existing campaign nodes.
--
-- `import_source` is deliberately importer-only provenance. It makes legacy
-- imports resumable without pretending that a node link is a future media use.

begin;

alter table public.media_assets
  add column if not exists import_source text;

create unique index if not exists media_assets_campaign_import_source_unique
  on public.media_assets (campaign_id, import_source)
  where import_source is not null;

create table if not exists public.media_asset_node_links (
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  node_id uuid not null references public.nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (media_asset_id, node_id)
);

create index if not exists media_asset_node_links_node
  on public.media_asset_node_links (node_id, media_asset_id);

create or replace function public.ensure_media_asset_node_link_campaign()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  asset_campaign_id uuid;
  node_campaign_id uuid;
begin
  select campaign_id into asset_campaign_id
  from public.media_assets
  where id = new.media_asset_id;

  select campaign_id into node_campaign_id
  from public.nodes
  where id = new.node_id;

  if asset_campaign_id is null or node_campaign_id is null
     or asset_campaign_id <> node_campaign_id then
    raise exception 'media asset and node must belong to the same campaign';
  end if;

  return new;
end;
$$;

drop trigger if exists media_asset_node_links_same_campaign on public.media_asset_node_links;
create trigger media_asset_node_links_same_campaign
  before insert or update on public.media_asset_node_links
  for each row execute function public.ensure_media_asset_node_link_campaign();

alter table public.media_asset_node_links enable row level security;

drop policy if exists media_asset_node_links_select on public.media_asset_node_links;
create policy media_asset_node_links_select on public.media_asset_node_links
  for select to authenticated
  using (
    exists (
      select 1
      from public.media_assets ma
      join public.campaign_members cm on cm.campaign_id = ma.campaign_id
      where ma.id = media_asset_node_links.media_asset_id
        and cm.user_id = (select auth.uid())
    )
  );

commit;
