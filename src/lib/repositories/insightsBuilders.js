import {
  DAY_ORDER,
  getCurrentWeekFromStartDate,
  parseReps,
  getAverage,
  getRecentWeekRange,
} from '../insightsHelpers'

export async function buildTrainingInsights(supabase, userId, gymId, lookbackWeeks = 4) {
  if (!supabase || !userId || !gymId) return null

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
  maxes.data?.forEach((entry) => { maxesMap[entry.exercise_name] = entry.weight_lbs })

  const completions = (completionsResult.data || []).filter((e) => e.week_number >= fromWeek)
  const missedDays = (missedDaysResult.data || []).filter((e) => e.week_number >= fromWeek)
  const programs = (programsResult.data || []).filter((e) => e.week_number >= fromWeek)
  const logs = (logsResult.data || []).filter((e) => e.week_number >= fromWeek)

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
    const ws = weekMap.get(entry.week_number)
    if (ws && !ws.completed_days.includes(entry.day_name)) ws.completed_days.push(entry.day_name)
  })

  missedDays.forEach((entry) => {
    const ws = weekMap.get(entry.week_number)
    if (ws) ws.missed_days.push({ day_name: entry.day_name, reason: entry.reason || null })
  })

  programs.forEach((entry) => {
    const ws = weekMap.get(entry.week_number)
    if (!ws) return
    ws.scheduled_days = DAY_ORDER.filter((day) => entry.program_data?.[day]?.exercises?.length > 0)
  })

  const sessionMap = new Map()
  logs.forEach((entry) => {
    const sessionKey = [entry.week_number, entry.day_name, entry.exercise_name].join('::')
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
    if (prescribedReps != null && actualReps < prescribedReps) session.hit_all_reps = false
  })

  Array.from(sessionMap.values())
    .sort((a, b) => {
      if (a.week_number !== b.week_number) return b.week_number - a.week_number
      return DAY_ORDER.indexOf(a.day_name) - DAY_ORDER.indexOf(b.day_name)
    })
    .forEach((session) => {
      const ws = weekMap.get(session.week_number)
      if (!ws) return
      ws.exercise_sessions.push({
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

  weeks.forEach((ws) => {
    ws.completed_days.sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b))
    ws.exercise_sessions.sort((a, b) => {
      const dc = DAY_ORDER.indexOf(a.day_name) - DAY_ORDER.indexOf(b.day_name)
      if (dc !== 0) return dc
      return a.exercise_name.localeCompare(b.exercise_name)
    })
  })

  const summaryLines = weeks.map((ws) => {
    const scheduledCount = ws.scheduled_days.length
    const completedCount = ws.completed_days.length
    const completionText = scheduledCount > 0
      ? `${completedCount}/${scheduledCount} scheduled days completed`
      : `${completedCount} days completed`

    const missedText = ws.missed_days.length
      ? ` Missed: ${ws.missed_days.map((d) => `${d.day_name}${d.reason ? ` (${d.reason})` : ''}`).join(', ')}.`
      : ''

    const topSessions = ws.exercise_sessions.slice(0, 4)
    const sessionText = topSessions.length
      ? ` Key lifts: ${topSessions.map((s) => `${s.day_name} ${s.exercise_name} ${s.sets_logged} sets @ ${s.avg_actual_weight || s.avg_prescribed_weight || 0} lbs${s.hit_all_reps ? ' hit' : ' missed'}`).join('; ')}.`
      : ''

    return `Week ${ws.week_number}: ${completionText}.${missedText}${sessionText}`.trim()
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
      `Current 1RMs: ${Object.keys(maxesMap).length ? Object.entries(maxesMap).map(([n, v]) => `${n} ${v} lbs`).join(', ') : 'None recorded'}.`,
      `Recommended next week: Week ${currentWeek + 1}.`,
    ].join('\n'),
    programs_context: programs.map((e) => ({ week_number: e.week_number, ai_notes: e.ai_notes || null })),
  }
}

export async function buildOverloadInsights(supabase, userId, gymId, lookbackWeeks = 4) {
  if (!supabase || !userId || !gymId) return null

  const history = await buildTrainingInsights(supabase, userId, gymId, lookbackWeeks)
  if (!history) return { recommendations: [], byExercise: {}, currentWeek: 1, lookbackWeeks }

  const sessionsByExercise = new Map()
  history.weeks.forEach((ws) => {
    ws.exercise_sessions.forEach((session) => {
      if (!sessionsByExercise.has(session.exercise_name)) sessionsByExercise.set(session.exercise_name, [])
      sessionsByExercise.get(session.exercise_name).push({ ...session, week_number: ws.week_number })
    })
  })

  const recommendations = []
  const byExercise = {}

  Array.from(sessionsByExercise.entries()).forEach(([exerciseName, sessions]) => {
    const ordered = [...sessions].sort((a, b) => {
      if (a.week_number !== b.week_number) return b.week_number - a.week_number
      return DAY_ORDER.indexOf(b.day_name) - DAY_ORDER.indexOf(a.day_name)
    })
    const latest = ordered[0]
    if (!latest) return

    let consecutiveHits = 0
    let consecutiveMisses = 0
    for (const s of ordered) {
      if (s.hit_all_reps) {
        if (consecutiveMisses > 0) break
        consecutiveHits += 1
      } else {
        if (consecutiveHits > 0) break
        consecutiveMisses += 1
      }
    }

    const weeksSinceLastSeen = history.current_week - latest.week_number
    let rec = null

    if (weeksSinceLastSeen >= 2) {
      rec = {
        exercise_name: exerciseName,
        type: 'stale',
        status_label: 'Stale',
        suggested_increment: 0,
        weeks_since_last_seen: weeksSinceLastSeen,
        last_seen_week: latest.week_number,
        message: `${exerciseName} has not been logged in ${weeksSinceLastSeen} weeks.`,
      }
    } else if (consecutiveHits >= 3) {
      rec = {
        exercise_name: exerciseName,
        type: 'increase',
        status_label: 'Ready to level up',
        suggested_increment: 5,
        streak_count: consecutiveHits,
        last_seen_week: latest.week_number,
        message: `${exerciseName} hit prescribed reps for ${consecutiveHits} straight sessions. Add 5 lbs next time.`,
      }
    } else if (consecutiveMisses >= 2) {
      rec = {
        exercise_name: exerciseName,
        type: 'deload',
        status_label: 'Check load',
        suggested_increment: 0,
        streak_count: consecutiveMisses,
        last_seen_week: latest.week_number,
        message: `${exerciseName} has missed prescribed reps for ${consecutiveMisses} straight sessions. Consider a deload or form check.`,
      }
    }

    if (!rec) return
    recommendations.push(rec)
    byExercise[exerciseName.toLowerCase()] = rec
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
      ? recommendations.map((e) => e.message).join('\n')
      : 'No overload recommendations right now.',
  }
}
