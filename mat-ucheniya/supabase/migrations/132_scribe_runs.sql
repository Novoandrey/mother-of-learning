-- Migration 132: scribe_runs (spec-059 — написание свитков).
--
-- Player-facing /tg feature на модели доверия (как крафт 127 / вылазки 124):
--
--   * `scribe_runs` — один завершённый акт записи свитка: какое заклинание
--     (spell_node_id + level), когда (loop/day + опц. start_minute), кто из
--     писцов сколько часов вложил (participants jsonb [{nodeId, hours}]), фикс-
--     цена, списанная с общака (invested_gp), какой свиток вышел
--     (output_scroll_node_id/name) и кому достался (recipient_node_id, NULL =
--     общак). ФИНАНСОВЫЙ эффект — реальные `transactions`-строки на общаке,
--     пишет server action runScribe (app/actions/scribe.ts); эта таблица —
--     нарратив/история, НЕ балансы. Append-only v1.
--
-- Зеркало craft_runs (127). Категория 'scroll' и node_type 'spell' засеяны
-- миграцией 130; связь свиток→спелл — soft-поле scroll.fields.spell_node_id
-- (без FK — грабля 128), здесь FK нет на этот линк.
--
-- ⚠️ Идемпотентно + недеструктивно: CREATE IF NOT EXISTS, DROP POLICY IF EXISTS.
-- Rollback:
--   drop table if exists scribe_runs;

begin;

-- ── scribe_runs: один завершённый акт записи свитка ──────────────────────────
create table if not exists scribe_runs (
  id                    uuid primary key default gen_random_uuid(),
  campaign_id           uuid not null references campaigns(id) on delete cascade,
  spell_node_id         uuid references nodes(id) on delete set null,
  level                 int,            -- уровень заклинания (0..9) на момент записи
  loop_number           int not null,   -- «дата» = (loop, day), как в transactions
  day_in_loop           int not null,
  start_minute          int,            -- 0..1439 внутри day_in_loop; NULL = без времени
  participants          jsonb not null default '[]'::jsonb, -- [{nodeId, hours}] писцы
  invested_gp           numeric(12,2) not null default 0,   -- фикс-цена, списанная с общака
  output_scroll_node_id uuid references nodes(id) on delete set null,
  output_scroll_name    text not null default '',
  recipient_node_id     uuid references nodes(id) on delete set null, -- NULL = общак
  created_by            uuid,           -- auth user id (кто провёл запись)
  created_at            timestamptz not null default now()
);

create index if not exists idx_scribe_runs_campaign on scribe_runs (campaign_id);
create index if not exists idx_scribe_runs_spell on scribe_runs (spell_node_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Как craft_runs (127): member-wide SELECT (история видна всем участникам),
-- любой участник может залогировать акт (модель доверия). Тонкий гейт — в экшене.
alter table scribe_runs enable row level security;
drop policy if exists scribe_runs_select on scribe_runs;
create policy scribe_runs_select on scribe_runs
  for select to authenticated using (is_member(campaign_id));
drop policy if exists scribe_runs_modify on scribe_runs;
create policy scribe_runs_modify on scribe_runs
  for all to authenticated
  using (is_member(campaign_id)) with check (is_member(campaign_id));

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when to_regclass('public.scribe_runs') is not null
   and (select count(*) from pg_policies where tablename = 'scribe_runs') >= 2
  then '✅ scribe_runs + RLS'
  else '❌ 132 incomplete'
end as result;
