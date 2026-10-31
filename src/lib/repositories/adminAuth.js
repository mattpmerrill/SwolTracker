import { chadUsageSchema } from '../validation'

/**
 * Admin gating + admin-only dashboard/user listing.
 */
export function createAdminAuthRepo(supabase) {
  const isAdmin = async (userId) => {
    if (!supabase || !userId) return false
    const { data, error } = await supabase
      .rpc('is_admin', { p_user_id: userId })

    if (error) {
      console.error('Error checking admin status:', error)
      return false
    }
    return data === true
  }

  const getAdminDashboardStats = async () => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_admin_dashboard_stats')

    if (error) {
      console.error('Error getting admin stats:', error)
      return null
    }
    return data
  }

  const getAllUsers = async () => {
    if (!supabase) return []
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data, error } = await supabase
      .rpc('get_all_users', { p_user_id: user.id })

    if (error) {
      console.error('Error getting all users:', error)
      return []
    }
    return data || []
  }

  /** Chad check-in usage for the last `days` days (admin only; the RPC refuses anyone else). */
  const getChadUsage = async (days = 30) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_chad_usage', { p_days: days })

    if (error) {
      console.error('Error getting Chad usage:', error)
      return null
    }
    const parsed = chadUsageSchema.safeParse(data)
    if (!parsed.success) {
      console.error('Chad usage had an unexpected shape:', parsed.error.issues[0]?.message)
      return null
    }
    return parsed.data
  }

  return {
    isAdmin,
    getAdminDashboardStats,
    getAllUsers,
    getChadUsage,
  }
}
