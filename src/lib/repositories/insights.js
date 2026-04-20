import { buildTrainingInsights, buildOverloadInsights } from './insightsBuilders'

/**
 * Training history + overload insights repository.
 * Thin facade over insightsBuilders — adds null-safe defaults.
 */
export function createInsightsRepo(supabase) {
  const getTrainingHistorySummary = async (userId, gymId, lookbackWeeks = 4) => {
    const history = await buildTrainingInsights(supabase, userId, gymId, lookbackWeeks)
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
    const overload = await buildOverloadInsights(supabase, userId, gymId, lookbackWeeks)
    return overload || {
      recommendations: [],
      byExercise: {},
      currentWeek: 1,
      lookbackWeeks,
      summary: 'No overload recommendations right now.',
    }
  }

  return {
    getTrainingHistorySummary,
    getOverloadRecommendations,
  }
}
