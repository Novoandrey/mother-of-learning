-- Migration 133: batches for craft and scribe.
-- One run may create several identical items. `recipient_node_ids` contains
-- PCs that receive one copy each; every remaining copy lands in the stash.
-- The old recipient_node_id remains as a legacy snapshot for existing runs.

begin;

alter table craft_runs add column if not exists output_qty int not null default 1;
alter table craft_runs add column if not exists recipient_node_ids jsonb not null default '[]'::jsonb;
alter table scribe_runs add column if not exists output_qty int not null default 1;
alter table scribe_runs add column if not exists recipient_node_ids jsonb not null default '[]'::jsonb;

alter table craft_runs drop constraint if exists craft_runs_output_qty_positive;
alter table craft_runs add constraint craft_runs_output_qty_positive check (output_qty > 0);
alter table scribe_runs drop constraint if exists scribe_runs_output_qty_positive;
alter table scribe_runs add constraint scribe_runs_output_qty_positive check (output_qty > 0);

commit;
