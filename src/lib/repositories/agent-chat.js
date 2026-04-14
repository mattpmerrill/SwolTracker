/**
 * Agent chat & coach notes repository
 */
export function createAgentChatRepo(supabase) {
  const getAgentMessages = async (userId, limit = 50, beforeId = null) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_agent_messages', {
        p_user_id: userId,
        p_limit: limit,
        p_before_id: beforeId,
      })

    if (error) {
      console.error('Error fetching agent messages:', error)
      return []
    }
    return data || []
  }

  const sendUserMessage = async (userId, content) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('send_agent_message', {
        p_user_id: userId,
        p_content: content,
        p_role: 'user',
        p_message_type: 'chat',
      })

    if (error) {
      console.error('Error sending agent message:', error)
      return null
    }
    return data
  }

  const hasUnreadAgentMessages = async (userId) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('has_unread_agent_messages', { p_user_id: userId })

    if (error) {
      console.error('Error checking unread agent messages:', error)
      return false
    }
    return data === true
  }

  const markAgentMessagesRead = async (userId) => {
    if (!supabase) return
    const { error } = await supabase
      .rpc('mark_agent_messages_read', { p_user_id: userId })

    if (error) {
      console.error('Error marking agent messages read:', error)
    }
  }

  const getLatestCoachNote = async (userId) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_latest_coach_note', { p_user_id: userId })

    if (error) {
      console.error('Error fetching latest coach note:', error)
      return null
    }
    return data?.[0] || null
  }

  const hasAgentKey = async (userId) => {
    if (!supabase) return false
    const { count, error } = await supabase
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('revoked_at', null)

    if (error) return false
    return (count || 0) > 0
  }

  const deleteAgentMessage = async (userId, messageId) => {
    if (!supabase) return false
    const { error } = await supabase
      .from('agent_messages')
      .delete()
      .eq('id', messageId)
      .eq('user_id', userId)
      .eq('role', 'user')

    if (error) {
      console.error('Error deleting agent message:', error)
      return false
    }
    return true
  }

  return {
    getAgentMessages,
    sendUserMessage,
    deleteAgentMessage,
    hasUnreadAgentMessages,
    markAgentMessagesRead,
    getLatestCoachNote,
    hasAgentKey,
  }
}
