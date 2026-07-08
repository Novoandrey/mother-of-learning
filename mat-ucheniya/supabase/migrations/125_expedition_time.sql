-- Migration 125: expedition time layer (spec-055 — Вылазки, слой времени).
--
-- Adds an intra-day window to a logged run and seeds the «Ресурс» item
-- category that a follow-up agent's reward-resources feature hangs off.
--
--   * expedition_runs.start_minute    — minute-of-day the вылазка starts
--                                        (0..1439 within day_in_loop). NULL on
--                                        legacy rows logged before this layer.
--   * expedition_runs.duration_minute — вылазка length in minutes. NULL = legacy.
--
--     Together with (loop_number, day_in_loop) these pin a precise window on the
--     campaign calendar. The STRICT window gate (30-day «месяц странствий»
--     starting 02:00 day 1, ending 02:00 day 31) lives in code —
--     lib/expedition-calendar.ts + the runExpedition action. The DB stays
--     permissive (plain nullable ints, no CHECK) so legacy rows AND the future
--     per-campaign calendar (spec-057) both fit without another migration.
--
--   * categories: seed scope='item', slug='resource', label='Ресурс' per
--     existing campaign. Same per-campaign cross-join + ON CONFLICT DO NOTHING
--     shape as migration 043's item-category seeds; conflict target is the
--     unique (campaign_id, scope, slug) from migration 034. sort_order 90 sits
--     after 'misc' (80) — last in the item category list. New campaigns pick
--     item categories up through the TS seeder, not this migration.
--
-- ⚠️ Idempotent + non-destructive: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO
--    NOTHING. Re-running is safe.
-- Rollback:
--   alter table expedition_runs drop column if exists duration_minute;
--   alter table expedition_runs drop column if exists start_minute;
--   delete from categories where scope = 'item' and slug = 'resource';

begin;

-- ── expedition_runs: intra-day window ───────────────────────────────────────
alter table expedition_runs
  add column if not exists start_minute int;    -- 0..1439 within day_in_loop; NULL = legacy

alter table expedition_runs
  add column if not exists duration_minute int; -- length in minutes; NULL = legacy

-- ── categories: «Ресурс» item category, per existing campaign ────────────────
insert into categories (campaign_id, scope, slug, label, sort_order)
select c.id, 'item', 'resource', 'Ресурс', 90
from campaigns c
on conflict (campaign_id, scope, slug) do nothing;

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when exists (
         select 1 from information_schema.columns
         where table_name = 'expedition_runs' and column_name = 'start_minute'
       )
   and exists (
         select 1 from information_schema.columns
         where table_name = 'expedition_runs' and column_name = 'duration_minute'
       )
   and (select count(*) from categories where scope = 'item' and slug = 'resource')
       >= (select count(*) from campaigns)
  then '✅ expedition_runs.start_minute/duration_minute + «Ресурс» item category seeded'
  else '❌ 125 incomplete'
end as result;
