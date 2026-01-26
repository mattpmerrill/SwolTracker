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

  // Avatar Storage
  async uploadAvatar(userId, file) {
    if (!supabase) return { error: 'Not configured' }

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${userId}/${Date.now()}.${fileExt}`

      // Delete any existing avatars for this user first
      const { data: existingFiles } = await supabase.storage
        .from('avatars')
        .list(userId)

      if (existingFiles?.length) {
        const filePaths = existingFiles.map(f => `${userId}/${f.name}`)
        await supabase.storage.from('avatars').remove(filePaths)
      }

      // Upload new avatar
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (error) return { error: error.message }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName)

      // Update profile with new avatar URL
      await this.updateProfile(userId, {
        avatar_url: publicUrl,
        avatar: null // Clear emoji when image is set
      })

      return { url: publicUrl }
    } catch (error) {
      console.error('Error uploading avatar:', error)
      return { error: error.message }
    }
  },

  async deleteAvatar(userId) {
    if (!supabase) return false

    try {
      // List and delete all files in user's folder
      const { data: files } = await supabase.storage
        .from('avatars')
        .list(userId)

      if (files?.length) {
        const filePaths = files.map(f => `${userId}/${f.name}`)
        await supabase.storage.from('avatars').remove(filePaths)
      }

      // Clear avatar_url in profile
      await this.updateProfile(userId, { avatar_url: null })
      return true
    } catch (error) {
      console.error('Error deleting avatar:', error)
      return false
    }
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

  async deleteMax(userId, exerciseName) {
    if (!supabase) return false
    const { error } = await supabase
      .from('user_maxes')
      .delete()
      .eq('user_id', userId)
      .eq('exercise_name', exerciseName)
    return !error
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
      .rpc('get_buddies', { p_user_id: userId })

    if (error) {
      console.error('Error fetching buddies:', error)
      return []
    }
    return data || []
  },

  async getReceivedRequests(userId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_received_requests', { p_user_id: userId })

    if (error) {
      console.error('Error fetching received requests:', error)
      return []
    }
    return data || []
  },

  async getSentRequests(userId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_sent_requests', { p_user_id: userId })

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
    // Now uses leader_id/member_id - sender becomes leader, receiver becomes member
    const { data, error } = await supabase
      .from('buddy_requests')
      .insert({ leader_id: senderId, member_id: receiverId })
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
    // Delete the buddy request (in either direction) - now uses leader_id/member_id
    const { error } = await supabase
      .from('buddy_requests')
      .delete()
      .or(`and(leader_id.eq.${userId},member_id.eq.${buddyId}),and(leader_id.eq.${buddyId},member_id.eq.${userId})`)

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

  // ============================================
  // WORKOUT GROUP FUNCTIONS
  // ============================================

  // Get user's group role (leader, member, or independent)
  async getGroupRole(userId) {
    if (!supabase) return { role: 'independent', leader_id: null, leader_name: null, leader_avatar: null, member_count: 0 }
    const { data, error } = await supabase
      .rpc('get_group_role', { p_user_id: userId })

    if (error) {
      console.error('Error getting group role:', error)
      return { role: 'independent', leader_id: null, leader_name: null, leader_avatar: null, member_count: 0 }
    }
    // Returns single row, but rpc returns array
    return data?.[0] || { role: 'independent', leader_id: null, leader_name: null, leader_avatar: null, member_count: 0 }
  },

  // Get all members following a leader
  async getGroupMembers(leaderId) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_group_members', { p_leader_id: leaderId })

    if (error) {
      console.error('Error getting group members:', error)
      return []
    }
    return data || []
  },

  // Get leader's gym ID (for members to load workouts)
  async getLeaderGymId(memberId) {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_leader_gym_id', { p_member_id: memberId })

    if (error) {
      console.error('Error getting leader gym ID:', error)
      return null
    }
    return data
  },

  // Accept group invite with validation
  async acceptGroupInvite(requestId, userId) {
    if (!supabase) return { success: false, error: 'Not configured' }
    const { data, error } = await supabase
      .rpc('accept_group_invite', { p_request_id: requestId, p_user_id: userId })

    if (error) {
      console.error('Error accepting group invite:', error)
      return { success: false, error: error.message }
    }
    return data || { success: false, error: 'Unknown error' }
  },

  // Leave workout group (for members)
  async leaveWorkoutGroup(memberId) {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('leave_workout_group', { p_member_id: memberId })

    if (error) {
      console.error('Error leaving workout group:', error)
      return false
    }
    return data
  },

  // Remove a member from group (for leaders)
  async removeGroupMember(leaderId, memberId) {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('remove_group_member', { p_leader_id: leaderId, p_member_id: memberId })

    if (error) {
      console.error('Error removing group member:', error)
      return false
    }
    return data
  },

  // Check if user can send invite (can be leader)
  async canSendInvite(userId) {
    if (!supabase) return true
    const { data, error } = await supabase
      .rpc('can_be_leader', { p_user_id: userId })

    if (error) {
      console.error('Error checking can be leader:', error)
      return false
    }
    return data
  },

  // Check if user can accept invite (can be member)
  async canAcceptInvite(userId) {
    if (!supabase) return true
    const { data, error } = await supabase
      .rpc('can_be_member', { p_user_id: userId })

    if (error) {
      console.error('Error checking can be member:', error)
      return false
    }
    return data
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
        p_equipment: onboardingData.equipment,
        p_program_start_date: onboardingData.programStartDate || new Date().toISOString().split('T')[0]
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
  },

  // ============================================
  // ADMIN FUNCTIONS
  // ============================================

  // Get the active LLM provider
  async getLlmProvider() {
    if (!supabase) return 'openai'
    const { data, error } = await supabase
      .rpc('get_llm_provider')

    if (error) {
      console.error('Error getting LLM provider:', error)
      return 'openai'
    }
    return data || 'openai'
  },

  // Get the global LLM API key for the active provider
  async getGlobalApiKey() {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_global_llm_api_key')

    if (error) {
      console.error('Error getting global API key:', error)
      return null
    }
    return data
  },

  // Get API key for a specific provider
  async getApiKeyForProvider(provider) {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_llm_api_key_for_provider', { p_provider: provider })

    if (error) {
      console.error('Error getting API key for provider:', error)
      return null
    }
    return data
  },

  // Check if a user is admin (by comparing email to env var)
  isAdmin(userEmail) {
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
    if (!adminEmail || !userEmail) return false
    return userEmail.toLowerCase() === adminEmail.toLowerCase()
  },

  // Get a single app setting
  async getAppSetting(key) {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_app_setting', { p_key: key })

    if (error) {
      console.error('Error getting app setting:', error)
      return null
    }
    return data
  },

  // Save an app setting (admin only)
  async saveAppSetting(key, value) {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('save_app_setting', { p_key: key, p_value: value })

    if (error) {
      console.error('Error saving app setting:', error)
      return false
    }
    return data
  },

  // Get all app settings (admin only)
  async getAllAppSettings() {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_all_app_settings')

    if (error) {
      console.error('Error getting all app settings:', error)
      return []
    }
    return data || []
  },

  // Get admin dashboard stats
  async getAdminDashboardStats() {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_admin_dashboard_stats')

    if (error) {
      console.error('Error getting admin stats:', error)
      return null
    }
    return data
  },

  // Log API usage
  async logApiUsage(userId, requestType, model, promptTokens, completionTokens, success = true, errorMessage = null) {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('log_api_usage', {
        p_user_id: userId,
        p_request_type: requestType,
        p_model: model,
        p_prompt_tokens: promptTokens,
        p_completion_tokens: completionTokens,
        p_success: success,
        p_error_message: errorMessage
      })

    if (error) {
      console.error('Error logging API usage:', error)
      return null
    }
    return data
  },

  // Get all prompt templates
  async getAllPromptTemplates() {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_all_prompt_templates')

    if (error) {
      console.error('Error getting prompt templates:', error)
      return []
    }
    return data || []
  },

  // Create a new prompt template (admin only)
  async createPromptTemplate(name, description, template) {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('create_prompt_template', {
        p_name: name,
        p_description: description,
        p_template: template
      })

    if (error) {
      console.error('Error creating prompt template:', error)
      return null
    }
    return data
  },

  // Update a prompt template (admin only)
  async updatePromptTemplate(id, name, description, template) {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('update_prompt_template', {
        p_id: id,
        p_name: name,
        p_description: description,
        p_template: template
      })

    if (error) {
      console.error('Error updating prompt template:', error)
      return false
    }
    return data
  },

  // Delete a prompt template (admin only)
  async deletePromptTemplate(id) {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('delete_prompt_template', { p_id: id })

    if (error) {
      console.error('Error deleting prompt template:', error)
      return false
    }
    return data
  },

  // ============================================
  // ERROR LOGGING FUNCTIONS
  // ============================================

  // Log an error to the database
  async logError(category, message, severity, userId, component, operation, stackTrace, context) {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('log_error', {
        p_category: category,
        p_message: message,
        p_severity: severity || 'error',
        p_user_id: userId,
        p_component: component,
        p_operation: operation,
        p_stack_trace: stackTrace,
        p_context: context
      })

    if (error) {
      console.error('Error logging error to database:', error)
      return null
    }
    return data
  },

  // Get error logs with filters (admin only)
  async getErrorLogs(options = {}) {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_error_logs', {
        p_limit: options.limit || 100,
        p_offset: options.offset || 0,
        p_category: options.category || null,
        p_severity: options.severity || null,
        p_resolved: options.resolved !== undefined ? options.resolved : null,
        p_user_id: options.userId || null,
        p_start_date: options.startDate || null,
        p_end_date: options.endDate || null
      })

    if (error) {
      console.error('Error fetching error logs:', error)
      return []
    }
    return data || []
  },

  // Get error statistics (admin only)
  async getErrorStats() {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('get_error_stats')

    if (error) {
      console.error('Error fetching error stats:', error)
      return null
    }
    return data
  },

  // Mark an error as resolved (admin only)
  async resolveError(errorId, notes = null) {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('resolve_error', {
        p_error_id: errorId,
        p_notes: notes
      })

    if (error) {
      console.error('Error resolving error:', error)
      return false
    }
    return data
  },

  // Clean up old resolved errors (admin only)
  async cleanupOldErrors() {
    if (!supabase) return 0
    const { data, error } = await supabase.rpc('cleanup_old_errors')

    if (error) {
      console.error('Error cleaning up old errors:', error)
      return 0
    }
    return data || 0
  }
}
