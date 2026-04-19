-- Migration 021: Campaign settings + legendary resistance counter
--
-- Adds:
--   campaigns.settings jsonb DEFAULT '{}'::jsonb
--     Keys used by the app:
--       hp_method: 'average' | 'max' | 'min' | 'roll'
--         How to derive a monster's starting HP when added to an encounter
--         from the catalog. Default 'average'.
--       Future: initiative_mode, rest_rules, etc.
--
--   encounter_participants.legendary_resistance_used int NOT NULL DEFAULT 0
--     How many Legendary Resistances the creature has burned this encounter.
--     Budget comes from its statblock passives (Legendary Resistance (N/Day)).

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Set a sensible default for existing campaigns.
UPDATE campaigns
SET settings = settings || '{"hp_method": "average"}'::jsonb
WHERE NOT (settings ? 'hp_method');

ALTER TABLE encounter_participants
  ADD COLUMN IF NOT EXISTS legendary_resistance_used int NOT NULL DEFAULT 0;
