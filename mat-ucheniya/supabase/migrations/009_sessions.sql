-- Migration: 009_sessions
-- Feature: Sessions with recaps and DM notes

CREATE TABLE sessions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  loop_number    int,                        -- which loop (nullable = outside loops)
  session_number int         NOT NULL,       -- global session number: 1, 2, 3…
  title          text,                       -- optional: "Бой в Гадком Койоте"
  recap          text        NOT NULL DEFAULT '', -- markdown: what happened (player-visible)
  dm_notes       text        NOT NULL DEFAULT '', -- markdown: DM private notes
  played_at      date,                       -- real-world date when played
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, session_number)
);

CREATE INDEX idx_sessions_campaign    ON sessions (campaign_id);
CREATE INDEX idx_sessions_loop        ON sessions (campaign_id, loop_number);
CREATE INDEX idx_sessions_number      ON sessions (campaign_id, session_number DESC);

CREATE OR REPLACE FUNCTION update_sessions_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_sessions_updated_at();

-- Seed: example sessions for mat-ucheniya campaign
-- Run after applying migration if you want test data
-- INSERT INTO sessions (campaign_id, loop_number, session_number, title, recap, played_at)
-- SELECT id, 1, 1, 'Знакомство с академией', 'Зориан просыпается в петле...', '2024-01-15'
-- FROM campaigns WHERE slug = 'mat-ucheniya';
