-- Migration: encounter action log
-- Хронологический лог действий энкаунтера.
-- MVP: свободный текст от ДМа. В будущем: структурированные события + подтверждения.

CREATE TABLE encounter_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT 'ДМ',
  content text NOT NULL,
  -- Future: structured event data (action type, source, target, result)
  meta jsonb DEFAULT '{}',
  -- Future: confirmation workflow (pending/confirmed/rejected)
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_encounter_log_encounter ON encounter_log(encounter_id, created_at);
