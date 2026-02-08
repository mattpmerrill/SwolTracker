/**
 * Admin, LLM config, Prompt templates, API usage, Onboarding & Error logging repository
 */
export function createAdminRepo(supabase, { getProfile }) {
  // Admin check — server-side via RPC
  const isAdmin = async (userId) => {
    if (!supabase || !userId) return false
    const { data, error } = await supabase
      .rpc('is_admin', { p_user_id: userId })

    if (error) {
      console.error('Error checking admin status:', error)
      return false
    }
    return data === true
  }

  // LLM Provider config
  const getLlmProvider = async () => {
    if (!supabase) return 'openai'
    const { data, error } = await supabase
      .rpc('get_llm_provider')

    if (error) {
      console.error('Error getting LLM provider:', error)
      return 'openai'
    }
    return data || 'openai'
  }

  // App Settings
  const getAppSetting = async (key) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_app_setting', { p_key: key })

    if (error) {
      console.error('Error getting app setting:', error)
      return null
    }
    return data
  }

  const saveAppSetting = async (key, value) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('save_app_setting', { p_key: key, p_value: value })

    if (error) {
      console.error('Error saving app setting:', error)
      return false
    }
    return data
  }

  const getAllAppSettings = async () => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_all_app_settings')

    if (error) {
      console.error('Error getting all app settings:', error)
      return []
    }
    return data || []
  }

  // Dashboard
  const getAdminDashboardStats = async () => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_admin_dashboard_stats')

    if (error) {
      console.error('Error getting admin stats:', error)
      return null
    }
    return data
  }

  // API Usage
  const logApiUsage = async (userId, requestType, model, promptTokens, completionTokens, success = true, errorMessage = null) => {
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
  }

  // Prompt Templates
  const getPromptTemplate = async (templateName) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .rpc('get_prompt_template', { template_name: templateName })

    if (error) {
      console.error('Error fetching prompt template:', error)
      return null
    }
    return data
  }

  const getAllPromptTemplates = async () => {
    if (!supabase) return []
    const { data, error } = await supabase
      .rpc('get_all_prompt_templates')

    if (error) {
      console.error('Error getting prompt templates:', error)
      return []
    }
    return data || []
  }

  const createPromptTemplate = async (name, description, template) => {
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
  }

  const updatePromptTemplate = async (id, name, description, template) => {
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
  }

  const deletePromptTemplate = async (id) => {
    if (!supabase) return false
    const { data, error } = await supabase
      .rpc('delete_prompt_template', { p_id: id })

    if (error) {
      console.error('Error deleting prompt template:', error)
      return false
    }
    return data
  }

  // Onboarding
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

  // Error Logging
  const logError = async (category, message, severity, userId, component, operation, stackTrace, context) => {
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
  }

  const getErrorLogs = async (options = {}) => {
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
  }

  const getErrorStats = async () => {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('get_error_stats')

    if (error) {
      console.error('Error fetching error stats:', error)
      return null
    }
    return data
  }

  const resolveError = async (errorId, notes = null) => {
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
  }

  const cleanupOldErrors = async () => {
    if (!supabase) return 0
    const { data, error } = await supabase.rpc('cleanup_old_errors')

    if (error) {
      console.error('Error cleaning up old errors:', error)
      return 0
    }
    return data || 0
  }

  return {
    // Admin
    isAdmin,
    // LLM Config
    getLlmProvider,
    // Settings
    getAppSetting, saveAppSetting, getAllAppSettings,
    // Dashboard
    getAdminDashboardStats,
    // API Usage
    logApiUsage,
    // Prompts
    getPromptTemplate, getAllPromptTemplates,
    createPromptTemplate, updatePromptTemplate, deletePromptTemplate,
    // Onboarding
    completeOnboarding, isOnboardingCompleted,
    // Errors
    logError, getErrorLogs, getErrorStats, resolveError, cleanupOldErrors,
  }
}
