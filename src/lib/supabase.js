import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Running in demo mode.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Auth helpers
export const signInWithGoogle = async () => {
  if (!supabase) return { error: { message: 'Supabase not configured' } }

  return await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin
    }
  })
}

export const signOut = async () => {
  if (!supabase) return
  return await supabase.auth.signOut({ scope: 'local' })
}

export const getCurrentUser = async () => {
  if (!supabase) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// Database helpers
export const db = {
  // Profiles
  async getProfile(userId) {
    if (!supabase) return null
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    return data
  },

  async updateProfile(userId, updates) {
    if (!supabase) return null
    const { data } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single()
    return data
  },

  // Gyms
  async getMyGyms(userId) {
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
  },

  async createGym(name, userId) {
    if (!supabase) return null
    // Use database function to create gym and membership atomically
    const { data, error } = await supabase
      .rpc('create_user_gym', { user_id: userId, gym_name: name })

    if (error) {
      console.error('Error creating gym:', error)
      return null
    }

    // Return gym object with the ID
    return { id: data }
  },

  async joinGym(inviteCode, userId) {
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
  },

  async getGymMembers(gymId) {
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
  },

  // Equipment
  async getGymEquipment(gymId) {
    if (!supabase) return []
    const { data } = await supabase
      .from('gym_equipment')
      .select('*')
      .eq('gym_id', gymId)
    return data?.map(e => e.name) || []
  },

  async addEquipment(gymId, name) {
    if (!supabase) return null
    const { data } = await supabase
      .from('gym_equipment')
      .insert({ gym_id: gymId, name })
      .select()
      .single()
    return data
  },

  async removeEquipment(gymId, name) {
    if (!supabase) return
    await supabase
      .from('gym_equipment')
      .delete()
      .eq('gym_id', gymId)
      .eq('name', name)
  },

  // User Maxes
  async getUserMaxes(userId) {
    if (!supabase) return {}
    const { data } = await supabase
      .from('current_user_maxes')
      .select('*')
      .eq('user_id', userId)

    const maxes = {}
    data?.forEach(m => { maxes[m.exercise_name] = m.weight_lbs })
    return maxes
  },

  async getAllGymMemberMaxes(gymId) {
    if (!supabase) return {}
    const members = await this.getGymMembers(gymId)
    const result = {}

    for (const member of members) {
      result[member.id] = {
        profile: member,
        maxes: await this.getUserMaxes(member.id)
      }
    }
    return result
  },

  async updateMax(userId, exerciseName, weightLbs) {
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
  },

  async getMaxHistory(userId, exerciseName) {
    if (!supabase) return []
    const { data } = await supabase
      .from('user_maxes')
      .select('*')
      .eq('user_id', userId)
      .eq('exercise_name', exerciseName)
      .order('recorded_at', { ascending: true })
    return data || []
  },

  // Workout Programs
  async getWorkoutProgram(gymId, weekNumber) {
    if (!supabase) return null
    const { data } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('gym_id', gymId)
      .eq('week_number', weekNumber)
      .single()
    return data
  },

  async getAllWorkoutPrograms(gymId) {
    if (!supabase) return {}
    const { data } = await supabase
      .from('workout_programs')
      .select('*')
      .eq('gym_id', gymId)
      .order('week_number')

    const programs = {}
    data?.forEach(p => { programs[p.week_number] = p.program_data })
    return programs
  },

  async saveWorkoutProgram(gymId, weekNumber, programData, userId, aiGenerated = false, aiNotes = null) {
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
  },

  // Workout Logs
  async logSet(userId, gymId, weekNumber, dayName, exerciseIndex, setIndex, exerciseName, data) {
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
  },

  async getWorkoutLogs(gymId, weekNumber, dayName = null) {
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
  },

  async getUserWorkoutLogs(userId, weekNumber, dayName = null) {
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
  },

  async getAllWorkoutLogs(gymId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('gym_id', gymId)

    if (error) {
      console.error('Error fetching all workout logs:', error)
    }
    return data || []
  },

  // Stats
  async getUserStats(userId) {
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
  },

  // Buddy System
  async getBuddies(userId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_buddies', { user_id: userId })

    if (error) {
      console.error('Error fetching buddies:', error)
      return []
    }
    return data || []
  },

  async getReceivedRequests(userId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_received_requests', { user_id: userId })

    if (error) {
      console.error('Error fetching received requests:', error)
      return []
    }
    return data || []
  },

  async getSentRequests(userId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_sent_requests', { user_id: userId })

    if (error) {
      console.error('Error fetching sent requests:', error)
      return []
    }
    return data || []
  },

  async searchUsers(searchTerm, currentUserId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('search_users', { search_term: searchTerm, current_user_id: currentUserId })

    if (error) {
      console.error('Error searching users:', error)
      return []
    }
    return data || []
  },

  async sendBuddyRequest(senderId, receiverId) {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('buddy_requests')
      .insert({ sender_id: senderId, receiver_id: receiverId })
      .select()
      .single()

    if (error) {
      console.error('Error sending buddy request:', error)
      return null
    }
    return data
  },

  async acceptBuddyRequest(requestId, userId) {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('accept_buddy_request', { request_id: requestId, user_id: userId })

    if (error) {
      console.error('Error accepting buddy request:', error)
      return false
    }
    return data
  },

  async declineBuddyRequest(requestId) {
    if (!supabase) return false
    const { error } = await supabase
      .from('buddy_requests')
      .delete()
      .eq('id', requestId)

    if (error) {
      console.error('Error declining buddy request:', error)
      return false
    }
    return true
  },

  async removeBuddy(userId, buddyId) {
    if (!supabase) return false
    // Delete the buddy request (in either direction)
    const { error } = await supabase
      .from('buddy_requests')
      .delete()
      .or(`and(sender_id.eq.${userId},receiver_id.eq.${buddyId}),and(sender_id.eq.${buddyId},receiver_id.eq.${userId})`)

    if (error) {
      console.error('Error removing buddy:', error)
      return false
    }
    return true
  },

  async getBuddyProfile(buddyId) {
    if (!supabase) return null
    const profile = await this.getProfile(buddyId)
    const maxes = await this.getUserMaxes(buddyId)
    return profile ? { ...profile, maxes } : null
  },

  // Onboarding
  async completeOnboarding(userId, onboardingData) {
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
        p_equipment: onboardingData.equipment
      })

    if (error) {
      console.error('Error completing onboarding:', error)
      return false
    }
    return data
  },

  async getPromptTemplate(templateName) {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_prompt_template', { template_name: templateName })

    if (error) {
      console.error('Error fetching prompt template:', error)
      return null
    }
    return data
  },

  async isOnboardingCompleted(userId) {
    if (!supabase) return true // Assume completed in demo mode
    const profile = await this.getProfile(userId)
    return profile?.onboarding_completed === true
  }
}
