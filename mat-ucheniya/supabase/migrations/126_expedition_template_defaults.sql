-- Migration 126: expedition template defaults (spec-055 — Вылазки, доработки R2).
--
-- The `expeditions` menu template used to carry only the CONSUMABLES defaults
-- (title/description/default_consumables/default_duration_ticks); the reward,
-- the roster and the intra-day window were typed fresh into EVERY run
-- (`expedition_runs`). Andrey wants the template to hold the FULL default set so
-- the run form can pre-fill it (everything stays editable per run — these are
-- defaults, not locks). This adds the missing reward/roster/time defaults to the
-- template row.
--
--   * reward_money_gp — default reward money, WHOLE gp (matches the int money
--                       columns runs credit; the run rounds the same way).
--   * reward_items    — default reward items, [{name, itemNodeId?, qty}] — same
--                       jsonb shape as expedition_runs.reward_items.
--   * default_participant_node_ids — default roster (character node ids), same
--                       uuid[] shape as expedition_runs.participant_node_ids.
--   * default_start_minute    — default minute-of-day the вылазка starts
--                       (0..1439). NULL = no default. Minutes are the run unit
--                       since migration 125 (start_minute/duration_minute).
--   * default_duration_minute — default вылазка length in minutes. NULL = none.
--
--     Range checks (start 0..1439, duration > 0) live in code
--     (app/actions/expeditions.ts), like the run-time window gate — the DB stays
--     permissive (plain nullable ints, no CHECK) so legacy templates fit.
--
-- ⚠️ default_duration_ticks (mig 124) is now DEPRECATED — superseded by
--    default_duration_minute (minutes are the run unit after mig 125). Kept, not
--    dropped: legacy templates may still carry a value and the read layer maps
--    both. Do not write it going forward.
--
-- ⚠️ Idempotent + non-destructive: ADD COLUMN IF NOT EXISTS. Re-running is safe.
-- Rollback:
--   alter table expeditions drop column if exists default_duration_minute;
--   alter table expeditions drop column if exists default_start_minute;
--   alter table expeditions drop column if exists default_participant_node_ids;
--   alter table expeditions drop column if exists reward_items;
--   alter table expeditions drop column if exists reward_money_gp;

begin;

-- ── expeditions: full default set (reward + roster + intra-day window) ────────
alter table expeditions
  add column if not exists reward_money_gp numeric(12,2) not null default 0;

alter table expeditions
  add column if not exists reward_items jsonb not null default '[]'::jsonb; -- [{name, itemNodeId?, qty}]

alter table expeditions
  add column if not exists default_participant_node_ids uuid[] not null default '{}'; -- roster

alter table expeditions
  add column if not exists default_start_minute int;    -- 0..1439; NULL = no default

alter table expeditions
  add column if not exists default_duration_minute int; -- length in minutes; NULL = no default

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when (select count(*) from information_schema.columns
        where table_name = 'expeditions'
          and column_name in (
            'reward_money_gp', 'reward_items', 'default_participant_node_ids',
            'default_start_minute', 'default_duration_minute'
          )) = 5
  then '✅ expeditions template defaults (reward + roster + time) added'
  else '❌ 126 incomplete'
end as result;
