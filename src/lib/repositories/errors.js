/**
 * Error log repository — used by errorService + Admin → Error Logs UI.
 */
export function createErrorsRepo(supabase) {
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
    logError,
    getErrorLogs,
    getErrorStats,
    resolveError,
    cleanupOldErrors,
  }
}
