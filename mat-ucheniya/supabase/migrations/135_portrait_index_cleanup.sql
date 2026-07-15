-- 135: remove the redundant primary-portrait index found during the UX/code audit.
-- Migration 116 created idx_character_portraits_one_primary; migration 121
-- added the same partial unique index under a new name. One is sufficient to
-- enforce the invariant and maintain on every portrait write.

begin;

drop index if exists public.idx_character_portraits_one_primary;

commit;

-- Verification: exactly the canonical carousel index remains.
select case
  when to_regclass('public.character_portraits_one_primary') is not null
   and to_regclass('public.idx_character_portraits_one_primary') is null
  then '✅ redundant portrait primary index removed'
  else '❌ portrait primary index cleanup incomplete'
end as result;
