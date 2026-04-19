-- Migration 020: Action-economy counters on encounter_participants
-- Stage 2 of encounter tracker v4: right statblock panel needs persisted
-- counters so reactions/legendary budget survive page reload.
--
--   used_reactions  — reset at start of each turn (in app code)
--   legendary_used  — reset at start of each round (in app code)
--
-- Both nullable-safe: defaults to 0, NOT NULL so UI never has to handle null.

ALTER TABLE encounter_participants
  ADD COLUMN IF NOT EXISTS used_reactions int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legendary_used int NOT NULL DEFAULT 0;

COMMENT ON COLUMN encounter_participants.used_reactions IS
  'Reactions spent this turn. Reset to 0 at start of own turn (app-side).';
COMMENT ON COLUMN encounter_participants.legendary_used IS
  'Legendary action budget spent this round. Reset to 0 at start of round (app-side).';
