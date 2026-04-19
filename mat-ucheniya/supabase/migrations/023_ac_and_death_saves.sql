-- Migration 023: per-encounter AC + death saves for PCs.
--
-- Why the fields live on encounter_participants (not only on node.fields.ac):
--   1. AC can temporarily change mid-combat (spells, items, sunder).
--      A per-encounter override leaves the catalog node pristine.
--   2. New participants are seeded from node.fields.ac at insert time
--      (see addFromCatalog in lib/encounter-actions.ts); after that the
--      encounter row owns the value.
--   3. death_saves is an encounter-local concept by definition — a PC
--      does not carry failed death saves from one combat to the next.

ALTER TABLE encounter_participants
  ADD COLUMN IF NOT EXISTS ac int,
  ADD COLUMN IF NOT EXISTS death_saves jsonb NOT NULL DEFAULT '{"successes":0,"failures":0}'::jsonb;

COMMENT ON COLUMN encounter_participants.ac IS
  'Armor class effective for this encounter. Null = unknown/not tracked. Seeded from node.fields.ac when adding from catalog.';

COMMENT ON COLUMN encounter_participants.death_saves IS
  'Death saving throw progress for PCs at 0 HP. Shape: {"successes": 0..3, "failures": 0..3}. Reset when HP > 0 or encounter completes.';
