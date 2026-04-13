-- 005_effects_and_encounter_details.sql

-- 1. Add "effect" node type
INSERT INTO node_types (id, campaign_id, slug, label, icon, default_fields, sort_order)
SELECT
  gen_random_uuid(),
  c.id,
  'effect',
  'Эффект',
  '✨',
  '{"description": "", "name_en": ""}'::jsonb,
  12
FROM campaigns c
WHERE c.slug = 'mat-ucheniya'
ON CONFLICT DO NOTHING;

-- 2. Effects column on participants
ALTER TABLE encounter_participants
  ADD COLUMN IF NOT EXISTS effects text[] DEFAULT '{}';

-- 3. Encounter details (flexible JSONB for location, description, map, soundtracks, etc.)
ALTER TABLE encounters
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}';
