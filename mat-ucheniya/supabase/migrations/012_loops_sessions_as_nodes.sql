-- Migration: 012_loops_sessions_as_nodes
-- Feature: Spec-003 — Migrate loops and sessions into the entity graph (nodes + edges)
-- ⚠️ DESTRUCTIVE: drops loops and sessions tables at the end.
--    Deploy code changes in the SAME commit.

BEGIN;

-- ============================================================
-- 1. Add node_types: loop and session
-- ============================================================

INSERT INTO node_types (campaign_id, slug, label, icon, default_fields, sort_order)
SELECT
  c.id,
  'loop',
  'Петля',
  '🔄',
  '{"number": "", "title": "", "status": "past"}'::jsonb,
  20
FROM campaigns c
ON CONFLICT (campaign_id, slug) DO NOTHING;

INSERT INTO node_types (campaign_id, slug, label, icon, default_fields, sort_order)
SELECT
  c.id,
  'session',
  'Сессия',
  '📋',
  '{"session_number": "", "title": "", "recap": "", "dm_notes": "", "played_at": "", "game_date": "", "loop_number": ""}'::jsonb,
  21
FROM campaigns c
ON CONFLICT (campaign_id, slug) DO NOTHING;

-- ============================================================
-- 2. Migrate loops → nodes
-- ============================================================

-- We preserve the original UUID so that edit links (/loops/[id]/edit) keep working
INSERT INTO nodes (id, campaign_id, type_id, title, fields, content, created_at)
SELECT
  l.id,
  l.campaign_id,
  nt.id,
  COALESCE(l.title, 'Петля ' || l.number),
  jsonb_build_object(
    'number', l.number,
    'status', l.status
  ),
  COALESCE(l.notes, ''),
  l.created_at
FROM loops l
JOIN node_types nt ON nt.campaign_id = l.campaign_id AND nt.slug = 'loop';

-- ============================================================
-- 3. Migrate sessions → nodes
-- ============================================================

INSERT INTO nodes (id, campaign_id, type_id, title, fields, content, created_at)
SELECT
  s.id,
  s.campaign_id,
  nt.id,
  COALESCE(s.title, 'Сессия ' || s.session_number),
  jsonb_build_object(
    'session_number', s.session_number,
    'loop_number', s.loop_number,
    'recap', COALESCE(s.recap, ''),
    'dm_notes', COALESCE(s.dm_notes, ''),
    'played_at', COALESCE(s.played_at::text, ''),
    'game_date', COALESCE(s.game_date, '')
  ),
  '',
  s.created_at
FROM sessions s
JOIN node_types nt ON nt.campaign_id = s.campaign_id AND nt.slug = 'session';

-- ============================================================
-- 4. Create "contains" edges: loop → session
-- ============================================================

INSERT INTO edges (campaign_id, source_id, target_id, type_id, created_at)
SELECT
  s.campaign_id,
  l.id,          -- loop node id (same as original loops.id)
  s.id,          -- session node id (same as original sessions.id)
  et.id,
  now()
FROM sessions s
JOIN loops l ON l.campaign_id = s.campaign_id AND l.number = s.loop_number
JOIN edge_types et ON et.slug = 'contains' AND et.is_base = true
WHERE s.loop_number IS NOT NULL;

-- ============================================================
-- 5. Update search_vector trigger: index ALL text values from fields JSONB
-- ============================================================

CREATE OR REPLACE FUNCTION update_node_search_vector()
RETURNS trigger AS $$
DECLARE
  fields_text text := '';
  val text;
BEGIN
  -- Concatenate all text values from fields JSONB
  FOR val IN SELECT jsonb_each_text.value FROM jsonb_each_text(COALESCE(NEW.fields, '{}'::jsonb))
  LOOP
    fields_text := fields_text || ' ' || val;
  END LOOP;

  NEW.search_vector := to_tsvector('russian',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.content, '') || ' ' ||
    fields_text
  );
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. Rebuild search vectors for ALL nodes (including newly migrated)
-- ============================================================

UPDATE nodes SET updated_at = now();

-- ============================================================
-- 7. Drop old tables
-- ============================================================

DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS loops CASCADE;

COMMIT;
