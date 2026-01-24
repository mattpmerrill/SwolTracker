-- ============================================
-- BUDDY REQUESTS TABLE
-- ============================================
CREATE TABLE buddy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sender_id, receiver_id)
);

-- Index for fast lookups
CREATE INDEX idx_buddy_requests_sender ON buddy_requests(sender_id);
CREATE INDEX idx_buddy_requests_receiver ON buddy_requests(receiver_id);
CREATE INDEX idx_buddy_requests_status ON buddy_requests(status);

-- Enable RLS
ALTER TABLE buddy_requests ENABLE ROW LEVEL SECURITY;

-- Users can see requests they sent or received
CREATE POLICY "buddy_requests_select" ON buddy_requests
  FOR SELECT USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Users can insert requests where they are the sender
CREATE POLICY "buddy_requests_insert" ON buddy_requests
  FOR INSERT WITH CHECK (sender_id = auth.uid());

-- Users can update requests where they are the receiver (to accept/decline)
CREATE POLICY "buddy_requests_update" ON buddy_requests
  FOR UPDATE USING (receiver_id = auth.uid());

-- Users can delete requests they're involved in (to remove buddy)
CREATE POLICY "buddy_requests_delete" ON buddy_requests
  FOR DELETE USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- ============================================
-- BUDDY HELPER FUNCTIONS
-- ============================================

-- Get all buddies (accepted requests in either direction)
CREATE OR REPLACE FUNCTION get_buddies(user_id UUID)
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
    CASE WHEN br.sender_id = user_id THEN br.receiver_id ELSE br.sender_id END as buddy_id,
    p.name as buddy_name,
    p.avatar as buddy_avatar,
    p.email as buddy_email,
    br.updated_at as connected_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = CASE WHEN br.sender_id = user_id THEN br.receiver_id ELSE br.sender_id END
  WHERE (br.sender_id = user_id OR br.receiver_id = user_id)
    AND br.status = 'accepted';
$$;

-- Get pending requests received
CREATE OR REPLACE FUNCTION get_received_requests(user_id UUID)
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
    br.sender_id,
    p.name as sender_name,
    p.avatar as sender_avatar,
    br.created_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.sender_id
  WHERE br.receiver_id = user_id AND br.status = 'pending';
$$;

-- Get pending requests sent
CREATE OR REPLACE FUNCTION get_sent_requests(user_id UUID)
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
    br.receiver_id,
    p.name as receiver_name,
    p.avatar as receiver_avatar,
    br.created_at
  FROM buddy_requests br
  JOIN profiles p ON p.id = br.receiver_id
  WHERE br.sender_id = user_id AND br.status = 'pending';
$$;

-- Search users (excluding self)
CREATE OR REPLACE FUNCTION search_users(search_term TEXT, current_user_id UUID)
RETURNS TABLE (
  user_id UUID,
  name TEXT,
  avatar TEXT,
  email TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id as user_id, name, avatar, email
  FROM profiles
  WHERE id != current_user_id
    AND (name ILIKE '%' || search_term || '%' OR email ILIKE '%' || search_term || '%')
  LIMIT 20;
$$;

-- Accept a buddy request
CREATE OR REPLACE FUNCTION accept_buddy_request(request_id UUID, user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE buddy_requests
  SET status = 'accepted', updated_at = NOW()
  WHERE id = request_id AND receiver_id = user_id AND status = 'pending';

  RETURN FOUND;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_buddies TO authenticated;
GRANT EXECUTE ON FUNCTION get_received_requests TO authenticated;
GRANT EXECUTE ON FUNCTION get_sent_requests TO authenticated;
GRANT EXECUTE ON FUNCTION search_users TO authenticated;
GRANT EXECUTE ON FUNCTION accept_buddy_request TO authenticated;
