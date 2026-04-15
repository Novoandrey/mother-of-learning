-- Migration 017: Structured encounter events
-- IDEA-026 increment 3: each event = JSON {actor, action, target, result, round, turn}
-- encounter_log stays for manual DM text (fallback).
-- encounter_events = auto-generated structured timeline.

CREATE TABLE encounter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  -- Who did it (participant display_name)
  actor text,
  -- What happened: hp_damage, hp_heal, condition_add, condition_remove,
  -- effect_add, effect_remove, turn_start, turn_end, round_start, custom
  action text NOT NULL,
  -- Who was affected (display_name or null for global events)
  target text,
  -- Outcome / details as JSON (delta, from, to, name, etc.)
  result jsonb DEFAULT '{}',
  -- Combat coordinates
  round integer,
  turn text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_encounter_events_encounter
  ON encounter_events(encounter_id, created_at);
