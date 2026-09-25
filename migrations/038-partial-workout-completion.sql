-- Partial workout completion (option A).
-- Adds a completion_type ('full' | 'partial') plus the logged/planned set counts so a
-- half-finished day is recorded honestly instead of auto-filled to 100%.
ALTER TABLE workout_completions
  ADD COLUMN IF NOT EXISTS completion_type TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS logged_sets INT,
  ADD COLUMN IF NOT EXISTS planned_sets INT;

-- Existing rows predate partial logging: they were full completions by definition.
