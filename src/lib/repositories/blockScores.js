/**
 * Scores for scored blocks (AMRAP / For Time), table workout_block_scores
 * (migration 043). Reads return null on failure and [] when there are simply
 * no rows, so the caller can show an error state instead of an empty one.
 */
const COLUMNS =
  'id, user_id, gym_id, week_number, day_name, block_id, benchmark, score_type, rounds, reps, time_seconds, capped, note'

export function createBlockScoresRepo(supabase) {
  /** Every score the user saved in one program week (all days, one gym). */
  const getBlockScoresForWeek = async (userId, gymId, weekNumber) => {
    if (!supabase || !userId || !gymId) return null
    const { data, error } = await supabase
      .from('workout_block_scores')
      .select(COLUMNS)
      .eq('user_id', userId)
      .eq('gym_id', gymId)
      .eq('week_number', weekNumber)
    if (error) {
      console.error('Error fetching block scores:', error)
      return null
    }
    return data || []
  }

  /**
   * The user's scores for these benchmarks from weeks BEFORE `beforeWeek`:
   * the pool the "number to beat" is picked from. Spans gyms on purpose, a
   * benchmark follows the lifter, not the program they followed that week.
   */
  const getBenchmarkScores = async (userId, benchmarks, beforeWeek) => {
    if (!supabase || !userId) return null
    if (!benchmarks?.length || !(beforeWeek > 1)) return []
    const { data, error } = await supabase
      .from('workout_block_scores')
      .select(COLUMNS)
      .eq('user_id', userId)
      .in('benchmark', benchmarks)
      .lte('week_number', beforeWeek - 1)
    if (error) {
      console.error('Error fetching benchmark scores:', error)
      return null
    }
    return data || []
  }

  const upsertBlockScore = async (userId, gymId, weekNumber, dayName, score) => {
    if (!supabase || !userId || !gymId) return null
    const { data, error } = await supabase
      .from('workout_block_scores')
      .upsert(
        {
          user_id: userId,
          gym_id: gymId,
          week_number: weekNumber,
          day_name: dayName,
          block_id: score.block_id,
          benchmark: score.benchmark ?? null,
          score_type: score.score_type,
          rounds: score.rounds ?? null,
          reps: score.reps ?? null,
          time_seconds: score.time_seconds ?? null,
          capped: Boolean(score.capped),
          note: score.note ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,gym_id,week_number,day_name,block_id' },
      )
      .select(COLUMNS)
      .single()
    if (error) {
      console.error('Error saving block score:', error)
      return null
    }
    return data
  }

  return { getBlockScoresForWeek, getBenchmarkScores, upsertBlockScore }
}
