-- ============================================
-- MIGRATION 024: Agent Messages & Coach Notes
-- ============================================
-- Enables two-way messaging between users and their AI agents.
-- Also used for weekly coach notes, program updates, and milestones.

-- Create agent_messages table
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'agent')),
  content TEXT NOT NULL CHECK (char_length(content) <= 5000),
  message_type TEXT DEFAULT 'chat' CHECK (message_type IN ('chat', 'weekly_review', 'program_update', 'milestone')),
  week_number INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_agent_messages_user ON agent_messages(user_id, created_at DESC);
CREATE INDEX idx_agent_messages_type ON agent_messages(user_id, message_type, created_at DESC);

-- Enable RLS
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own messages
CREATE POLICY "Users view own agent messages" ON agent_messages
  FOR SELECT USING (user_id = auth.uid());

-- Users can only insert messages with role='user' for themselves
CREATE POLICY "Users send own agent messages" ON agent_messages
  FOR INSERT WITH CHECK (user_id = auth.uid() AND role = 'user');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE agent_messages;

-- Agent read status (for unread indicators)
CREATE TABLE agent_read_status (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agent read status" ON agent_read_status
  FOR ALL USING (user_id = auth.uid());

-- ============================================
-- RPC FUNCTIONS
-- ============================================

-- Send an agent message (SECURITY DEFINER so MCP service role can insert role='agent')
CREATE OR REPLACE FUNCTION send_agent_message(
  p_user_id UUID,
  p_content TEXT,
  p_role TEXT DEFAULT 'user',
  p_message_type TEXT DEFAULT 'chat',
  p_week_number INTEGER DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message_id UUID;
BEGIN
  -- Validate
  IF p_content IS NULL OR char_length(trim(p_content)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot be empty');
  END IF;

  IF char_length(p_content) > 5000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message too long (max 5000 characters)');
  END IF;

  IF p_role NOT IN ('user', 'agent') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid role');
  END IF;

  IF p_message_type NOT IN ('chat', 'weekly_review', 'program_update', 'milestone') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid message type');
  END IF;

  -- Insert
  INSERT INTO agent_messages (user_id, role, content, message_type, week_number, metadata)
  VALUES (p_user_id, p_role, trim(p_content), p_message_type, p_week_number, p_metadata)
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION send_agent_message TO authenticated;

-- Get agent messages (paginated, newest first)
CREATE OR REPLACE FUNCTION get_agent_messages(
  p_user_id UUID,
  p_limit INT DEFAULT 50,
  p_before_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  role TEXT,
  content TEXT,
  message_type TEXT,
  week_number INTEGER,
  metadata JSONB,
  message_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.role,
    am.content,
    am.message_type,
    am.week_number,
    am.metadata,
    am.created_at as message_created_at
  FROM agent_messages am
  WHERE am.user_id = p_user_id
    AND (p_before_id IS NULL OR am.created_at < (SELECT am2.created_at FROM agent_messages am2 WHERE am2.id = p_before_id))
  ORDER BY am.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_agent_messages TO authenticated;

-- Get unread user messages (for agent polling via MCP)
CREATE OR REPLACE FUNCTION get_unread_user_messages(
  p_user_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  message_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_agent_msg TIMESTAMPTZ;
BEGIN
  -- Find when the agent last sent a message
  SELECT MAX(am.created_at) INTO v_last_agent_msg
  FROM agent_messages am
  WHERE am.user_id = p_user_id AND am.role = 'agent';

  RETURN QUERY
  SELECT
    am.id,
    am.content,
    am.created_at as message_created_at
  FROM agent_messages am
  WHERE am.user_id = p_user_id
    AND am.role = 'user'
    AND am.created_at > COALESCE(v_last_agent_msg, '1970-01-01'::timestamptz)
  ORDER BY am.created_at ASC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_unread_user_messages TO authenticated;

-- Check if user has unread agent messages
CREATE OR REPLACE FUNCTION has_unread_agent_messages(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_read TIMESTAMPTZ;
  v_has_unread BOOLEAN;
BEGIN
  SELECT last_read_at INTO v_last_read
  FROM agent_read_status
  WHERE user_id = p_user_id;

  SELECT EXISTS (
    SELECT 1 FROM agent_messages
    WHERE user_id = p_user_id
      AND role = 'agent'
      AND created_at > COALESCE(v_last_read, '1970-01-01'::timestamptz)
  ) INTO v_has_unread;

  RETURN v_has_unread;
END;
$$;

GRANT EXECUTE ON FUNCTION has_unread_agent_messages TO authenticated;

-- Mark agent messages as read
CREATE OR REPLACE FUNCTION mark_agent_messages_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO agent_read_status (user_id, last_read_at)
  VALUES (p_user_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET last_read_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_agent_messages_read TO authenticated;

-- Get latest coach note (weekly_review or program_update)
CREATE OR REPLACE FUNCTION get_latest_coach_note(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  content TEXT,
  message_type TEXT,
  week_number INTEGER,
  metadata JSONB,
  message_created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    am.id,
    am.content,
    am.message_type,
    am.week_number,
    am.metadata,
    am.created_at as message_created_at
  FROM agent_messages am
  WHERE am.user_id = p_user_id
    AND am.message_type IN ('weekly_review', 'program_update')
  ORDER BY am.created_at DESC
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION get_latest_coach_note TO authenticated;
