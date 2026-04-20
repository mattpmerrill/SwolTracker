/**
 * Onboarding completion helpers — used by the onboarding flow.
 */
export function createOnboardingRepo(supabase, { getProfile }) {
  const completeOnboarding = async (userId, onboardingData) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('complete_onboarding', {
        p_user_id: userId,
        p_display_name: onboardingData.displayName,
        p_gender: onboardingData.gender,
        p_age: onboardingData.age,
        p_weight_lbs: onboardingData.weightLbs,
        p_fitness_goals: onboardingData.fitnessGoals,
        p_workout_days: onboardingData.workoutDays,
        p_workout_duration: onboardingData.workoutDuration,
        p_workout_location: onboardingData.workoutLocation,
        p_equipment: onboardingData.equipment,
        p_program_start_date: onboardingData.programStartDate || new Date().toISOString().split('T')[0]
      })

    if (error) {
      console.error('Error completing onboarding:', error)
      return false
    }
    return data
  }

  const isOnboardingCompleted = async (userId) => {
    if (!supabase) return true
    const profile = await getProfile(userId)
    return profile?.onboarding_completed === true
  }

  return {
    completeOnboarding,
    isOnboardingCompleted,
  }
}
