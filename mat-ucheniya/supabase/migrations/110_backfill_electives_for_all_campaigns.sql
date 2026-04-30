-- Migration 110 — Backfill `elective` node_type and `has_elective`
-- edge_type for every campaign on this instance.
--
-- TECH-015 from ultrareview-2 (chat 80, 2026-04-30).
--
-- Background:
--   Migration 029 introduced electives but hardcoded
--   `WHERE c.slug = 'mat-ucheniya'`, so any second campaign on the
--   same deployment would have no elective node_type and no
--   has_elective edge_type — the feature would silently be missing
--   from its UI.
--
--   `seedCampaignSrd` (lib/seeds/dnd5e-srd.ts), the sidemic that
--   `initializeCampaignFromTemplate` calls when a campaign is
--   created, did not include electives either. This migration
--   backfills existing campaigns; the seeder code is patched in
--   the same commit so future campaigns pick electives up at create
--   time.
--
-- Idempotency: both tables have the right unique indexes, so the
--   ON CONFLICT clauses make the migration safe to re-run.

BEGIN;

-- 1. node_type 'elective' for every campaign that doesn't have one.
INSERT INTO node_types (campaign_id, slug, label, icon, default_fields, sort_order)
SELECT
  c.id,
  'elective',
  'Факультатив',
  '🎓',
  '{"kind":"","link":"","comment":""}'::jsonb,
  100
FROM campaigns c
ON CONFLICT (campaign_id, slug) DO NOTHING;

-- 2. edge_type 'has_elective' for every campaign that doesn't have one.
--    Stays campaign-specific (is_base = false) to mirror migration 029.
--    A future migration may promote it to is_base = true if electives
--    turn out to be universal — kept conservative for now.
--    The unique index `idx_edge_types_campaign` is partial
--    (WHERE campaign_id IS NOT NULL), Postgres infers it from the
--    column list — no need to repeat the WHERE clause here.
INSERT INTO edge_types (campaign_id, slug, label, is_base)
SELECT c.id, 'has_elective', 'взял факультатив', false
FROM campaigns c
ON CONFLICT (campaign_id, slug) DO NOTHING;

COMMIT;

-- Verify (manual, after apply):
--   -- 1. Every campaign has an elective node_type:
--   SELECT c.slug AS campaign, nt.slug AS type_slug
--     FROM campaigns c
--     LEFT JOIN node_types nt
--       ON nt.campaign_id = c.id AND nt.slug = 'elective';
--   -- Expected: no rows where type_slug IS NULL.
--
--   -- 2. Every campaign has a has_elective edge_type:
--   SELECT c.slug AS campaign, et.slug AS edge_slug
--     FROM campaigns c
--     LEFT JOIN edge_types et
--       ON et.campaign_id = c.id AND et.slug = 'has_elective';
--   -- Expected: no rows where edge_slug IS NULL.
