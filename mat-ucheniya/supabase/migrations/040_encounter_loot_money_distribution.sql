-- ============================================================================
-- 040_encounter_loot_money_distribution.sql
-- ============================================================================
-- Spec-013 polish (chat 50): money distribution becomes a single global
-- choice on the draft instead of a per-line decision. Coin lines are
-- now just records of "what dropped" (with optional `comment` like
-- «Тела пауков»); on apply, all coin lines are summed and distributed
-- using these two columns.
--
-- Items keep their per-line recipient_mode in the lines JSONB.
-- ============================================================================

alter table encounter_loot_drafts
  add column if not exists money_distribution_mode text not null default 'stash',
  add column if not exists money_distribution_pc_id uuid null
    references nodes(id) on delete set null;

alter table encounter_loot_drafts
  drop constraint if exists encounter_loot_drafts_money_dist_mode_chk;

alter table encounter_loot_drafts
  add constraint encounter_loot_drafts_money_dist_mode_chk
  check (money_distribution_mode in ('stash', 'pc', 'split_evenly'));

-- A pc_id is meaningful only when mode='pc'. The other modes must
-- have a null pc_id. (The application layer enforces too, but this
-- catches bad direct DB writes.)
alter table encounter_loot_drafts
  drop constraint if exists encounter_loot_drafts_money_dist_pc_id_chk;

alter table encounter_loot_drafts
  add constraint encounter_loot_drafts_money_dist_pc_id_chk
  check (
    (money_distribution_mode = 'pc' and money_distribution_pc_id is not null)
    or
    (money_distribution_mode in ('stash', 'split_evenly') and money_distribution_pc_id is null)
  );

comment on column encounter_loot_drafts.money_distribution_mode is
  'Spec-013 ch50: how summed money is distributed on apply. stash = all to campaign stash node; pc = single PC (see pc_id); split_evenly = divided across encounter participants.';

comment on column encounter_loot_drafts.money_distribution_pc_id is
  'Target PC node id when mode=pc; null otherwise. ON DELETE SET NULL so deleting the PC degrades the draft to stash + null rather than failing — the validator nudges the DM to re-pick.';
