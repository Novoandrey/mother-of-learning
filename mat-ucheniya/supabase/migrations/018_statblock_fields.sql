-- Migration 018: Full statblock fields for creature/npc nodes
-- Stage 1 of encounter tracker v4: right-panel statblock rendering.
--
-- Data shape added to nodes.fields (all JSONB):
--   actions, bonus_actions, reactions           : array of {name, desc, targeting, source}
--   legendary_actions                            : array of {name, desc, targeting, source, cost}
--   passives                                     : array of {name, desc, source}
--   legendary_budget                             : int
--   stats                                        : {str, dex, con, int, wis, cha}
--   saves                                        : {str?, dex?, con?, int?, wis?, cha?}
--   skills                                       : {stealth?, perception?, ...}
--   senses                                       : {passive_perception, darkvision?, blindsight?, ...}
--   speed                                        : {walk?, fly?, swim?, climb?, burrow?, hover?}
--   ac, ac_detail, hp, hit_dice, languages,
--   resistances, immunities, vulnerabilities,
--   condition_immunities, cr, type, size,
--   alignment, proficiency_bonus
--
-- Existing nodes (migration 014) keep working: only `description / max_hp /
-- statblock_url / tags` are set on them, missing fields default to null/[]
-- in app code.

UPDATE node_types
SET default_fields = '{
  "description": "textarea",
  "type": "text",
  "size": "text",
  "alignment": "text",
  "cr": "text",
  "ac": "number",
  "ac_detail": "text",
  "max_hp": "number",
  "hp": "number",
  "hit_dice": "text",
  "proficiency_bonus": "number",
  "stats": "json",
  "saves": "json",
  "skills": "json",
  "senses": "json",
  "speed": "json",
  "languages": "text",
  "resistances": "text",
  "immunities": "text",
  "vulnerabilities": "text",
  "condition_immunities": "text",
  "actions": "json",
  "bonus_actions": "json",
  "reactions": "json",
  "legendary_actions": "json",
  "legendary_budget": "number",
  "passives": "json",
  "statblock_url": "url",
  "source_doc": "text",
  "tags": "tags"
}'::jsonb
WHERE slug = 'creature';

-- Same extended shape applies to NPCs (they fight too).
UPDATE node_types
SET default_fields = '{
  "description": "textarea",
  "status": "text",
  "type": "text",
  "size": "text",
  "alignment": "text",
  "cr": "text",
  "ac": "number",
  "ac_detail": "text",
  "max_hp": "number",
  "hp": "number",
  "hit_dice": "text",
  "proficiency_bonus": "number",
  "stats": "json",
  "saves": "json",
  "skills": "json",
  "senses": "json",
  "speed": "json",
  "languages": "text",
  "resistances": "text",
  "immunities": "text",
  "vulnerabilities": "text",
  "condition_immunities": "text",
  "actions": "json",
  "bonus_actions": "json",
  "reactions": "json",
  "legendary_actions": "json",
  "legendary_budget": "number",
  "passives": "json",
  "statblock_url": "url",
  "source_doc": "text",
  "tags": "tags"
}'::jsonb
WHERE slug = 'npc';

-- GIN index on fields for future path queries (filter by cr, tags, type).
-- jsonb_path_ops is smaller/faster for @> containment queries which is what
-- filter UI will use ("give me all creatures where fields->>'type'='dragon'").
CREATE INDEX IF NOT EXISTS idx_nodes_fields_gin
  ON nodes USING gin (fields jsonb_path_ops);
