/**
 * App-wide key/value settings, LLM provider selection, and API usage logging.
 */
export function createAppSettingsRepo(supabase) {
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

  return {
    getLlmProvider,
    getAppSetting,
    saveAppSetting,
    getAllAppSettings,
    logApiUsage,
  }
}
