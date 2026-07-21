-- Migration 146: optional mobile scene background + stored crop framing.

begin;

alter table public.scene_rooms
  add column background_asset_id uuid references public.media_assets(id) on delete restrict,
  add column background_mobile_crop jsonb not null default '{"x":50,"y":50,"zoom":1}'::jsonb;

create or replace function public.assert_scene_background_campaign()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.background_asset_id is null then return new; end if;
  if not exists (
    select 1 from public.media_assets a
    where a.id = new.background_asset_id and a.campaign_id = new.campaign_id
  ) then
    raise exception 'scene background must belong to the room campaign';
  end if;
  return new;
end;
$$;

create trigger trg_scene_background_campaign
  before insert or update of campaign_id, background_asset_id on public.scene_rooms
  for each row execute function public.assert_scene_background_campaign();

commit;
