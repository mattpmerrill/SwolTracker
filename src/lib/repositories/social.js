/**
 * Buddy system, Workout groups & Chat repository
 */
export function createSocialRepo(supabase, { getProfile, getUserMaxes }) {
  // Buddy System
  const getBuddies = async (userId) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_buddies', { p_user_id: userId })

    if (error) {
      console.error('Error fetching buddies:', error)
      return []
    }
    return data || []
  }

  const getReceivedRequests = async (userId) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_received_requests', { p_user_id: userId })

    if (error) {
      console.error('Error fetching received requests:', error)
      return []
    }
    return data || []
  }

  const getSentRequests = async (userId) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_sent_requests', { p_user_id: userId })

    if (error) {
      console.error('Error fetching sent requests:', error)
      return []
    }
    return data || []
  }

  const searchUsers = async (searchTerm) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('search_users', { search_term: searchTerm })

    if (error) {
      console.error('Error searching users:', error)
      // Surface rate limit errors
      if (error.message?.includes('Too many')) {
        return { rateLimited: true, error: error.message }
      }
      return []
    }
    return data || []
  }

  const sendBuddyRequest = async (senderId, receiverId) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('buddy_requests')
      .insert({ leader_id: senderId, member_id: receiverId })
      .select()
      .single()

    if (error) {
      console.error('Error sending buddy request:', error)
      return null
    }
    return data
  }

  const sendMemberInvite = async (inviterId, targetId) => {
    if (!supabase) return { success: false, error: 'Not configured' }
    const { data, error } = await supabase
      .rpc('send_member_invite', { p_inviter_id: inviterId, p_target_id: targetId })

    if (error) {
      console.error('Error sending member invite:', error)
      return { success: false, error: error.message }
    }
    return data
  }

  const acceptBuddyRequest = async (requestId, userId) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('accept_buddy_request', { request_id: requestId, user_id: userId })

    if (error) {
      console.error('Error accepting buddy request:', error)
      return false
    }
    return data
  }

  const declineBuddyRequest = async (requestId) => {
    if (!supabase) return false
    const { error } = await supabase
      .from('buddy_requests')
      .delete()
      .eq('id', requestId)

    if (error) {
      console.error('Error declining buddy request:', error)
      return false
    }
    return true
  }

  const removeBuddy = async (userId, buddyId) => {
    if (!supabase) return false
    // Delete in both directions using separate safe queries (no string interpolation)
    const { error: err1 } = await supabase
      .from('buddy_requests')
      .delete()
      .eq('leader_id', userId)
      .eq('member_id', buddyId)

    const { error: err2 } = await supabase
      .from('buddy_requests')
      .delete()
      .eq('leader_id', buddyId)
      .eq('member_id', userId)

    if (err1 && err2) {
      console.error('Error removing buddy:', err1)
      return false
    }
    return true
  }

  const getBuddyProfile = async (buddyId) => {
    if (!supabase) return null
    const profile = await getProfile(buddyId)
    const maxes = await getUserMaxes(buddyId)
    return profile ? { ...profile, maxes } : null
  }

  // Workout Groups
  const getGroupRole = async (userId) => {
    if (!supabase) {
      return {
        role: 'independent',
        leader_id: null,
        leader_name: null,
        leader_avatar: null,
        leader_avatar_url: null,
        member_count: 0,
        group_name: null,
      }
    }
    const { data, error } = await supabase
      .rpc('get_group_role', { p_user_id: userId })

    if (error) {
      console.error('Error getting group role:', error.message || error)
      return {
        role: 'independent',
        leader_id: null,
        leader_name: null,
        leader_avatar: null,
        leader_avatar_url: null,
        member_count: 0,
        group_name: null,
      }
    }
    const row = Array.isArray(data) ? data[0] : data
    return row || {
      role: 'independent',
      leader_id: null,
      leader_name: null,
      leader_avatar: null,
      leader_avatar_url: null,
      member_count: 0,
      group_name: null,
    }
  }

  const getGroupMembers = async (leaderId) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_group_members', { p_leader_id: leaderId })

    if (error) {
      // Log full error — ambiguous-column / forbidden show up here (see migration 033).
      console.error('Error getting group members:', error.message || error, error)
      return []
    }
    return Array.isArray(data) ? data : (data ? [data] : [])
  }

  const getLeaderGymId = async (memberId) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_leader_gym_id', { p_member_id: memberId })

    if (error) {
      console.error('Error getting leader gym ID:', error)
      return null
    }
    return data
  }

  const acceptGroupInvite = async (requestId, userId) => {
    if (!supabase) return { success: false, error: 'Not configured' }
    const { data, error } = await supabase
      .rpc('accept_group_invite', { p_request_id: requestId, p_user_id: userId })

    if (error) {
      console.error('Error accepting group invite:', error)
      return { success: false, error: error.message }
    }
    return data || { success: false, error: 'Unknown error' }
  }

  const leaveWorkoutGroup = async (memberId) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('leave_workout_group', { p_member_id: memberId })

    if (error) {
      console.error('Error leaving workout group:', error)
      return false
    }
    return data
  }

  const removeGroupMember = async (leaderId, memberId) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('remove_group_member', { p_leader_id: leaderId, p_member_id: memberId })

    if (error) {
      console.error('Error removing group member:', error)
      return false
    }
    return data
  }

  const canSendInvite = async (userId) => {
    if (!supabase) return true
    const { data, error } = await supabase
      .rpc('can_be_leader', { p_user_id: userId })

    if (error) {
      console.error('Error checking can be leader:', error)
      return false
    }
    return data
  }

  const canAcceptInvite = async (userId) => {
    if (!supabase) return true
    const { data, error } = await supabase
      .rpc('can_be_member', { p_user_id: userId })

    if (error) {
      console.error('Error checking can be member:', error)
      return false
    }
    return data
  }

  return {
    // Buddies
    getBuddies, getReceivedRequests, getSentRequests,
    searchUsers, sendBuddyRequest, sendMemberInvite,
    acceptBuddyRequest, declineBuddyRequest, removeBuddy, getBuddyProfile,
    // Groups
    getGroupRole, getGroupMembers, getLeaderGymId,
    acceptGroupInvite, leaveWorkoutGroup, removeGroupMember,
    canSendInvite, canAcceptInvite,
  }
}
