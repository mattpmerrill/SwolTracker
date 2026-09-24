-- Session notes: post-workout reflections + week session notes (slice 9.1).
-- Replaces the localStorage-only store in src/lib/sessionNotes.js so notes
-- survive a device switch and the MCP coach can read them.
CREATE TABLE IF NOT EXISTS session_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  day_name TEXT NOT NULL,
  label TEXT DEFAULT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, week_number, day_name)
);

CREATE INDEX IF NOT EXISTS idx_session_notes_user_week ON session_notes(user_id, week_number);

ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own session notes" ON session_notes
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
