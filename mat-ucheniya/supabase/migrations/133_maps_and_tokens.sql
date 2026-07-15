-- 133: free-form battle maps and character tokens.
-- Positions are normalized (0..1) so a map has the same state on desktop and
-- a narrow mobile viewport. There deliberately is no grid in this first cut.

begin;

create table if not exists campaign_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  image_key text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_maps_campaign_updated
  on campaign_maps (campaign_id, updated_at desc);

create table if not exists map_tokens (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references campaign_maps(id) on delete cascade,
  character_node_id uuid not null references nodes(id) on delete cascade,
  x numeric(6,5) not null default 0.5 check (x >= 0 and x <= 1),
  y numeric(6,5) not null default 0.5 check (y >= 0 and y <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(map_id, character_node_id)
);

create index if not exists map_tokens_map on map_tokens(map_id);

-- A crop is recorded as normalized source-image coordinates. x/y are the
-- centre of the selected square; zoom is the square's inverse width.
alter table character_portraits
  add column if not exists crop_x numeric(5,4) not null default 0.5,
  add column if not exists crop_y numeric(5,4) not null default 0.5,
  add column if not exists crop_zoom numeric(5,3) not null default 1;

alter table campaign_maps enable row level security;
alter table map_tokens enable row level security;

drop policy if exists campaign_maps_select on campaign_maps;
create policy campaign_maps_select on campaign_maps for select to authenticated
  using (exists (
    select 1 from campaign_members cm
    where cm.campaign_id = campaign_maps.campaign_id and cm.user_id = auth.uid()
  ));

drop policy if exists map_tokens_select on map_tokens;
create policy map_tokens_select on map_tokens for select to authenticated
  using (exists (
    select 1 from campaign_maps m join campaign_members cm on cm.campaign_id = m.campaign_id
    where m.id = map_tokens.map_id and cm.user_id = auth.uid()
  ));

commit;
