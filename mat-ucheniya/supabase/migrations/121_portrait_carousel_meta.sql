-- Migration 121: portrait carousel + per-portrait metadata (spec-030).
--
-- Extends character_portraits (mig 116, one-to-many already) from "one
-- read-only primary" to a full carousel: ordering + optional metadata the
-- mig-116 header promised ("next spec adds upload + carousel + per-portrait
-- metadata (loop / inspiration / description), no migration" — the columns
-- are that spec).
--
--   sort_order   — carousel position (0-based); primary shows first anyway.
--   caption      — short label under the art ("лич", "человек" for the four
--                  Кватач-Ичл forms; free text otherwise).
--   loop_number  — optional: which loop this depiction belongs to.
--   inspiration  — optional: reference / prompt / source note.
--
-- Also enforces the invariant the app already assumes (one primary per node)
-- with a partial unique index — previously only convention (seed deletes the
-- old primary before insert). Safe: mig-116 seed wrote exactly one per node.
--
-- ⚠️ Idempotent (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
-- Rollback: alter table character_portraits drop column sort_order, drop
--   column caption, drop column loop_number, drop column inspiration;
--   drop index if exists character_portraits_one_primary;

begin;

alter table character_portraits
  add column if not exists sort_order  int  not null default 0,
  add column if not exists caption     text,
  add column if not exists loop_number int,
  add column if not exists inspiration text;

-- Carousel read: portraits of a node in display order (primary floated first
-- in the app, then sort_order, then created_at).
create index if not exists idx_character_portraits_node_order
  on character_portraits (character_node_id, sort_order, created_at);

-- At most one primary per node. Partial unique — many non-primary rows allowed.
create unique index if not exists character_portraits_one_primary
  on character_portraits (character_node_id)
  where is_primary;

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when (select count(*) from information_schema.columns
         where table_name = 'character_portraits'
           and column_name in ('sort_order','caption','loop_number','inspiration')) = 4
   and to_regclass('public.character_portraits_one_primary') is not null
  then '✅ carousel columns + one-primary index in place'
  else '❌ migration 121 incomplete'
end as result;
