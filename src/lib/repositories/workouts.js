/**
 * Gyms, Equipment, Maxes, Workout Programs, Logs, Completions & Stats repository
 */
export function createWorkoutsRepo(supabase) {
  const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

  const getCurrentWeekFromStartDate = (programStartDate) => {
    if (!programStartDate) return 1
    const start = new Date(programStartDate)
    if (Number.isNaN(start.getTime())) return 1

    const now = new Date()
    const diffMs = now.getTime() - start.getTime()
    if (diffMs <= 0) return 1

    return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1
  }

  const parseReps = (value) => {
    if (typeof value === 'number') return value
    if (typeof value !== 'string') return 0
    const match = value.match(/\d+/)
    return match ? parseInt(match[0], 10) : 0
  }

  const getAverage = (values) => {
    if (!values.length) return 0
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
  }

  const getRecentWeekRange = (currentWeek, lookbackWeeks) => {
    const safeLookback = Math.max(1, lookbackWeeks || 4)
    return {
      currentWeek,
      fromWeek: Math.max(1, currentWeek - safeLookback + 1),
      lookbackWeeks: safeLookback,
    }
  }

  const buildTrainingInsights = async (userId, gymId, lookbackWeeks = 4) => {
    if (!supabase || !userId || !gymId) {
      return null
    }

    const [profile, maxes, logsResult, completionsResult, missedDaysResult, programsResult] = await Promise.all([
      supabase.from('profiles').select('name, program_start_date').eq('id', userId).single(),
      supabase.from('current_user_maxes').select('exercise_name, weight_lbs').eq('user_id', userId),
      supabase
        .from('workout_logs')
        .select('week_number, day_name, exercise_name, actual_weight, actual_reps, prescribed_weight, prescribed_reps, completed_at')
        .eq('user_id', userId)
        .eq('gym_id', gymId)
        .eq('completed', true)
        .order('week_number', { ascending: false })
        .order('completed_at', { ascending: false }),
      supabase
        .from('workout_completions')
        .select('week_number, day_name')
        .eq('user_id', userId)
        .eq('gym_id', gymId),
      supabase
        .from('missed_days')
        .select('week_number, day_name, reason')
        .eq('user_id', userId)
        .eq('gym_id', gymId),
      supabase
        .from('workout_programs')
        .select('week_number, program_data, ai_notes')
        .eq('gym_id', gymId)
        .order('week_number', { ascending: false }),
    ])

    const currentWeek = getCurrentWeekFromStartDate(profile.data?.program_start_date)
    const { fromWeek, lookbackWeeks: safeLookback } = getRecentWeekRange(currentWeek, lookbackWeeks)

    const maxesMap = {}
    maxes.data?.forEach((entry) => {
      maxesMap[entry.exercise_name] = entry.weight_lbs
    })

    const completions = (completionsResult.data || []).filter((entry) => entry.week_number >= fromWeek)
    const missedDays = (missedDaysResult.data || []).filter((entry) => entry.week_number >= fromWeek)
    const programs = (programsResult.data || []).filter((entry) => entry.week_number >= fromWeek)
    const logs = (logsResult.data || []).filter((entry) => entry.week_number >= fromWeek)

    const weeks = []
    const weekMap = new Map()
    for (let week = fromWeek; week <= currentWeek; week += 1) {
      const weekSummary = {
        week_number: week,
        scheduled_days: [],
        completed_days: [],
        missed_days: [],
        exercise_sessions: [],
      }
      weeks.push(weekSummary)
      weekMap.set(week, weekSummary)
    }

    completions.forEach((entry) => {
      const weekSummary = weekMap.get(entry.week_number)
      if (weekSummary && !weekSummary.completed_days.includes(entry.day_name)) {
        weekSummary.completed_days.push(entry.day_name)
      }
    })

    missedDays.forEach((entry) => {
      const weekSummary = weekMap.get(entry.week_number)
      if (weekSummary) {
        weekSummary.missed_days.push({
          day_name: entry.day_name,
          reason: entry.reason || null,
        })
      }
    })

    programs.forEach((entry) => {
      const weekSummary = weekMap.get(entry.week_number)
      if (!weekSummary) return

      weekSummary.scheduled_days = DAY_ORDER.filter((day) => entry.program_data?.[day]?.exercises?.length > 0)
    })

    const sessionMap = new Map()
    logs.forEach((entry) => {
      const sessionKey = [
        entry.week_number,
        entry.day_name,
        entry.exercise_name,
      ].join('::')
      const actualReps = parseReps(entry.actual_reps)
      const prescribedReps = entry.prescribed_reps == null ? null : parseReps(entry.prescribed_reps)

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          week_number: entry.week_number,
          day_name: entry.day_name,
          exercise_name: entry.exercise_name,
          actual_weights: [],
          prescribed_weights: [],
          actual_reps: [],
          prescribed_reps: [],
          hit_all_reps: true,
          completed_at: entry.completed_at || null,
        })
      }

      const session = sessionMap.get(sessionKey)
      if (typeof entry.actual_weight === 'number') session.actual_weights.push(entry.actual_weight)
      if (typeof entry.prescribed_weight === 'number') session.prescribed_weights.push(entry.prescribed_weight)
      session.actual_reps.push(actualReps)
      if (prescribedReps != null) session.prescribed_reps.push(prescribedReps)
      if (prescribedReps != null && actualReps < prescribedReps) {
        session.hit_all_reps = false
      }
    })

    Array.from(sessionMap.values())
      .sort((a, b) => {
        if (a.week_number !== b.week_number) return b.week_number - a.week_number
        return DAY_ORDER.indexOf(a.day_name) - DAY_ORDER.indexOf(b.day_name)
      })
      .forEach((session) => {
        const weekSummary = weekMap.get(session.week_number)
        if (!weekSummary) return

        weekSummary.exercise_sessions.push({
          day_name: session.day_name,
          exercise_name: session.exercise_name,
          sets_logged: session.actual_reps.length,
          avg_actual_weight: getAverage(session.actual_weights),
          avg_prescribed_weight: getAverage(session.prescribed_weights),
          avg_actual_reps: getAverage(session.actual_reps),
          prescribed_reps: session.prescribed_reps[0] ?? null,
          hit_all_reps: session.hit_all_reps,
        })
      })

    weeks.forEach((weekSummary) => {
      weekSummary.completed_days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
      weekSummary.exercise_sessions.sort((a, b) => {
        const dayCompare = DAY_ORDER.indexOf(a.day_name) - DAY_ORDER.indexOf(b.day_name)
        if (dayCompare !== 0) return dayCompare
        return a.exercise_name.localeCompare(b.exercise_name)
      })
    })

    const summaryLines = weeks.map((weekSummary) => {
      const scheduledCount = weekSummary.scheduled_days.length
      const completedCount = weekSummary.completed_days.length
      const completionText = scheduledCount > 0
        ? `${completedCount}/${scheduledCount} scheduled days completed`
        : `${completedCount} days completed`

      const missedText = weekSummary.missed_days.length
        ? ` Missed: ${weekSummary.missed_days.map((day) => `${day.day_name}${day.reason ? ` (${day.reason})` : ''}`).join(', ')}.`
        : ''

      const topSessions = weekSummary.exercise_sessions.slice(0, 4)
      const sessionText = topSessions.length
        ? ` Key lifts: ${topSessions.map((session) => `${session.day_name} ${session.exercise_name} ${session.sets_logged} sets @ ${session.avg_actual_weight || session.avg_prescribed_weight || 0} lbs${session.hit_all_reps ? ' hit' : ' missed'}`).join('; ')}.`
        : ''

      return `Week ${weekSummary.week_number}: ${completionText}.${missedText}${sessionText}`.trim()
    })

    return {
      athlete_name: profile.data?.name || 'Athlete',
      current_week: currentWeek,
      next_week: currentWeek + 1,
      from_week: fromWeek,
      lookback_weeks: safeLookback,
      gym_id: gymId,
      maxes: maxesMap,
      weeks,
      summary: [
        `Training history for ${profile.data?.name || 'Athlete'} (last ${safeLookback} weeks):`,
        ...summaryLines,
        `Current 1RMs: ${Object.keys(maxesMap).length ? Object.entries(maxesMap).map(([name, value]) => `${name} ${value} lbs`).join(', ') : 'None recorded'}.`,
        `Recommended next week: Week ${currentWeek + 1}.`,
      ].join('\n'),
      programs_context: programs.map((entry) => ({
        week_number: entry.week_number,
        ai_notes: entry.ai_notes || null,
      })),
    }
  }

  const buildOverloadInsights = async (userId, gymId, lookbackWeeks = 4) => {
    if (!supabase || !userId || !gymId) {
      return null
    }

    const history = await buildTrainingInsights(userId, gymId, lookbackWeeks)
    if (!history) {
      return { recommendations: [], byExercise: {}, currentWeek: 1, lookbackWeeks }
    }

    const sessionsByExercise = new Map()
    history.weeks.forEach((weekSummary) => {
      weekSummary.exercise_sessions.forEach((session) => {
        if (!sessionsByExercise.has(session.exercise_name)) {
          sessionsByExercise.set(session.exercise_name, [])
        }
        sessionsByExercise.get(session.exercise_name).push({
          ...session,
          week_number: weekSummary.week_number,
        })
      })
    })

    const recommendations = []
    const byExercise = {}

    Array.from(sessionsByExercise.entries()).forEach(([exerciseName, sessions]) => {
      const orderedSessions = [...sessions].sort((a, b) => {
        if (a.week_number !== b.week_number) return b.week_number - a.week_number
        return DAY_ORDER.indexOf(b.day_name) - DAY_ORDER.indexOf(a.day_name)
      })
      const latest = orderedSessions[0]
      if (!latest) return

      let consecutiveHits = 0
      let consecutiveMisses = 0
      for (const session of orderedSessions) {
        if (session.hit_all_reps) {
          if (consecutiveMisses > 0) break
          consecutiveHits += 1
        } else {
          if (consecutiveHits > 0) break
          consecutiveMisses += 1
        }
      }

      const weeksSinceLastSeen = history.current_week - latest.week_number
      let recommendation = null

      if (weeksSinceLastSeen >= 2) {
        recommendation = {
          exercise_name: exerciseName,
          type: 'stale',
          status_label: 'Stale',
          suggested_increment: 0,
          weeks_since_last_seen: weeksSinceLastSeen,
          last_seen_week: latest.week_number,
          message: `${exerciseName} has not been logged in ${weeksSinceLastSeen} weeks.`,
        }
      } else if (consecutiveHits >= 3) {
        recommendation = {
          exercise_name: exerciseName,
          type: 'increase',
          status_label: 'Ready to level up',
          suggested_increment: 5,
          streak_count: consecutiveHits,
          last_seen_week: latest.week_number,
          message: `${exerciseName} hit prescribed reps for ${consecutiveHits} straight sessions. Add 5 lbs next time.`,
        }
      } else if (consecutiveMisses >= 2) {
        recommendation = {
          exercise_name: exerciseName,
          type: 'deload',
          status_label: 'Check load',
          suggested_increment: 0,
          streak_count: consecutiveMisses,
          last_seen_week: latest.week_number,
          message: `${exerciseName} has missed prescribed reps for ${consecutiveMisses} straight sessions. Consider a deload or form check.`,
        }
      }

      if (!recommendation) return

      recommendations.push(recommendation)
      byExercise[exerciseName.toLowerCase()] = recommendation
    })

    recommendations.sort((a, b) => {
      const priority = { increase: 0, deload: 1, stale: 2 }
      return priority[a.type] - priority[b.type]
    })

    return {
      recommendations,
      byExercise,
      currentWeek: history.current_week,
      lookbackWeeks: history.lookback_weeks,
      summary: recommendations.length
        ? recommendations.map((entry) => entry.message).join('\n')
        : 'No overload recommendations right now.',
    }
  }

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

  const getTrainingHistorySummary = async (userId, gymId, lookbackWeeks = 4) => {
    const history = await buildTrainingInsights(userId, gymId, lookbackWeeks)
    return history || {
      athlete_name: 'Athlete',
      current_week: 1,
      next_week: 2,
      from_week: 1,
      lookback_weeks: lookbackWeeks,
      gym_id: gymId,
      maxes: {},
      weeks: [],
      summary: 'No training history available.',
      programs_context: [],
    }
  }

  const getOverloadRecommendations = async (userId, gymId, lookbackWeeks = 4) => {
    const overload = await buildOverloadInsights(userId, gymId, lookbackWeeks)
    return overload || {
      recommendations: [],
      byExercise: {},
      currentWeek: 1,
      lookbackWeeks,
      summary: 'No overload recommendations right now.',
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
    getTrainingHistorySummary, getOverloadRecommendations,
  }
}
