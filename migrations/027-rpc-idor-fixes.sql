-- ============================================
-- MIGRATION 027: RPC IDOR / Authorization Hardening
-- ============================================
-- Closes the cross-user authorization bugs flagged in SECURITY-REVIEW-2026-04.md:
--   F-002 agent-message RPCs accept arbitrary p_user_id (migration 024)
--   F-003 error-log RPCs have no admin check (migration 009)
--   F-004 buddy/group RPCs trust p_user_id parameter (migration 002)
--   F-005 send_member_invite allows spoofed invites (migrations 011 + 019)
--   F-008 complete_onboarding trusts p_user_id (onboarding-schema.sql)
--   F-009 log_api_usage accepts arbitrary p_user_id (migration 001)
--   F-012 log_error accepts arbitrary p_user_id (migration 009)
--
-- Pattern: every SECURITY DEFINER function that takes an identity parameter
-- must either compare it to auth.uid() or allow a service-role escape
-- (MCP server uses service-role key for agent actions).

-- ============================================
-- 0. HELPER: require caller identity
-- ============================================

CREATE OR REPLACE FUNCTION _require_self(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN;
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION _require_self(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _require_self(UUID) TO authenticated;

-- ============================================
-- F-002: agent-message RPCs (migration 024)
-- ============================================

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
  PERFORM _require_self(p_user_id);
  RETURN QUERY
  SELECT
    am.id, am.role, am.content, am.message_type,
    am.week_number, am.metadata, am.created_at
  FROM agent_messages am
  WHERE am.user_id = p_user_id
    AND (p_before_id IS NULL OR am.created_at < (SELECT am2.created_at FROM agent_messages am2 WHERE am2.id = p_before_id))
  ORDER BY am.created_at DESC
  LIMIT p_limit;
END;
$$;

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
  PERFORM _require_self(p_user_id);
  SELECT MAX(am.created_at) INTO v_last_agent_msg
  FROM agent_messages am
  WHERE am.user_id = p_user_id AND am.role = 'agent';

  RETURN QUERY
  SELECT am.id, am.content, am.created_at
  FROM agent_messages am
  WHERE am.user_id = p_user_id
    AND am.role = 'user'
    AND am.created_at > COALESCE(v_last_agent_msg, '1970-01-01'::timestamptz)
  ORDER BY am.created_at ASC
  LIMIT p_limit;
END;
$$;

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
  PERFORM _require_self(p_user_id);
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

CREATE OR REPLACE FUNCTION mark_agent_messages_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_self(p_user_id);
  INSERT INTO agent_read_status (user_id, last_read_at)
  VALUES (p_user_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
  SET last_read_at = NOW();
END;
$$;

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
  PERFORM _require_self(p_user_id);
  RETURN QUERY
  SELECT am.id, am.content, am.message_type,
         am.week_number, am.metadata, am.created_at
  FROM agent_messages am
  WHERE am.user_id = p_user_id
    AND am.message_type IN ('weekly_review', 'program_update')
  ORDER BY am.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================
-- F-003: error-log RPCs (migration 009) — require is_admin
-- ============================================

CREATE OR REPLACE FUNCTION get_error_logs(
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0,
  p_category TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_resolved BOOLEAN DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  severity TEXT,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  component TEXT,
  operation TEXT,
  message TEXT,
  stack_trace TEXT,
  context JSONB,
  resolved BOOLEAN,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id, e.category, e.severity, e.user_id,
    p.email, p.name,
    e.component, e.operation, e.message, e.stack_trace, e.context,
    e.resolved, e.resolved_at, e.resolution_notes, e.created_at
  FROM error_logs e
  LEFT JOIN profiles p ON e.user_id = p.id
  WHERE
    (p_category IS NULL OR e.category = p_category)
    AND (p_severity IS NULL OR e.severity = p_severity)
    AND (p_resolved IS NULL OR e.resolved = p_resolved)
    AND (p_user_id IS NULL OR e.user_id = p_user_id)
    AND (p_start_date IS NULL OR e.created_at >= p_start_date)
    AND (p_end_date IS NULL OR e.created_at <= p_end_date)
  ORDER BY e.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION get_error_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stats JSON;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'total_errors', (SELECT COUNT(*) FROM error_logs),
    'unresolved_errors', (SELECT COUNT(*) FROM error_logs WHERE resolved = FALSE),
    'errors_last_24h', (SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '24 hours'),
    'errors_last_7d', (SELECT COUNT(*) FROM error_logs WHERE created_at > NOW() - INTERVAL '7 days'),
    'by_category', COALESCE((
      SELECT json_object_agg(category, cnt)
      FROM (SELECT category, COUNT(*) as cnt FROM error_logs GROUP BY category) sub
    ), '{}'::json),
    'by_severity', COALESCE((
      SELECT json_object_agg(severity, cnt)
      FROM (SELECT severity, COUNT(*) as cnt FROM error_logs GROUP BY severity) sub
    ), '{}'::json),
    'critical_unresolved', (SELECT COUNT(*) FROM error_logs WHERE severity = 'critical' AND resolved = FALSE)
  ) INTO v_stats;

  RETURN v_stats;
END;
$$;

CREATE OR REPLACE FUNCTION resolve_error(
  p_error_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE error_logs
  SET resolved = TRUE,
      resolved_at = NOW(),
      resolved_by = auth.uid(),
      resolution_notes = p_notes
  WHERE id = p_error_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION cleanup_old_errors()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF NOT is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH deleted AS (
    DELETE FROM error_logs
    WHERE resolved = TRUE AND created_at < NOW() - INTERVAL '30 days'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  RETURN v_deleted;
END;
$$;

-- ============================================
-- F-012: log_error — force caller identity
-- ============================================

CREATE OR REPLACE FUNCTION log_error(
  p_category TEXT,
  p_message TEXT,
  p_severity TEXT DEFAULT 'error',
  p_user_id UUID DEFAULT NULL,
  p_component TEXT DEFAULT NULL,
  p_operation TEXT DEFAULT NULL,
  p_stack_trace TEXT DEFAULT NULL,
  p_context JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
BEGIN
  -- Ignore the parameter for authenticated callers; always attribute to auth.uid().
  -- Service-role callers (MCP server) may pass an explicit user_id on behalf of a user.
  IF auth.role() = 'service_role' THEN
    v_user_id := COALESCE(p_user_id, auth.uid());
  ELSE
    v_user_id := auth.uid();
  END IF;

  INSERT INTO error_logs (
    category, severity, user_id, component, operation,
    message, stack_trace, context
  ) VALUES (
    p_category,
    COALESCE(p_severity, 'error'),
    v_user_id,
    p_component,
    p_operation,
    p_message,
    p_stack_trace,
    p_context
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ============================================
-- F-004: buddy/group RPCs (migration 002)
-- ============================================

-- Matches the live signature after migrations 003/010/012 (includes leader_avatar_url, group_name).
CREATE OR REPLACE FUNCTION get_group_role(p_user_id UUID)
RETURNS TABLE (
  role TEXT,
  leader_id UUID,
  leader_name TEXT,
  leader_avatar TEXT,
  leader_avatar_url TEXT,
  member_count INT,
  group_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_leader_id UUID;
  v_leader_name TEXT;
  v_leader_avatar TEXT;
  v_leader_avatar_url TEXT;
  v_member_count INT;
  v_group_name TEXT;
BEGIN
  PERFORM _require_self(p_user_id);

  SELECT br.leader_id, p.name, p.avatar, p.avatar_url, p.group_name
  INTO v_leader_id, v_leader_name, v_leader_avatar, v_leader_avatar_url, v_group_name
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.member_id = p_user_id AND br.status = 'accepted'
  LIMIT 1;

  IF v_leader_id IS NOT NULL THEN
    v_role := 'member';
    v_member_count := 0;
  ELSE
    SELECT COUNT(*)::INT INTO v_member_count
    FROM buddy_requests br2
    WHERE br2.leader_id = p_user_id AND br2.status = 'accepted';

    IF v_member_count > 0 THEN
      v_role := 'leader';
      SELECT p.group_name INTO v_group_name
      FROM profiles p WHERE p.id = p_user_id;
    ELSE
      v_role := 'independent';
      SELECT p.group_name INTO v_group_name
      FROM profiles p WHERE p.id = p_user_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_role, v_leader_id, v_leader_name, v_leader_avatar, v_leader_avatar_url, v_member_count, v_group_name;
END;
$$;

-- Matches the live signature after migration 010 (includes member_avatar_url).
CREATE OR REPLACE FUNCTION get_group_members(p_leader_id UUID)
RETURNS TABLE (
  member_id UUID,
  member_name TEXT,
  member_avatar TEXT,
  member_avatar_url TEXT,
  member_email TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Anyone inside the same group may list its members (the leader, or any accepted member).
  IF auth.role() <> 'service_role' THEN
    IF p_leader_id IS DISTINCT FROM auth.uid()
       AND NOT EXISTS (
         SELECT 1 FROM buddy_requests
         WHERE leader_id = p_leader_id
           AND member_id = auth.uid()
           AND status = 'accepted'
       ) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    br.member_id,
    p.name,
    p.avatar,
    p.avatar_url,
    p.email,
    br.updated_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.member_id
  WHERE br.leader_id = p_leader_id AND br.status = 'accepted'
  ORDER BY br.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION get_leader_gym_id(p_member_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_self(p_member_id);
  RETURN (
    SELECT gm.gym_id
    FROM buddy_requests br
    JOIN gym_members gm ON gm.user_id = br.leader_id AND gm.role = 'owner'
    WHERE br.member_id = p_member_id AND br.status = 'accepted'
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION accept_group_invite(p_request_id UUID, p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
  v_leader_name TEXT;
  v_can_be_member BOOLEAN;
  v_can_leader_be_leader BOOLEAN;
BEGIN
  PERFORM _require_self(p_user_id);

  SELECT br.leader_id, p.name
  INTO v_leader_id, v_leader_name
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.id = p_request_id AND br.member_id = p_user_id AND br.status = 'pending';

  IF v_leader_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid request or already processed');
  END IF;

  SELECT can_be_member(p_user_id) INTO v_can_be_member;
  IF NOT v_can_be_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have followers. Remove them or have them leave first.');
  END IF;

  SELECT can_be_leader(v_leader_id) INTO v_can_leader_be_leader;
  IF NOT v_can_leader_be_leader THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user has joined another group and can no longer lead.');
  END IF;

  UPDATE buddy_requests
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object('success', true, 'leader_id', v_leader_id, 'leader_name', v_leader_name);
END;
$$;

CREATE OR REPLACE FUNCTION accept_buddy_request(p_request_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- accept_group_invite enforces _require_self; delegate.
  SELECT accept_group_invite(p_request_id, p_user_id) INTO v_result;
  RETURN (v_result->>'success')::BOOLEAN;
END;
$$;

CREATE OR REPLACE FUNCTION leave_workout_group(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_self(p_member_id);
  DELETE FROM buddy_requests
  WHERE member_id = p_member_id AND status = 'accepted';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION remove_group_member(p_leader_id UUID, p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Must be the leader making the call. Service-role escape preserved for MCP.
  IF auth.role() <> 'service_role' AND p_leader_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM buddy_requests
  WHERE leader_id = p_leader_id AND member_id = p_member_id AND status = 'accepted';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION get_buddies(p_user_id UUID)
RETURNS TABLE (
  buddy_id UUID,
  buddy_name TEXT,
  buddy_avatar TEXT,
  buddy_email TEXT,
  connected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_self(p_user_id);
  RETURN QUERY
  SELECT
    CASE WHEN br.leader_id = p_user_id THEN br.member_id ELSE br.leader_id END,
    p.name,
    p.avatar,
    p.email,
    br.updated_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = CASE WHEN br.leader_id = p_user_id THEN br.member_id ELSE br.leader_id END
  WHERE (br.leader_id = p_user_id OR br.member_id = p_user_id)
    AND br.status = 'accepted';
END;
$$;

CREATE OR REPLACE FUNCTION get_received_requests(p_user_id UUID)
RETURNS TABLE (
  request_id UUID,
  sender_id UUID,
  sender_name TEXT,
  sender_avatar TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_self(p_user_id);
  RETURN QUERY
  SELECT br.id, br.leader_id, p.name, p.avatar, br.created_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.member_id = p_user_id AND br.status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION get_sent_requests(p_user_id UUID)
RETURNS TABLE (
  request_id UUID,
  receiver_id UUID,
  receiver_name TEXT,
  receiver_avatar TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM _require_self(p_user_id);
  RETURN QUERY
  SELECT br.id, br.member_id, p.name, p.avatar, br.created_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.member_id
  WHERE br.leader_id = p_user_id AND br.status = 'pending';
END;
$$;

-- ============================================
-- F-005: send_member_invite — force inviter = auth.uid()
-- ============================================

CREATE OR REPLACE FUNCTION send_member_invite(p_inviter_id UUID, p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed BOOLEAN;
  v_existing_request RECORD;
  v_inviter_role TEXT;
  v_target_role TEXT;
  v_leader_id UUID;
BEGIN
  PERFORM _require_self(p_inviter_id);

  IF p_inviter_id = p_target_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot invite yourself');
  END IF;

  -- Rate limit check: 10 invites per hour
  SELECT check_rate_limit(p_inviter_id, 'buddy_request', 10, 60) INTO v_allowed;
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many invite requests. Please try again later.');
  END IF;

  -- Existing pending request in either direction
  SELECT * INTO v_existing_request
  FROM buddy_requests
  WHERE status = 'pending'
    AND ((leader_id = p_inviter_id AND member_id = p_target_id)
      OR (leader_id = p_target_id AND member_id = p_inviter_id));

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'A pending request already exists between you and this user.');
  END IF;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE member_id = p_inviter_id AND status = 'accepted') THEN 'member'
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE leader_id = p_inviter_id AND status = 'accepted') THEN 'leader'
    ELSE 'independent'
  END INTO v_inviter_role;

  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE member_id = p_target_id AND status = 'accepted') THEN 'member'
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE leader_id = p_target_id AND status = 'accepted') THEN 'leader'
    ELSE 'independent'
  END INTO v_target_role;

  IF v_target_role = 'leader' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user is already leading a group.');
  END IF;

  IF v_target_role = 'member' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user is already in a group.');
  END IF;

  IF v_inviter_role = 'member' THEN
    SELECT leader_id INTO v_leader_id
    FROM buddy_requests
    WHERE member_id = p_inviter_id AND status = 'accepted'
    LIMIT 1;
  ELSE
    v_leader_id := p_inviter_id;
  END IF;

  INSERT INTO buddy_requests (leader_id, member_id, status)
  VALUES (v_leader_id, p_target_id, 'pending');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ============================================
-- F-008: complete_onboarding — must be the caller
-- ============================================

CREATE OR REPLACE FUNCTION complete_onboarding(
  p_user_id UUID,
  p_display_name TEXT,
  p_gender TEXT,
  p_age INTEGER,
  p_weight_lbs NUMERIC,
  p_fitness_goals TEXT[],
  p_workout_days TEXT[],
  p_workout_duration TEXT,
  p_workout_location TEXT,
  p_equipment TEXT[],
  p_program_start_date DATE DEFAULT CURRENT_DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  gym_id_var UUID;
BEGIN
  PERFORM _require_self(p_user_id);

  UPDATE profiles SET
    display_name = p_display_name,
    gender = p_gender,
    age = p_age,
    weight_lbs = p_weight_lbs,
    fitness_goals = p_fitness_goals,
    workout_days = p_workout_days,
    workout_duration = p_workout_duration,
    workout_location = p_workout_location,
    program_start_date = p_program_start_date,
    onboarding_completed = TRUE,
    onboarding_completed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;

  SELECT gym_id INTO gym_id_var
  FROM gym_members
  WHERE user_id = p_user_id
  LIMIT 1;

  IF gym_id_var IS NOT NULL THEN
    DELETE FROM gym_equipment WHERE gym_id = gym_id_var;
    INSERT INTO gym_equipment (gym_id, name)
    SELECT gym_id_var, unnest(p_equipment);
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================
-- F-009: log_api_usage — force caller identity
-- ============================================

CREATE OR REPLACE FUNCTION log_api_usage(
  p_user_id UUID,
  p_request_type TEXT,
  p_model TEXT,
  p_prompt_tokens INTEGER DEFAULT NULL,
  p_completion_tokens INTEGER DEFAULT NULL,
  p_success BOOLEAN DEFAULT TRUE,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_tokens INTEGER;
  v_cost NUMERIC(10, 6);
  v_log_id UUID;
  v_user_id UUID;
BEGIN
  -- Service-role callers (MCP server / api/llm.js) may attribute to a specific user.
  -- Authenticated callers can only log for themselves.
  IF auth.role() = 'service_role' THEN
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  v_total_tokens := COALESCE(p_prompt_tokens, 0) + COALESCE(p_completion_tokens, 0);

  v_cost := CASE
    WHEN p_model LIKE 'gpt-4o-mini%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.00000015 + COALESCE(p_completion_tokens, 0) * 0.0000006)
    WHEN p_model LIKE 'gpt-4o%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000005 + COALESCE(p_completion_tokens, 0) * 0.000015)
    WHEN p_model LIKE 'gpt-4%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.00003 + COALESCE(p_completion_tokens, 0) * 0.00006)
    WHEN p_model LIKE 'gpt-3.5%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.0000005 + COALESCE(p_completion_tokens, 0) * 0.0000015)
    WHEN p_model LIKE 'claude-3-5-sonnet%' OR p_model LIKE 'claude-3-sonnet%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000003 + COALESCE(p_completion_tokens, 0) * 0.000015)
    WHEN p_model LIKE 'claude-3-haiku%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.00000025 + COALESCE(p_completion_tokens, 0) * 0.00000125)
    WHEN p_model LIKE 'claude-3-opus%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000015 + COALESCE(p_completion_tokens, 0) * 0.000075)
    WHEN p_model LIKE 'gemini-1.5-pro%' OR p_model LIKE 'gemini-pro%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.0000035 + COALESCE(p_completion_tokens, 0) * 0.0000105)
    WHEN p_model LIKE 'gemini-1.5-flash%' OR p_model LIKE 'gemini-flash%' THEN
      (COALESCE(p_prompt_tokens, 0) * 0.000000075 + COALESCE(p_completion_tokens, 0) * 0.0000003)
    ELSE 0
  END;

  INSERT INTO api_usage_logs (
    user_id, request_type, model, prompt_tokens, completion_tokens,
    total_tokens, estimated_cost_usd, success, error_message
  ) VALUES (
    v_user_id, p_request_type, p_model, p_prompt_tokens, p_completion_tokens,
    v_total_tokens, v_cost, p_success, p_error_message
  ) RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- ============================================
-- Re-grant execute on replaced functions (CREATE OR REPLACE preserves grants,
-- but a couple changed signature / language, so re-grant defensively).
-- ============================================

GRANT EXECUTE ON FUNCTION get_agent_messages(UUID, INT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_user_messages(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION has_unread_agent_messages(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_agent_messages_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_latest_coach_note(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION get_error_logs(INTEGER, INTEGER, TEXT, TEXT, BOOLEAN, UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION get_error_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_error(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_old_errors() TO authenticated;
GRANT EXECUTE ON FUNCTION log_error(TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

GRANT EXECUTE ON FUNCTION get_group_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_group_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_leader_gym_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_group_invite(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_buddy_request(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_workout_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION remove_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_buddies(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_received_requests(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_sent_requests(UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION send_member_invite(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_onboarding(UUID, TEXT, TEXT, INTEGER, NUMERIC, TEXT[], TEXT[], TEXT, TEXT, TEXT[], DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION log_api_usage(UUID, TEXT, TEXT, INTEGER, INTEGER, BOOLEAN, TEXT) TO authenticated;
