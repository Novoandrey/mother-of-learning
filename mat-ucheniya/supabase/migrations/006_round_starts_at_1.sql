-- 006_round_starts_at_1.sql
ALTER TABLE encounters ALTER COLUMN current_round SET DEFAULT 1;
UPDATE encounters SET current_round = 1 WHERE current_round = 0;
