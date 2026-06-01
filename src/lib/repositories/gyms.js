/**
 * Gyms, memberships, and equipment repository
 */
export function createGymsRepo(supabase) {
  const getMyGyms = async (userId) => {
    if (!supabase) return []
    const { data } = await supabase
      .from('gym_members')
      .select(`
        gym_id,
        role,
        gyms (
          id,
          name,
          invite_code,
          created_by
        )
      `)
      .eq('user_id', userId)
    return data?.map(m => ({ ...m.gyms, role: m.role })) || []
  }

  const createGym = async (name, userId) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('create_user_gym', { user_id: userId, gym_name: name })

    if (error) {
      console.error('Error creating gym:', error)
      // Surface the underlying error so callers (e.g. onboarding) can log
      // *why* it failed. Existing callers only read `?.id`, so attaching an
      // `error` field is non-breaking. Returning null here would discard the
      // reason — which is how the missing create_user_gym RPC (404) went
      // undiagnosed during onboarding until migration 031.
      return { id: null, error }
    }
    return { id: data }
  }

  const joinGym = async (inviteCode, userId) => {
    if (!supabase) return { error: 'Not configured' }
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('invite_code', inviteCode)
      .single()

    if (!gym) return { error: 'Invalid invite code' }

    const { error } = await supabase
      .from('gym_members')
      .insert({ gym_id: gym.id, user_id: userId, role: 'member' })

    return { gym, error }
  }

  const getGymMembers = async (gymId) => {
    if (!supabase) return []
    const { data } = await supabase
      .from('gym_members')
      .select(`
        user_id,
        role,
        profiles (
          id,
          name,
          avatar,
          email
        )
      `)
      .eq('gym_id', gymId)
    return data?.map(m => ({ ...m.profiles, role: m.role })) || []
  }

  const getGymEquipment = async (gymId) => {
    if (!supabase) return []
    const { data } = await supabase
      .from('gym_equipment')
      .select('*')
      .eq('gym_id', gymId)
    return data?.map(e => e.name) || []
  }

  const addEquipment = async (gymId, name) => {
    if (!supabase) return null
    const { data } = await supabase
      .from('gym_equipment')
      .insert({ gym_id: gymId, name })
      .select()
      .single()
    return data
  }

  const removeEquipment = async (gymId, name) => {
    if (!supabase) return
    await supabase
      .from('gym_equipment')
      .delete()
      .eq('gym_id', gymId)
      .eq('name', name)
  }

  return {
    getMyGyms, createGym, joinGym, getGymMembers,
    getGymEquipment, addEquipment, removeEquipment,
  }
}
