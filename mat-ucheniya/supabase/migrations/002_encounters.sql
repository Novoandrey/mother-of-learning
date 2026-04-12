-- Migration: 002_encounters
-- Feature: Encounter Tracker MVP (spec-002)
-- Tables: encounters, encounter_participants

-- ============================================================
-- ENCOUNTERS
-- ============================================================

CREATE TABLE encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  current_round int NOT NULL DEFAULT 0,
  current_turn_id uuid, -- FK added below (circular ref)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_encounters_campaign ON encounters(campaign_id);

-- ============================================================
-- ENCOUNTER PARTICIPANTS
-- ============================================================

CREATE TABLE encounter_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  node_id uuid REFERENCES nodes(id) ON DELETE SET NULL, -- nullable: manual entry
  display_name text NOT NULL,
  initiative numeric, -- null = bench, number = in combat
  max_hp int NOT NULL DEFAULT 0,
  current_hp int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_participants_encounter ON encounter_participants(encounter_id);
CREATE INDEX idx_participants_node ON encounter_participants(node_id);
CREATE INDEX idx_participants_initiative ON encounter_participants(
  encounter_id, initiative DESC NULLS LAST, sort_order
);

-- ============================================================
-- CIRCULAR FK: encounters.current_turn_id → encounter_participants
-- ============================================================

ALTER TABLE encounters
  ADD CONSTRAINT fk_encounters_current_turn
  FOREIGN KEY (current_turn_id) REFERENCES encounter_participants(id)
  ON DELETE SET NULL;

-- ============================================================
-- AUTO-UPDATE updated_at ON encounters
-- ============================================================

CREATE OR REPLACE FUNCTION update_encounters_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_encounters_updated_at
  BEFORE UPDATE ON encounters
  FOR EACH ROW
  EXECUTE FUNCTION update_encounters_updated_at();


