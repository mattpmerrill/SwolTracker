-- Migration 019: Server-side admin check + rate limiting
-- Part of Phase 1 security hardening

-- ============================================
-- 1. Server-side admin check
-- ============================================

-- is_admin: checks if a user is an admin via the admin_emails app_settings row
-- Reads the 'admin_email' setting and compares against the user's email from auth.users
CREATE OR REPLACE FUNCTION is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_email text;
  v_user_email text;
BEGIN
  -- Get admin email from app_settings
  SELECT value INTO v_admin_email
  FROM app_settings
  WHERE key = 'admin_email';

  IF v_admin_email IS NULL THEN
    RETURN false;
  END IF;

  -- Get user's email from auth.users
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_user_email IS NULL THEN
    RETURN false;
  END IF;

  RETURN lower(v_user_email) = lower(v_admin_email);
END;
$$;

-- ============================================
-- 2. Rate limiting
-- ============================================

-- rate_limits table tracks per-user request counts
CREATE TABLE IF NOT EXISTS rate_limits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation text NOT NULL,
  request_count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, operation, window_start)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_user_op ON rate_limits(user_id, operation, window_start);

-- Enable RLS
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only the system (SECURITY DEFINER functions) should access this table
-- No direct user access
CREATE POLICY rate_limits_no_access ON rate_limits FOR ALL USING (false);

-- check_rate_limit: returns true if the request is allowed, false if rate limited
-- Atomically increments the counter for the current time window
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id uuid,
  p_operation text,
  p_max_requests int,
  p_window_minutes int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_window_start timestamptz;
  v_count int;
BEGIN
  -- Calculate the start of the current window
  v_window_start := date_trunc('minute', now())
    - (EXTRACT(minute FROM now())::int % p_window_minutes) * interval '1 minute';

  -- Clean up old entries for this user/operation (older than 2 windows)
  DELETE FROM rate_limits
  WHERE user_id = p_user_id
    AND operation = p_operation
    AND window_start < v_window_start - (p_window_minutes * interval '1 minute');

  -- Count requests in the current window
  SELECT COALESCE(SUM(request_count), 0) INTO v_count
  FROM rate_limits
  WHERE user_id = p_user_id
    AND operation = p_operation
    AND window_start >= v_window_start;

  -- Check if over limit
  IF v_count >= p_max_requests THEN
    RETURN false;
  END IF;

  -- Record this request
  INSERT INTO rate_limits (user_id, operation, request_count, window_start)
  VALUES (p_user_id, p_operation, 1, v_window_start)
  ON CONFLICT (user_id, operation, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1;

  RETURN true;
END;
$$;

-- ============================================
-- 3. Apply rate limits to existing RPC functions
-- ============================================

-- Rate limit buddy/member invites: 10/hour
CREATE OR REPLACE FUNCTION send_member_invite(p_inviter_id uuid, p_target_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed boolean;
  v_existing_request record;
  v_inviter_role text;
  v_target_role text;
  v_result jsonb;
BEGIN
  -- Rate limit check: 10 invites per hour
  SELECT check_rate_limit(p_inviter_id, 'buddy_request', 10, 60) INTO v_allowed;
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many invite requests. Please try again later.');
  END IF;

  -- Check for existing pending request in either direction
  SELECT * INTO v_existing_request
  FROM buddy_requests
  WHERE status = 'pending'
    AND ((leader_id = p_inviter_id AND member_id = p_target_id)
      OR (leader_id = p_target_id AND member_id = p_inviter_id));

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'A pending request already exists between you and this user.');
  END IF;

  -- Check inviter's current role
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE member_id = p_inviter_id AND status = 'accepted') THEN 'member'
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE leader_id = p_inviter_id AND status = 'accepted') THEN 'leader'
    ELSE 'independent'
  END INTO v_inviter_role;

  -- Check target's current role
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE member_id = p_target_id AND status = 'accepted') THEN 'member'
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE leader_id = p_target_id AND status = 'accepted') THEN 'leader'
    ELSE 'independent'
  END INTO v_target_role;

  -- Members can't be leaders
  IF v_target_role = 'leader' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user is already leading a group.');
  END IF;

  -- Members can't be re-invited
  IF v_target_role = 'member' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user is already in a group.');
  END IF;

  -- Determine leader_id based on inviter's role
  DECLARE
    v_leader_id uuid;
  BEGIN
    IF v_inviter_role = 'member' THEN
      -- Members invite on behalf of their leader
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
END;
$$;

-- Rate limit user search: 50/hour
CREATE OR REPLACE FUNCTION search_users(search_term text, current_user_id uuid)
RETURNS TABLE(user_id uuid, name text, email text, avatar text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  -- Rate limit check: 50 searches per hour
  SELECT check_rate_limit(current_user_id, 'user_search', 50, 60) INTO v_allowed;
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Too many search requests. Please try again later.';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.display_name AS name,
    u.email,
    p.avatar,
    p.avatar_url
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.id != current_user_id
    AND (
      p.display_name ILIKE '%' || search_term || '%'
      OR u.email ILIKE '%' || search_term || '%'
    )
  LIMIT 20;
END;
$$;

-- Rate limit chat messages: 60/minute
CREATE OR REPLACE FUNCTION send_group_message(p_user_id uuid, p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_allowed boolean;
  v_leader_id uuid;
  v_message_id uuid;
BEGIN
  -- Rate limit check: 60 messages per minute
  SELECT check_rate_limit(p_user_id, 'chat_message', 60, 1) INTO v_allowed;
  IF NOT v_allowed THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sending messages too fast. Please slow down.');
  END IF;

  -- Validate content
  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message cannot be empty.');
  END IF;

  IF length(p_content) > 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message is too long.');
  END IF;

  -- Find the leader_id for this user's group
  -- If user is a leader, leader_id = their own id
  -- If user is a member, get their leader
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM buddy_requests WHERE leader_id = p_user_id AND status = 'accepted')
      THEN p_user_id
    ELSE (SELECT br.leader_id FROM buddy_requests br WHERE br.member_id = p_user_id AND br.status = 'accepted' LIMIT 1)
  END INTO v_leader_id;

  IF v_leader_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You are not in a group.');
  END IF;

  -- Insert the message
  INSERT INTO group_messages (leader_id, sender_id, content)
  VALUES (v_leader_id, p_user_id, trim(p_content))
  RETURNING id INTO v_message_id;

  RETURN jsonb_build_object('success', true, 'message_id', v_message_id);
END;
$$;
