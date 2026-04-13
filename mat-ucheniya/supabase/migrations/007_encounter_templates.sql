-- 007_encounter_templates.sql
-- Feature: IDEA-001 Encounter Templates
-- Tables: encounter_templates, encounter_template_participants

CREATE TABLE encounter_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_encounter_templates_campaign ON encounter_templates(campaign_id);

CREATE TABLE encounter_template_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES encounter_templates(id) ON DELETE CASCADE,
  node_id uuid REFERENCES nodes(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  max_hp int NOT NULL DEFAULT 0,
  role text NOT NULL DEFAULT 'enemy',
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_template_participants_template ON encounter_template_participants(template_id);
