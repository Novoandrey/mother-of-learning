-- 142: MEDIA-04 portrait usages reference the campaign media library.
--
-- Existing r2_key rows remain readable during the controlled backfill. New
-- portrait usages use media_asset_id; a trigger enforces the shared campaign
-- boundary that a plain FK cannot express.

begin;

alter table public.character_portraits
  add column if not exists media_asset_id uuid references public.media_assets(id) on delete restrict;

alter table public.character_portraits
  alter column r2_key drop not null;

create index if not exists character_portraits_media_asset
  on public.character_portraits (media_asset_id)
  where media_asset_id is not null;

create or replace function public.validate_portrait_media_asset_campaign()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_node_campaign uuid;
  v_asset_campaign uuid;
begin
  if new.media_asset_id is null then return new; end if;

  select campaign_id into v_node_campaign
  from public.nodes where id = new.character_node_id;
  select campaign_id into v_asset_campaign
  from public.media_assets where id = new.media_asset_id;

  if v_node_campaign is null or v_asset_campaign is null or v_node_campaign <> v_asset_campaign then
    raise exception 'PORTRAIT_MEDIA_ASSET_CAMPAIGN_MISMATCH';
  end if;
  return new;
end;
$$;

drop trigger if exists character_portraits_validate_media_asset on public.character_portraits;
create trigger character_portraits_validate_media_asset
  before insert or update of character_node_id, media_asset_id on public.character_portraits
  for each row execute function public.validate_portrait_media_asset_campaign();

create unique index if not exists character_portraits_node_media_asset_unique
  on public.character_portraits (character_node_id, media_asset_id)
  where media_asset_id is not null;

commit;

-- Verification: must be run before the backfill. The final query should be
-- empty; non-empty rows are historic duplicate usages requiring manual review.
select case
  when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'character_portraits'
      and column_name = 'media_asset_id'
  ) and to_regclass('public.character_portraits_node_media_asset_unique') is not null
  then '✅ portrait media-asset usage schema present'
  else '❌ portrait media-asset usage schema incomplete'
end as result;

select cp.character_node_id, ma.id as media_asset_id, count(*) as portrait_count
from public.character_portraits cp
join public.nodes n on n.id = cp.character_node_id
join public.media_assets ma on ma.campaign_id = n.campaign_id and ma.storage_key = cp.r2_key
where cp.media_asset_id is null
group by cp.character_node_id, ma.id
having count(*) > 1;
