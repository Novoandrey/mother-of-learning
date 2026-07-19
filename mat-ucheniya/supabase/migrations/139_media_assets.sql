-- 139: campaign media library (spec-060 / MEDIA-01).
--
-- An asset is independent from its future uses. Portraits, map backgrounds and
-- node covers will reference media_assets.id in later specs; this migration
-- deliberately does not alter the existing portrait/map tables.

begin;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  storage_key text not null unique,
  original_filename text not null
    check (char_length(trim(original_filename)) between 1 and 255),
  mime_type text not null
    check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes bigint not null
    check (size_bytes between 1 and 12582912),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists media_assets_campaign_created
  on public.media_assets (campaign_id, created_at desc, id desc);

alter table public.media_assets enable row level security;

drop policy if exists media_assets_select on public.media_assets;
create policy media_assets_select on public.media_assets
  for select to authenticated
  using (
    exists (
      select 1
      from public.campaign_members cm
      where cm.campaign_id = media_assets.campaign_id
        and cm.user_id = (select auth.uid())
    )
  );

-- No client write policies. The authenticated Route Handler verifies the
-- owner/DM role, then writes with the service role.

commit;

select case
  when to_regclass('public.media_assets') is not null
   and to_regclass('public.media_assets_campaign_created') is not null
   and exists (
     select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'media_assets'
       and policyname = 'media_assets_select'
   )
  then '✅ media_assets table + index + RLS select policy present'
  else '❌ media_assets setup INCOMPLETE'
end as result;
