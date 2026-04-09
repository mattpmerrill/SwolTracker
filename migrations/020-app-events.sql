-- App events table for bot-native event system
-- Used by MCP server to emit events (PR detection, workout completion, etc.)

CREATE TABLE IF NOT EXISTS app_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  app_name text NOT NULL,
  event_name text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}',
  processed_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

-- Index for fetching unprocessed events per user
CREATE INDEX IF NOT EXISTS idx_app_events_user_pending
  ON app_events (user_id, app_name)
  WHERE processed_at IS NULL;

-- Index for cleanup of old processed events
CREATE INDEX IF NOT EXISTS idx_app_events_processed
  ON app_events (processed_at)
  WHERE processed_at IS NOT NULL;

-- RLS: users can only see their own events
ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own events"
  ON app_events FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (MCP server) bypasses RLS, so no INSERT policy needed for it
-- But allow inserts for the user's own events just in case
CREATE POLICY "Users can insert their own events"
  ON app_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own events"
  ON app_events FOR UPDATE
  USING (auth.uid() = user_id);
