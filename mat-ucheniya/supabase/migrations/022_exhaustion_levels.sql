-- Migration 022: replace single "Истощённый" with six levels
--
-- In 5e exhaustion is the only condition with levels (1–6). Instead of
-- showing a superscript number on a single tag, we model each level as
-- its own condition node. TagCell already handles arbitrary strings.

-- 1. Remove the single generic "Истощённый" node, if present.
--    Also removes it from any encounter_participants.conditions arrays
--    — those are text[] and cleaned via a separate UPDATE below.
DELETE FROM nodes n
USING node_types nt, campaigns c
WHERE n.type_id = nt.id
  AND nt.campaign_id = c.id
  AND nt.slug = 'condition'
  AND c.slug = 'mat-ucheniya'
  AND n.title = 'Истощённый';

-- 2. Drop the stale name from any existing conditions arrays.
--    Migration 016 changed conditions from text[] to jsonb array of
--    {name, round} objects, so we filter the jsonb array.
UPDATE encounter_participants
SET conditions = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(conditions) AS elem
    WHERE elem->>'name' <> 'Истощённый'
  ),
  '[]'::jsonb
)
WHERE conditions @> '[{"name": "Истощённый"}]'::jsonb;

-- 3. Insert six level-specific nodes.
WITH campaign AS (SELECT id FROM campaigns WHERE slug = 'mat-ucheniya'),
     ntype AS (
       SELECT nt.id
       FROM node_types nt
       JOIN campaigns c ON nt.campaign_id = c.id
       WHERE nt.slug = 'condition' AND c.slug = 'mat-ucheniya'
     )
INSERT INTO nodes (id, campaign_id, type_id, title, fields)
VALUES
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Истощение 1', '{
    "name_en": "Exhaustion 1",
    "description": "Помеха на проверки характеристик.",
    "tags": ["негативное", "накапливаемое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Истощение 2', '{
    "name_en": "Exhaustion 2",
    "description": "+ Скорость уменьшена вдвое.",
    "tags": ["негативное", "накапливаемое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Истощение 3', '{
    "name_en": "Exhaustion 3",
    "description": "+ Помеха на броски атаки и спасброски.",
    "tags": ["негативное", "накапливаемое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Истощение 4', '{
    "name_en": "Exhaustion 4",
    "description": "+ Максимальные ХП уменьшены вдвое.",
    "tags": ["негативное", "накапливаемое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Истощение 5', '{
    "name_en": "Exhaustion 5",
    "description": "+ Скорость уменьшена до 0.",
    "tags": ["негативное", "накапливаемое"]
  }'::jsonb),
  (gen_random_uuid(), (SELECT id FROM campaign), (SELECT id FROM ntype), 'Истощение 6', '{
    "name_en": "Exhaustion 6",
    "description": "Смерть.",
    "tags": ["негативное", "накапливаемое"]
  }'::jsonb)
ON CONFLICT DO NOTHING;
