-- 115: Telegram identity link (spec-046).
-- Adds user_profiles.telegram_id. The Telegram Mini App mints a Supabase JWT
-- whose sub = auth.users.id of the linked account; this column is the mapping
-- telegram_id -> account (C-05). 1:1, nullable: most accounts stay unlinked
-- until the DM binds them in the mapping view (C-01 б).

begin;

alter table user_profiles
  add column if not exists telegram_id bigint unique;

comment on column user_profiles.telegram_id is
  'Telegram user id (bigint; Telegram ids exceed 32-bit). NULL until the DM '
  'links this account to a Telegram user (spec-046, C-01 б). Unique: one '
  'Telegram user maps to at most one account.';

commit;

-- Verification.
select
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'user_profiles'
      and column_name  = 'telegram_id'
      and data_type    = 'bigint'
  ) then '✅ user_profiles.telegram_id (bigint, unique) present'
       else '❌ user_profiles.telegram_id MISSING' end as result;
