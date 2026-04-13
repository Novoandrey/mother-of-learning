-- 004_participant_role_temp_hp.sql
-- Add role (row coloring) and temp_hp to encounter participants

ALTER TABLE encounter_participants
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'enemy',
  ADD COLUMN IF NOT EXISTS temp_hp int DEFAULT 0;

-- Backfill: set existing participants linked to PC nodes as 'pc'
UPDATE encounter_participants ep
SET role = 'pc'
FROM nodes n
JOIN node_types nt ON n.type_id = nt.id
WHERE ep.node_id = n.id AND nt.slug = 'character';
