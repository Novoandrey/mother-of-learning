-- Migration 124: expeditions + expedition_runs (spec-055 — Вылазки).
--
-- Player-facing /tg feature on the trust model (no DM approval — like spec-053).
--   * `expeditions`      = reusable menu templates ("available expeditions"),
--                          curated by ANY campaign member (players AND the DM).
--   * `expedition_runs`  = one completed run: who went (participants), when
--                          (loop/day — the "date"; richer calendar/tick time is
--                          spec-057), and the reward/consumable summary.
--
-- The run's FINANCIAL effect is real rows in `transactions` on the общак node,
-- created by the runExpedition server action via the same auto-approve path as
-- app/actions/stash.ts. These tables carry the menu + narrative/history, NOT the
-- balances. Writes go through the admin client in app/actions/expeditions.ts
-- (membership + author/DM checks in code); the RLS below is the safety net.
--
-- ⚠️ Idempotent + non-destructive (CREATE only).
-- Rollback: drop table expedition_runs; drop table expeditions;

begin;

-- ── expeditions: the menu of available expeditions ──────────────────────────
create table if not exists expeditions (
  id                     uuid primary key default gen_random_uuid(),
  campaign_id            uuid not null references campaigns(id) on delete cascade,
  title                  text not null,                     -- цель/название
  description            text not null default '',
  default_consumables    jsonb not null default '[]'::jsonb, -- [{itemNodeId|name, qty}]
  default_duration_ticks int,                                -- опц. локальная длительность
  created_by             uuid,                               -- auth user id (кто добавил)
  created_at             timestamptz not null default now()
);

create index if not exists idx_expeditions_campaign on expeditions (campaign_id);

-- ── expedition_runs: one completed run ──────────────────────────────────────
create table if not exists expedition_runs (
  id                   uuid primary key default gen_random_uuid(),
  expedition_id        uuid references expeditions(id) on delete set null,
  campaign_id          uuid not null references campaigns(id) on delete cascade,
  loop_number          int not null,   -- «дата» = (loop, day), как в transactions
  day_in_loop          int not null,   --   (календарь/тики — spec-057)
  participant_node_ids uuid[] not null default '{}',
  reward_money_gp      numeric(12,2) not null default 0,
  reward_items         jsonb not null default '[]'::jsonb,
  consumables_cost_gp  numeric(12,2) not null default 0,
  consumables_items    jsonb not null default '[]'::jsonb,
  created_by           uuid,
  created_at           timestamptz not null default now()
);

create index if not exists idx_expedition_runs_campaign on expedition_runs (campaign_id);
create index if not exists idx_expedition_runs_expedition on expedition_runs (expedition_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Member-wide SELECT (menu + run history visible to all members, E4). Any member
-- may add an available expedition and log a run (spec-055: «и ДМ, и игроки»);
-- fine-grained author/DM gating for edit/delete lives in the server action.
alter table expeditions enable row level security;
drop policy if exists expeditions_select on expeditions;
create policy expeditions_select on expeditions
  for select to authenticated using (is_member(campaign_id));
drop policy if exists expeditions_modify on expeditions;
create policy expeditions_modify on expeditions
  for all to authenticated
  using (is_member(campaign_id)) with check (is_member(campaign_id));

alter table expedition_runs enable row level security;
drop policy if exists expedition_runs_select on expedition_runs;
create policy expedition_runs_select on expedition_runs
  for select to authenticated using (is_member(campaign_id));
drop policy if exists expedition_runs_modify on expedition_runs;
create policy expedition_runs_modify on expedition_runs
  for all to authenticated
  using (is_member(campaign_id)) with check (is_member(campaign_id));

commit;

-- ─────────────────────────── Verify ───────────────────────────
select case
  when to_regclass('public.expeditions') is not null
   and to_regclass('public.expedition_runs') is not null
   and (select count(*) from pg_policies
        where tablename in ('expeditions', 'expedition_runs')) >= 4
  then '✅ expeditions + expedition_runs tables + RLS created'
  else '❌ expeditions migration incomplete'
end as result;
