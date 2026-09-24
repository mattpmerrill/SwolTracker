/**
 * Session notes (post-workout reflections) persisted server-side (slice 9.1).
 * Rows are returned in the legacy shape { day, text, label } so the existing
 * week-end prefill and post-workout prompt consumers are unchanged.
 */
export function createSessionNotesRepo(supabase) {
  const getSessionNotes = async (userId, weekNumber) => {
    if (!supabase || !userId) return []
    const { data, error } = await supabase
      .from('session_notes')
      .select('day_name, label, text')
      .eq('user_id', userId)
      .eq('week_number', weekNumber)
      .order('created_at', { ascending: true })
    if (error) {
      console.error('Error fetching session notes:', error)
      return []
    }
    return (data || []).map((r) => ({ day: r.day_name, text: r.text, label: r.label }))
  }

  const upsertSessionNote = async (userId, weekNumber, dayName, text, label = null) => {
    if (!supabase || !userId) return null
    const body = (text || '').trim()
    if (!body) return null
    const { data, error } = await supabase
      .from('session_notes')
      .upsert(
        { user_id: userId, week_number: weekNumber, day_name: dayName, text: body, label: label || null },
        { onConflict: 'user_id,week_number,day_name' },
      )
      .select()
      .single()
    if (error) {
      console.error('Error saving session note:', error)
      return null
    }
    return data
  }

  return { getSessionNotes, upsertSessionNote }
}
