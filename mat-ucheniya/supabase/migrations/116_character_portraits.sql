-- 116: Character portraits (spec-046).
-- One-to-many: a character node can have many portraits (history). v0 renders
-- the primary one read-only; the next spec adds upload + carousel + per-portrait
-- metadata (loop / inspiration / description) on top of this table, no migration.
-- Images live in a public-read Cloudflare R2 bucket; r2_key is the object key,
-- the app builds the URL as NEXT_PUBLIC_R2_PORTRAIT_BASE + '/' + r2_key.
-- Writes are seed-only (service role); clients only read (R6 transparency).

begin;

create table if not exists character_portraits (
  id                uuid primary key default gen_random_uuid(),
  character_node_id uuid not null references nodes(id) on delete cascade,
  r2_key            text not null,
  is_primary        boolean not null default false,
  created_at        timestamptz default now()
);

create index if not exists idx_character_portraits_node
  on character_portraits (character_node_id);

-- At most one primary portrait per character.
create unique index if not exists idx_character_portraits_one_primary
  on character_portraits (character_node_id)
  where is_primary;

alter table character_portraits enable row level security;

-- R6 transparency: any member of the character's campaign may read any portrait.
drop policy if exists character_portraits_select on character_portraits;
create policy character_portraits_select on character_portraits
  for select to authenticated
  using (
    exists (
      select 1
      from nodes n
      join campaign_members cm on cm.campaign_id = n.campaign_id
      where n.id = character_portraits.character_node_id
        and cm.user_id = auth.uid()
    )
  );

-- No insert/update/delete policies: clients cannot write. Seeding and future
-- uploads run through the service role (which bypasses RLS).

commit;

-- Verification.
select
  case when exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'character_portraits')
   and exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = 'character_portraits'
          and policyname = 'character_portraits_select')
  then '✅ character_portraits table + RLS select policy present'
       else '❌ character_portraits setup INCOMPLETE' end as result;
