-- ============================================
-- BUDDY GROUPS MIGRATION
-- ============================================
-- This migration transforms the buddy system from peer-to-peer
-- to a leader/member workout sharing model.
--
-- Key changes:
-- 1. Rename sender_id -> leader_id, receiver_id -> member_id
-- 2. Add role-checking functions
-- 3. Add group management functions
-- 4. Update RLS policies for workout program sharing

-- ============================================
-- 1. SCHEMA CHANGES
-- ============================================

-- Rename columns for semantic clarity
ALTER TABLE buddy_requests RENAME COLUMN sender_id TO leader_id;
ALTER TABLE buddy_requests RENAME COLUMN receiver_id TO member_id;

-- Add constraint to prevent self-join
ALTER TABLE buddy_requests ADD CONSTRAINT no_self_join CHECK (leader_id != member_id);

-- Update unique constraint name (optional but cleaner)
ALTER TABLE buddy_requests DROP CONSTRAINT IF EXISTS buddy_requests_sender_id_receiver_id_key;
ALTER TABLE buddy_requests ADD CONSTRAINT buddy_requests_leader_member_unique UNIQUE (leader_id, member_id);

-- Update indexes
DROP INDEX IF EXISTS idx_buddy_requests_sender;
DROP INDEX IF EXISTS idx_buddy_requests_receiver;
CREATE INDEX idx_buddy_requests_leader ON buddy_requests(leader_id);
CREATE INDEX idx_buddy_requests_member ON buddy_requests(member_id);

-- ============================================
-- 2. UPDATE RLS POLICIES
-- ============================================

-- Drop old policies
DROP POLICY IF EXISTS "buddy_requests_select" ON buddy_requests;
DROP POLICY IF EXISTS "buddy_requests_insert" ON buddy_requests;
DROP POLICY IF EXISTS "buddy_requests_update" ON buddy_requests;
DROP POLICY IF EXISTS "buddy_requests_delete" ON buddy_requests;

-- Recreate with new column names
CREATE POLICY "buddy_requests_select" ON buddy_requests
  FOR SELECT USING (leader_id = auth.uid() OR member_id = auth.uid());

CREATE POLICY "buddy_requests_insert" ON buddy_requests
  FOR INSERT WITH CHECK (leader_id = auth.uid());

CREATE POLICY "buddy_requests_update" ON buddy_requests
  FOR UPDATE USING (member_id = auth.uid());

CREATE POLICY "buddy_requests_delete" ON buddy_requests
  FOR DELETE USING (leader_id = auth.uid() OR member_id = auth.uid());

-- ============================================
-- 3. ROLE CHECKING FUNCTIONS
-- ============================================

-- Check if user can be a leader (not following anyone)
CREATE OR REPLACE FUNCTION can_be_leader(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM buddy_requests
    WHERE member_id = p_user_id AND status = 'accepted'
  );
$$;

GRANT EXECUTE ON FUNCTION can_be_leader TO authenticated;

-- Check if user can be a member (has no followers)
CREATE OR REPLACE FUNCTION can_be_member(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM buddy_requests
    WHERE leader_id = p_user_id AND status = 'accepted'
  );
$$;

GRANT EXECUTE ON FUNCTION can_be_member TO authenticated;

-- Get user's group role and details
CREATE OR REPLACE FUNCTION get_group_role(p_user_id UUID)
RETURNS TABLE (
  role TEXT,
  leader_id UUID,
  leader_name TEXT,
  leader_avatar TEXT,
  member_count INT
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
  v_member_count INT;
BEGIN
  -- Check if user is a member (following someone)
  SELECT br.leader_id, p.name, p.avatar
  INTO v_leader_id, v_leader_name, v_leader_avatar
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.member_id = p_user_id AND br.status = 'accepted'
  LIMIT 1;

  IF v_leader_id IS NOT NULL THEN
    v_role := 'member';
    v_member_count := 0;
  ELSE
    -- Check if user is a leader (has followers)
    SELECT COUNT(*)::INT INTO v_member_count
    FROM buddy_requests
    WHERE leader_id = p_user_id AND status = 'accepted';

    IF v_member_count > 0 THEN
      v_role := 'leader';
    ELSE
      v_role := 'independent';
    END IF;
  END IF;

  RETURN QUERY SELECT v_role, v_leader_id, v_leader_name, v_leader_avatar, v_member_count;
END;
$$;

GRANT EXECUTE ON FUNCTION get_group_role TO authenticated;

-- ============================================
-- 4. GROUP MANAGEMENT FUNCTIONS
-- ============================================

-- Get all members following a leader
CREATE OR REPLACE FUNCTION get_group_members(p_leader_id UUID)
RETURNS TABLE (
  member_id UUID,
  member_name TEXT,
  member_avatar TEXT,
  member_email TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    br.member_id,
    p.name as member_name,
    p.avatar as member_avatar,
    p.email as member_email,
    br.updated_at as joined_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.member_id
  WHERE br.leader_id = p_leader_id AND br.status = 'accepted'
  ORDER BY br.updated_at;
$$;

GRANT EXECUTE ON FUNCTION get_group_members TO authenticated;

-- Get leader's gym ID for a member
CREATE OR REPLACE FUNCTION get_leader_gym_id(p_member_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT gm.gym_id
  FROM buddy_requests br
  JOIN gym_members gm ON gm.user_id = br.leader_id AND gm.role = 'owner'
  WHERE br.member_id = p_member_id AND br.status = 'accepted'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_leader_gym_id TO authenticated;

-- Accept group invite with validation
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
  -- Get the request details
  SELECT br.leader_id, p.name
  INTO v_leader_id, v_leader_name
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.id = p_request_id AND br.member_id = p_user_id AND br.status = 'pending';

  IF v_leader_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid request or already processed');
  END IF;

  -- Check if receiver can be a member (has no followers)
  SELECT can_be_member(p_user_id) INTO v_can_be_member;
  IF NOT v_can_be_member THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have followers. Remove them or have them leave first.');
  END IF;

  -- Check if inviter can still be a leader (hasn't become a member)
  SELECT can_be_leader(v_leader_id) INTO v_can_leader_be_leader;
  IF NOT v_can_leader_be_leader THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user has joined another group and can no longer lead.');
  END IF;

  -- Accept the request
  UPDATE buddy_requests
  SET status = 'accepted', updated_at = NOW()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'leader_id', v_leader_id,
    'leader_name', v_leader_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION accept_group_invite TO authenticated;

-- Leave workout group (for members)
CREATE OR REPLACE FUNCTION leave_workout_group(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM buddy_requests
  WHERE member_id = p_member_id AND status = 'accepted';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION leave_workout_group TO authenticated;

-- Remove a member from group (for leaders)
CREATE OR REPLACE FUNCTION remove_group_member(p_leader_id UUID, p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM buddy_requests
  WHERE leader_id = p_leader_id AND member_id = p_member_id AND status = 'accepted';

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION remove_group_member TO authenticated;

-- ============================================
-- 5. UPDATE EXISTING BUDDY FUNCTIONS
-- ============================================

-- Update get_buddies to use new column names (kept for backward compatibility during transition)
CREATE OR REPLACE FUNCTION get_buddies(p_user_id UUID)
RETURNS TABLE (
  buddy_id UUID,
  buddy_name TEXT,
  buddy_avatar TEXT,
  buddy_email TEXT,
  connected_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN br.leader_id = p_user_id THEN br.member_id ELSE br.leader_id END as buddy_id,
    p.name as buddy_name,
    p.avatar as buddy_avatar,
    p.email as buddy_email,
    br.updated_at as connected_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = CASE WHEN br.leader_id = p_user_id THEN br.member_id ELSE br.leader_id END
  WHERE (br.leader_id = p_user_id OR br.member_id = p_user_id)
    AND br.status = 'accepted';
$$;

-- Update get_received_requests
CREATE OR REPLACE FUNCTION get_received_requests(p_user_id UUID)
RETURNS TABLE (
  request_id UUID,
  sender_id UUID,
  sender_name TEXT,
  sender_avatar TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    br.id as request_id,
    br.leader_id as sender_id,
    p.name as sender_name,
    p.avatar as sender_avatar,
    br.created_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.leader_id
  WHERE br.member_id = p_user_id AND br.status = 'pending';
$$;

-- Update get_sent_requests
CREATE OR REPLACE FUNCTION get_sent_requests(p_user_id UUID)
RETURNS TABLE (
  request_id UUID,
  receiver_id UUID,
  receiver_name TEXT,
  receiver_avatar TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    br.id as request_id,
    br.member_id as receiver_id,
    p.name as receiver_name,
    p.avatar as receiver_avatar,
    br.created_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.member_id
  WHERE br.leader_id = p_user_id AND br.status = 'pending';
$$;

-- Update accept_buddy_request (kept for backward compatibility)
CREATE OR REPLACE FUNCTION accept_buddy_request(p_request_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Use the new validation function
  SELECT accept_group_invite(p_request_id, p_user_id) INTO v_result;
  RETURN (v_result->>'success')::BOOLEAN;
END;
$$;

-- ============================================
-- 6. ADD RLS POLICY FOR WORKOUT PROGRAM ACCESS
-- ============================================

-- Allow members to read workout programs from their leader's gym
CREATE POLICY "Members can view leader programs" ON workout_programs
  FOR SELECT USING (
    gym_id = get_leader_gym_id(auth.uid())
  );
