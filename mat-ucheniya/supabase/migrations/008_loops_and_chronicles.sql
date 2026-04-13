-- Migration: 008_loops_and_chronicles
-- Feature: Loops timeline + Character chronicles

-- ============================================================
-- LOOPS
-- ============================================================

CREATE TABLE loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  number int NOT NULL,                          -- loop index: 1, 2, 3...
  title text,                                   -- optional DM name, e.g. "Петля пожара"
  status text NOT NULL DEFAULT 'past'           -- 'past' | 'current' | 'future'
    CHECK (status IN ('past', 'current', 'future')),
  notes text,                                   -- markdown freeform notes
  started_at date,                              -- in-game start date (nullable)
  ended_at date,                                -- in-game end date (nullable)
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, number)
);

CREATE INDEX idx_loops_campaign ON loops(campaign_id);

-- ============================================================
-- CHRONICLES
-- Freeform markdown entries attached to a node (character/npc)
-- and optionally to a loop + in-game date
-- ============================================================

CREATE TABLE chronicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  node_id uuid REFERENCES nodes(id) ON DELETE CASCADE,  -- nullable: campaign-wide entries
  title text NOT NULL,
  content text NOT NULL DEFAULT '',             -- markdown
  loop_number int,                              -- optional: which loop
  game_date text,                               -- optional: free text, e.g. "День 15"
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chronicles_campaign ON chronicles(campaign_id);
CREATE INDEX idx_chronicles_node ON chronicles(node_id);
CREATE INDEX idx_chronicles_loop ON chronicles(campaign_id, loop_number);

CREATE OR REPLACE FUNCTION update_chronicles_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chronicles_updated_at
  BEFORE UPDATE ON chronicles
  FOR EACH ROW
  EXECUTE FUNCTION update_chronicles_updated_at();
