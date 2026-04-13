-- Migration 013: Add max_hp + statblock_url to NPC and creature (rename to Монстр)
-- FEAT-005: Auto-HP in encounters + statblock links

-- Rename creature label to "Монстр"
UPDATE node_types
SET label = 'Монстр',
    icon = '👹',
    default_fields = '{"description":"textarea","max_hp":"number","statblock_url":"url","tags":"tags"}'
WHERE slug = 'creature';

-- Add max_hp and statblock_url to NPC default_fields
UPDATE node_types
SET default_fields = '{"description":"textarea","status":"text","max_hp":"number","statblock_url":"url","tags":"tags"}'
WHERE slug = 'npc';
