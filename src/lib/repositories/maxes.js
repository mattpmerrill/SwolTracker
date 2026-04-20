/**
 * User 1RM (max) records repository
 */
export function createMaxesRepo(supabase, deps = {}) {
  const { getGymMembers } = deps

  const getUserMaxes = async (userId) => {
    if (!supabase) return {}
    const { data } = await supabase
      .from('current_user_maxes')
      .select('*')
      .eq('user_id', userId)

    const maxes = {}
    data?.forEach(m => { maxes[m.exercise_name] = m.weight_lbs })
    return maxes
  }

  const getAllGymMemberMaxes = async (gymId) => {
    if (!supabase || !getGymMembers) return {}
    const members = await getGymMembers(gymId)
    const result = {}

    for (const member of members) {
      result[member.id] = {
        profile: member,
        maxes: await getUserMaxes(member.id)
      }
    }
    return result
  }

  const updateMax = async (userId, exerciseName, weightLbs) => {
    if (!supabase) return null
    const { data } = await supabase
      .from('user_maxes')
      .insert({
        user_id: userId,
        exercise_name: exerciseName,
        weight_lbs: weightLbs
      })
      .select()
      .single()
    return data
  }

  const getMaxHistory = async (userId, exerciseName) => {
    if (!supabase) return []
    const { data } = await supabase
      .from('user_maxes')
      .select('*')
      .eq('user_id', userId)
      .eq('exercise_name', exerciseName)
      .order('recorded_at', { ascending: true })
    return data || []
  }

  const deleteMax = async (userId, exerciseName) => {
    if (!supabase) return false
    const { error } = await supabase
      .from('user_maxes')
      .delete()
      .eq('user_id', userId)
      .eq('exercise_name', exerciseName)
    return !error
  }

  return {
    getUserMaxes,
    getAllGymMemberMaxes,
    updateMax,
    getMaxHistory,
    deleteMax,
  }
}
