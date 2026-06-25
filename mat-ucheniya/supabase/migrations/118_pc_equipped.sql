-- Migration 118: pc_equipped (spec-052, US3 — C-03, C-04).
--
-- Per-(PC, item, loop) equipped flag. Name-keyed to match the shipped
-- holdings readers (getPcItemHoldingsTg groups by item_name); per-loop
-- (re-equip each loop, like wallet/holdings). Does NOT touch transactions
-- (FR-041) — pure inventory metadata, no balance/holding effect. The
-- attunement soft cap (C-17) is derived from this table joined to
-- item_attributes.requires_attunement (mig 055); nothing stored here for it.
--
-- ⚠️ Idempotent + non-destructive (CREATE TABLE/INDEX/POLICY only).
-- Rollback: drop table pc_equipped;

begin;

create table if not exists pc_equipped (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  pc_id         uuid not null references nodes(id) on delete cascade,
  item_name     text not null,
  loop_number   int  not null,
  equipped      boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- one row per holding line per loop; equipped toggled in place
  unique (pc_id, item_name, loop_number)
);

-- Primary read: a PC's equipped items this loop (Mini App inventory screen)
create index if not exists idx_pc_equipped_pc_loop
  on pc_equipped (pc_id, loop_number)
  where equipped = true;

alter table pc_equipped enable row level security;

-- Member-wide SELECT: the Mini App shows any PC's inventory (E4); a player
-- equips only their own PC (enforced in the setEquipped server action).
drop policy if exists pc_equipped_select on pc_equipped;
create policy pc_equipped_select on pc_equipped
  for select to authenticated
  using (is_member(campaign_id));

-- Writes go through the admin client in setEquipped (cookie resolveAuth +
-- own-PC/DM ownership in code). This policy is a safety net in case a future
-- route uses the user client directly. (Same shape as transactions, mig 034.)
drop policy if exists pc_equipped_modify on pc_equipped;
create policy pc_equipped_modify on pc_equipped
  for all to authenticated
  using (is_dm_or_owner(campaign_id))
  with check (is_dm_or_owner(campaign_id));

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when to_regclass('public.pc_equipped') is not null
   and (select count(*) from pg_policies where tablename = 'pc_equipped') >= 2
  then '✅ pc_equipped table + RLS policies created'
  else '❌ pc_equipped missing or policies absent'
end as result;
