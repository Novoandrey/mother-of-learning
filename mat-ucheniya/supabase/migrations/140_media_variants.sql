-- 140: scalable campaign media delivery (MEDIA-02).
-- Originals stay in media_assets.storage_key; worker-generated renditions are
-- immutable R2 objects referenced by metadata rows.

begin;

alter table public.media_assets
  add column if not exists source_width integer,
  add column if not exists source_height integer,
  add column if not exists variant_state text not null default 'queued'
    check (variant_state in ('queued', 'processing', 'ready', 'failed')),
  add column if not exists variant_version smallint not null default 1
    check (variant_version > 0),
  add column if not exists variant_error_code text,
  add column if not exists variants_updated_at timestamptz;

create table if not exists public.media_asset_variants (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  rendition text not null check (rendition in ('thumb', 'preview', 'scene')),
  version smallint not null check (version > 0),
  storage_key text not null unique,
  mime_type text not null default 'image/webp' check (mime_type = 'image/webp'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now(),
  unique (asset_id, rendition, version)
);

create index if not exists media_asset_variants_asset_version
  on public.media_asset_variants (asset_id, version, rendition);

create table if not exists public.media_variant_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  version smallint not null check (version > 0),
  state text not null default 'queued'
    check (state in ('queued', 'processing', 'ready', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_owner text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset_id, version)
);

create index if not exists media_variant_jobs_claim
  on public.media_variant_jobs (state, next_attempt_at, lease_expires_at, created_at);

alter table public.media_asset_variants enable row level security;
alter table public.media_variant_jobs enable row level security;

drop policy if exists media_asset_variants_select on public.media_asset_variants;
create policy media_asset_variants_select on public.media_asset_variants
  for select to authenticated
  using (
    exists (
      select 1
      from public.media_assets ma
      join public.campaign_members cm on cm.campaign_id = ma.campaign_id
      where ma.id = media_asset_variants.asset_id
        and cm.user_id = (select auth.uid())
    )
  );

-- Existing assets and new inserts both receive one durable work item.
insert into public.media_variant_jobs (asset_id, version)
select id, variant_version from public.media_assets
on conflict (asset_id, version) do nothing;

create or replace function public.enqueue_media_variant_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.media_variant_jobs (asset_id, version)
  values (new.id, new.variant_version)
  on conflict (asset_id, version) do nothing;
  return new;
end;
$$;

drop trigger if exists media_assets_enqueue_variants on public.media_assets;
create trigger media_assets_enqueue_variants
  after insert on public.media_assets
  for each row execute function public.enqueue_media_variant_job();

create or replace function public.claim_media_variant_job(p_worker_id text)
returns table (
  job_id uuid,
  asset_id uuid,
  campaign_id uuid,
  storage_key text,
  mime_type text,
  version smallint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed public.media_variant_jobs%rowtype;
begin
  select j.* into claimed
  from public.media_variant_jobs j
  where (j.state = 'queued' and j.next_attempt_at <= now())
     or (j.state = 'processing' and j.lease_expires_at < now())
  order by j.created_at
  for update skip locked
  limit 1;

  if not found then return; end if;

  update public.media_variant_jobs
  set state = 'processing', attempts = claimed.attempts + 1,
      lease_owner = p_worker_id, lease_expires_at = now() + interval '10 minutes',
      updated_at = now(), last_error_code = null
  where id = claimed.id;

  update public.media_assets
  set variant_state = 'processing', variant_error_code = null, variants_updated_at = now()
  where id = claimed.asset_id;

  return query
  select claimed.id, ma.id, ma.campaign_id, ma.storage_key, ma.mime_type, claimed.version
  from public.media_assets ma where ma.id = claimed.asset_id;
end;
$$;

create or replace function public.complete_media_variant_job(
  p_job_id uuid, p_worker_id text, p_width integer, p_height integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
begin
  update public.media_variant_jobs
  set state = 'ready', lease_owner = null, lease_expires_at = null, updated_at = now()
  where id = p_job_id and state = 'processing' and lease_owner = p_worker_id
  returning asset_id into v_asset_id;
  if v_asset_id is null then return false; end if;

  update public.media_assets
  set source_width = p_width, source_height = p_height, variant_state = 'ready',
      variant_error_code = null, variants_updated_at = now()
  where id = v_asset_id;
  return true;
end;
$$;

create or replace function public.fail_media_variant_job(
  p_job_id uuid, p_worker_id text, p_error_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_id uuid;
  v_state text;
begin
  update public.media_variant_jobs
  set state = case when attempts >= 3 then 'failed' else 'queued' end,
      lease_owner = null, lease_expires_at = null,
      next_attempt_at = now() + interval '1 minute', last_error_code = left(p_error_code, 120),
      updated_at = now()
  where id = p_job_id and state = 'processing' and lease_owner = p_worker_id
  returning asset_id, state into v_asset_id, v_state;
  if v_asset_id is null then return false; end if;

  update public.media_assets
  set variant_state = v_state, variant_error_code = left(p_error_code, 120), variants_updated_at = now()
  where id = v_asset_id;
  return true;
end;
$$;

revoke all on function public.claim_media_variant_job(text) from public, anon, authenticated;
revoke all on function public.complete_media_variant_job(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.fail_media_variant_job(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_media_variant_job(text) to service_role;
grant execute on function public.complete_media_variant_job(uuid, text, integer, integer) to service_role;
grant execute on function public.fail_media_variant_job(uuid, text, text) to service_role;

commit;
