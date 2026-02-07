/**
 * Gyms, Equipment, Maxes, Workout Programs, Logs, Completions & Stats repository
 */
export function createWorkoutsRepo(supabase) {
  // Gyms
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
      return null
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

  // Equipment
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

  // User Maxes
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
    if (!supabase) return {}
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

  // Workout Programs
  const getWorkoutProgram = async (gymId, weekNumber) => {
    if (!supabase) return null
    const { data } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('gym_id', gymId)
      .eq('week_number', weekNumber)
      .single()
    return data
  }

  const getAllWorkoutPrograms = async (gymId) => {
    if (!supabase) return {}
    const { data } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('gym_id', gymId)
      .order('week_number')

    const programs = {}
    data?.forEach(p => { programs[p.week_number] = p.program_data })
    return programs
  }

  const saveWorkoutProgram = async (gymId, weekNumber, programData, userId, aiGenerated = false, aiNotes = null) => {
    if (!supabase) return null
    const { data } = await supabase
      .from('workout_programs')
      .upsert({
        gym_id: gymId,
        week_number: weekNumber,
        program_data: programData,
        created_by: userId,
        ai_generated: aiGenerated,
        ai_notes: aiNotes
      })
      .select()
      .single()
    return data
  }

  // Workout Logs
  const logSet = async (userId, gymId, weekNumber, dayName, exerciseIndex, setIndex, exerciseName, data) => {
    if (!supabase) return null
    const { data: log, error } = await supabase
      .from('workout_logs')
      .upsert({
        user_id: userId,
        gym_id: gymId,
        week_number: weekNumber,
        day_name: dayName,
        exercise_index: exerciseIndex,
        set_index: setIndex,
        exercise_name: exerciseName,
        prescribed_weight: data.prescribedWeight,
        prescribed_reps: data.prescribedReps,
        actual_weight: data.actualWeight || data.prescribedWeight,
        actual_reps: data.actualReps,
        completed: data.completed !== undefined ? data.completed : true
      }, {
        onConflict: 'user_id,gym_id,week_number,day_name,exercise_index,set_index'
      })
      .select()
      .single()

    if (error) {
      console.error('Error logging set:', error)
    }
    return log
  }

  const getWorkoutLogs = async (gymId, weekNumber, dayName = null) => {
    if (!supabase) return []
    let query = supabase
      .from('workout_logs')
      .select('*')
      .eq('gym_id', gymId)
      .eq('week_number', weekNumber)

    if (dayName) {
      query = query.eq('day_name', dayName)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching workout logs:', error)
    }
    return data || []
  }

  const getUserWorkoutLogs = async (userId, weekNumber, dayName = null) => {
    if (!supabase) return []
    let query = supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('week_number', weekNumber)

    if (dayName) {
      query = query.eq('day_name', dayName)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching user workout logs:', error)
    }
    return data || []
  }

  const getAllWorkoutLogs = async (gymId) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('gym_id', gymId)

    if (error) {
      console.error('Error fetching all workout logs:', error)
    }
    return data || []
  }

  const getRecentWorkoutLogs = async (userId, limit = 4) => {
    if (!supabase) return []

    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('completed', true)
      .order('completed_at', { ascending: false })

    if (error) {
      console.error('Error fetching recent workout logs:', error)
      return []
    }

    const sessionMap = new Map()
    data?.forEach(log => {
      const key = `${log.week_number}-${log.day_name}`
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          week_number: log.week_number,
          day_name: log.day_name,
          completed_at: log.completed_at,
          exercises: []
        })
      }
      sessionMap.get(key).exercises.push({
        exercise_name: log.exercise_name,
        prescribed_weight: log.prescribed_weight,
        prescribed_reps: log.prescribed_reps,
        actual_weight: log.actual_weight,
        actual_reps: log.actual_reps
      })
    })

    return Array.from(sessionMap.values())
      .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))
      .slice(0, limit)
  }

  // Workout Completions
  const markWorkoutComplete = async (userId, gymId, weekNumber, dayName) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('workout_completions')
      .upsert({
        user_id: userId,
        gym_id: gymId,
        week_number: weekNumber,
        day_name: dayName
      }, {
        onConflict: 'user_id,gym_id,week_number,day_name'
      })
      .select()
      .single()

    if (error) {
      console.error('Error marking workout complete:', error)
    }
    return data
  }

  const unmarkWorkoutComplete = async (userId, gymId, weekNumber, dayName) => {
    if (!supabase) return false
    const { error } = await supabase
      .from('workout_completions')
      .delete()
      .eq('user_id', userId)
      .eq('gym_id', gymId)
      .eq('week_number', weekNumber)
      .eq('day_name', dayName)

    if (error) {
      console.error('Error unmarking workout complete:', error)
      return false
    }
    return true
  }

  const getWorkoutCompletions = async (gymId) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('workout_completions')
      .select('*')
      .eq('gym_id', gymId)

    if (error) {
      console.error('Error fetching workout completions:', error)
      return []
    }
    return data || []
  }

  const getUserWorkoutCompletions = async (userId) => {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('workout_completions')
      .select('*')
      .eq('user_id', userId)

    if (error) {
      console.error('Error fetching user workout completions:', error)
      return []
    }
    return data || []
  }

  // Stats
  const getUserStats = async (userId) => {
    if (!supabase) return { totalSets: 0, weeksActive: 0 }
    const { data } = await supabase
      .from('workout_logs')
      .select('week_number')
      .eq('user_id', userId)
      .eq('completed', true)

    const weeks = new Set(data?.map(l => l.week_number) || [])
    return {
      totalSets: data?.length || 0,
      weeksActive: weeks.size
    }
  }

  return {
    // Gyms
    getMyGyms, createGym, joinGym, getGymMembers,
    // Equipment
    getGymEquipment, addEquipment, removeEquipment,
    // Maxes
    getUserMaxes, getAllGymMemberMaxes, updateMax, getMaxHistory, deleteMax,
    // Programs
    getWorkoutProgram, getAllWorkoutPrograms, saveWorkoutProgram,
    // Logs
    logSet, getWorkoutLogs, getUserWorkoutLogs, getAllWorkoutLogs, getRecentWorkoutLogs,
    // Completions
    markWorkoutComplete, unmarkWorkoutComplete, getWorkoutCompletions, getUserWorkoutCompletions,
    // Stats
    getUserStats,
  }
}
