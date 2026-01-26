-- ============================================
-- MIGRATION 011: Allow group members to send invites
-- ============================================
-- Enables group members (not just leaders) to invite others to the group.
-- When a member sends an invite, it's sent on behalf of their leader.

-- Create function for members to send invites on behalf of their leader
CREATE OR REPLACE FUNCTION send_member_invite(p_inviter_id UUID, p_target_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_leader_id UUID;
  v_existing_request UUID;
BEGIN
  -- Prevent self-invite
  IF p_inviter_id = p_target_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot invite yourself');
  END IF;

  -- Get the leader ID (either the inviter if they're a leader/independent, or their leader)
  SELECT COALESCE(
    (SELECT br.leader_id FROM buddy_requests br
     WHERE br.member_id = p_inviter_id AND br.status = 'accepted' LIMIT 1),
    p_inviter_id
  ) INTO v_leader_id;

  -- Check if target is already in a group
  IF EXISTS (SELECT 1 FROM buddy_requests WHERE member_id = p_target_id AND status = 'accepted') THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already in a group');
  END IF;

  -- Check if target is a leader (has followers)
  IF EXISTS (SELECT 1 FROM buddy_requests WHERE leader_id = p_target_id AND status = 'accepted') THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is a group leader and cannot join another group');
  END IF;

  -- Check if invite already exists
  IF EXISTS (SELECT 1 FROM buddy_requests WHERE leader_id = v_leader_id AND member_id = p_target_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite already sent');
  END IF;

  -- Create the invite
  INSERT INTO buddy_requests (leader_id, member_id, status)
  VALUES (v_leader_id, p_target_id, 'pending')
  RETURNING id INTO v_existing_request;

  RETURN jsonb_build_object('success', true, 'request_id', v_existing_request, 'leader_id', v_leader_id);
END;
$$;

GRANT EXECUTE ON FUNCTION send_member_invite TO authenticated;
