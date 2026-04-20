/**
 * Workout programs repository (weekly prescribed workouts as JSONB)
 */
export function createProgramsRepo(supabase) {
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

  return {
    getWorkoutProgram,
    getAllWorkoutPrograms,
    saveWorkoutProgram,
  }
}
