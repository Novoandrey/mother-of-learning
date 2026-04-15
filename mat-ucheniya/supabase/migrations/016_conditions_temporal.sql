-- Migration 016: Temporal binding for conditions and effects
-- Changes conditions/effects from text[] to jsonb array of objects
-- Each entry: {"name": "...", "round": N}
-- "round" = the combat round when the condition/effect was applied

-- 1. Add new jsonb columns
ALTER TABLE encounter_participants
  ADD COLUMN IF NOT EXISTS conditions_data jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS effects_data jsonb DEFAULT '[]'::jsonb;

-- 2. Migrate existing data: convert text[] entries to jsonb objects with round=0
UPDATE encounter_participants
SET conditions_data = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', elem, 'round', 0)), '[]'::jsonb)
  FROM unnest(conditions) AS elem
)
WHERE conditions IS NOT NULL AND array_length(conditions, 1) > 0;

UPDATE encounter_participants
SET effects_data = (
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', elem, 'round', 0)), '[]'::jsonb)
  FROM unnest(effects) AS elem
)
WHERE effects IS NOT NULL AND array_length(effects, 1) > 0;

-- 3. Drop old columns
ALTER TABLE encounter_participants DROP COLUMN IF EXISTS conditions;
ALTER TABLE encounter_participants DROP COLUMN IF EXISTS effects;

-- 4. Rename new columns
ALTER TABLE encounter_participants RENAME COLUMN conditions_data TO conditions;
ALTER TABLE encounter_participants RENAME COLUMN effects_data TO effects;
