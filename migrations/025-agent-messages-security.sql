-- ============================================
-- MIGRATION 025: Agent Messages Security Hardening
-- ============================================
-- Follow-up to 024. Hardens send_agent_message and ensures the DELETE policy
-- on agent_messages exists (it was present in production but not in the
-- committed migration 024 — adding it here so a fresh bootstrap matches prod).
--
-- 1. send_agent_message was SECURITY DEFINER and accepted any p_role and
--    p_user_id from any authenticated caller. A regular user could call the
--    RPC with p_role='agent' to forge coach notes, or with another user_id
--    to inject messages into someone else's inbox. This replaces the function
--    so non-service-role callers can only write role='user' messages to their
--    own inbox.
--
-- 2. Ensure the DELETE RLS policy exists so the client's deleteAgentMessage()
--    (src/lib/repositories/agent-chat.js) actually removes the row.

-- ---- DELETE policy (idempotent) ----------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'agent_messages' AND policyname = 'Users delete own messages'
  ) THEN
    CREATE POLICY "Users delete own messages" ON agent_messages
      FOR DELETE USING (user_id = auth.uid() AND role = 'user');
  END IF;
END $$;

-- ---- Harden send_agent_message -----------------------------------------

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
  v_caller_role TEXT;
BEGIN
  v_caller_role := auth.role();

  -- Only the MCP service (service_role JWT) can write as an agent or to
  -- another user's inbox. Regular authenticated callers are forced into
  -- the "user posting to their own inbox" shape.
  IF v_caller_role IS DISTINCT FROM 'service_role' THEN
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot send messages for another user');
    END IF;
    IF p_role = 'agent' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Only agents can send agent messages');
    END IF;
  END IF;

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

  INSERT INTO agent_messages (user_id, role, content, message_type, week_number, metadata)
  VALUES (p_user_id, p_role, trim(p_content), p_message_type, p_week_number, p_metadata)
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;

GRANT EXECUTE ON FUNCTION send_agent_message TO authenticated;
GRANT EXECUTE ON FUNCTION send_agent_message TO service_role;
