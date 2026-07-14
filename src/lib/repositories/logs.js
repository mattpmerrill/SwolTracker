/**
 * Workout logs, completions, and session stats repository
 */
export function createLogsRepo(supabase) {
  const normalizeActualReps = (value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number.parseInt(value, 10);
    return null;
  }

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
        actual_reps: normalizeActualReps(data.actualReps),
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

  /** Log a day as intentionally skipped/missed (upsert). Returns row or null. */
  const logMissedDay = async (userId, gymId, weekNumber, dayName, reason = null) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('missed_days')
      .upsert({
        user_id: userId,
        gym_id: gymId,
        week_number: weekNumber,
        day_name: dayName,
        reason: reason || null,
      }, {
        onConflict: 'user_id,gym_id,week_number,day_name',
      })
      .select()
      .single()

    if (error) {
      console.error('Error logging missed day:', error)
      return null
    }
    return data
  }

  /** Clear a missed-day mark. Returns true on success. */
  const clearMissedDay = async (userId, gymId, weekNumber, dayName) => {
    if (!supabase) return false
    const { error } = await supabase
      .from('missed_days')
      .delete()
      .eq('user_id', userId)
      .eq('gym_id', gymId)
      .eq('week_number', weekNumber)
      .eq('day_name', dayName)

    if (error) {
      console.error('Error clearing missed day:', error)
      return false
    }
    return true
  }

  /** All missed days for a gym (all members visible via RLS). */
  const getMissedDays = async (gymId, weekNumber = null) => {
    if (!supabase) return []
    let query = supabase
      .from('missed_days')
      .select('*')
      .eq('gym_id', gymId)
      .order('week_number', { ascending: false })

    if (weekNumber != null) {
      query = query.eq('week_number', weekNumber)
    }

    const { data, error } = await query
    if (error) {
      console.error('Error fetching missed days:', error)
      return []
    }
    return data || []
  }

  return {
    logSet,
    getWorkoutLogs,
    getUserWorkoutLogs,
    getAllWorkoutLogs,
    getRecentWorkoutLogs,
    markWorkoutComplete,
    unmarkWorkoutComplete,
    getWorkoutCompletions,
    getUserWorkoutCompletions,
    getUserStats,
    logMissedDay,
    clearMissedDay,
    getMissedDays,
  }
}
