-- ============================================================================
-- 041_encounter_loot_money_manual.sql
-- ============================================================================
-- Spec-013 polish (chat 50): fourth money-distribution mode «вручную» —
-- DM types in an exact amount per PC. Useful when players negotiate
-- an uneven split among themselves.
--
-- Adds the per-PC amounts column + extends mode + pairing checks to
-- accommodate 'manual'. Idempotent.
-- ============================================================================

alter table encounter_loot_drafts
  add column if not exists money_distribution_manual jsonb null;

-- Mode set: stash / pc / split_evenly / manual
alter table encounter_loot_drafts
  drop constraint if exists encounter_loot_drafts_money_dist_mode_chk;

alter table encounter_loot_drafts
  add constraint encounter_loot_drafts_money_dist_mode_chk
  check (money_distribution_mode in ('stash', 'pc', 'split_evenly', 'manual'));

-- Pairing constraint: only pc-mode populates pc_id; only manual-mode
-- populates the jsonb column. The other two modes have both fields
-- null.
alter table encounter_loot_drafts
  drop constraint if exists encounter_loot_drafts_money_dist_pc_id_chk;

alter table encounter_loot_drafts
  add constraint encounter_loot_drafts_money_dist_pc_id_chk
  check (
    (money_distribution_mode = 'pc'
       and money_distribution_pc_id is not null
       and money_distribution_manual is null)
    or
    (money_distribution_mode in ('stash', 'split_evenly')
       and money_distribution_pc_id is null
       and money_distribution_manual is null)
    or
    (money_distribution_mode = 'manual'
       and money_distribution_pc_id is null
       and money_distribution_manual is not null)
  );

comment on column encounter_loot_drafts.money_distribution_manual is
  'Per-PC coin amounts when mode=manual: { [pcNodeId]: { cp, sp, gp, pp } }. Application validates sum equals draft total before applying.';
