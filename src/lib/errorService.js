// Centralized error handling utilities for SwolTracker

// Error categories
export const ErrorCategory = {
  LLM: 'llm',
  DATABASE: 'database',
  PARSING: 'parsing',
  AVATAR: 'avatar',
  AUTH: 'auth',
  NETWORK: 'network',
  UNKNOWN: 'unknown'
};

// Error severity levels
export const ErrorSeverity = {
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// User-friendly error messages by category and type
const USER_MESSAGES = {
  [ErrorCategory.LLM]: {
    timeout: 'The AI is taking too long to respond. Please try again.',
    rate_limit: 'Too many requests. Please wait a moment and try again.',
    invalid_key: 'There was an issue with the AI service. Please contact support.',
    server_error: 'The AI service is temporarily unavailable. Please try again later.',
    default: 'Failed to generate your workout. Please try again.'
  },
  [ErrorCategory.DATABASE]: {
    connection: 'Unable to connect to the server. Please check your internet connection.',
    save_failed: 'Failed to save your data. Please try again.',
    load_failed: 'Failed to load your data. Please refresh the page.',
    default: 'A database error occurred. Please try again.'
  },
  [ErrorCategory.PARSING]: {
    json_invalid: 'The AI response was in an unexpected format. Please try again.',
    missing_data: 'Some data was missing from the response. Please try again.',
    default: 'Failed to process the response. Please try again.'
  },
  [ErrorCategory.AVATAR]: {
    upload_failed: 'Failed to upload your photo. Please try a smaller image.',
    delete_failed: 'Failed to remove your photo. Please try again.',
    file_too_large: 'The image is too large. Please choose a smaller file.',
    invalid_type: 'Please upload a valid image file (JPEG, PNG, etc.).',
    default: 'Failed to update your profile photo.'
  },
  [ErrorCategory.NETWORK]: {
    offline: 'You appear to be offline. Please check your connection.',
    timeout: 'The request timed out. Please try again.',
    default: 'A network error occurred. Please check your connection.'
  },
  [ErrorCategory.AUTH]: {
    session_expired: 'Your session has expired. Please sign in again.',
    unauthorized: 'You don\'t have permission to perform this action.',
    default: 'An authentication error occurred. Please sign in again.'
  },
  default: 'Something went wrong. Please try again.'
};

/**
 * Get a user-friendly error message for a given category and error type
 * @param {string} category - Error category from ErrorCategory
 * @param {string} errorType - Specific error type within category
 * @returns {string} User-friendly error message
 */
export function getUserFriendlyMessage(category, errorType = 'default') {
  const categoryMessages = USER_MESSAGES[category] || {};
  return categoryMessages[errorType] || categoryMessages.default || USER_MESSAGES.default;
}

/**
 * Create error context object with environment info
 * @param {Object} additionalInfo - Additional context to include
 * @returns {Object} Context object with metadata
 */
export function createErrorContext(additionalInfo = {}) {
  return {
    url: typeof window !== 'undefined' ? window.location?.href : null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    timestamp: new Date().toISOString(),
    ...additionalInfo
  };
}

/**
 * Categorize an error based on its message/properties
 * @param {Error} error - The error object
 * @param {string} defaultCategory - Default category if unable to determine
 * @returns {Object} { type: string, severity: string }
 */
export function categorizeError(error, defaultCategory = ErrorCategory.UNKNOWN) {
  const message = error?.message?.toLowerCase() || '';

  // Network/timeout errors
  if (message.includes('timeout') || message.includes('abort') || error?.name === 'AbortError') {
    return { type: 'timeout', severity: ErrorSeverity.WARNING };
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('failed to fetch')) {
    return { type: 'offline', severity: ErrorSeverity.ERROR };
  }

  // LLM-specific errors
  if (message.includes('rate limit') || message.includes('429')) {
    return { type: 'rate_limit', severity: ErrorSeverity.WARNING };
  }
  if (message.includes('api key') || message.includes('unauthorized') || message.includes('401')) {
    return { type: 'invalid_key', severity: ErrorSeverity.CRITICAL };
  }
  if (message.includes('500') || message.includes('503') || message.includes('service')) {
    return { type: 'server_error', severity: ErrorSeverity.ERROR };
  }

  // Parsing errors
  if (message.includes('json') || message.includes('parse') || message.includes('unexpected token')) {
    return { type: 'json_invalid', severity: ErrorSeverity.ERROR };
  }

  // Auth errors
  if (message.includes('session') || message.includes('expired')) {
    return { type: 'session_expired', severity: ErrorSeverity.WARNING };
  }

  return { type: 'default', severity: ErrorSeverity.ERROR };
}

/**
 * Main error logging function - logs to database and console
 * @param {Object} db - Database helper object
 * @param {Object} params - Error parameters
 * @returns {Promise<string|null>} Error log ID or null if logging failed
 */
export async function logError(db, {
  category,
  message,
  severity = ErrorSeverity.ERROR,
  userId = null,
  component = null,
  operation = null,
  originalError = null,
  context = {}
}) {
  // Capture stack trace if available
  const stackTrace = originalError?.stack || new Error().stack;

  // Build context with error details
  const fullContext = {
    ...createErrorContext(context),
    originalMessage: originalError?.message,
    errorName: originalError?.name
  };

  // Always log to console for development visibility
  console.error(`[${category?.toUpperCase() || 'ERROR'}] ${message}`, {
    severity,
    component,
    operation,
    context: fullContext
  });

  // Attempt to log to database
  try {
    if (db?.logError) {
      const result = await db.logError(
        category,
        message,
        severity,
        userId,
        component,
        operation,
        stackTrace,
        fullContext
      );
      return result;
    }
  } catch (loggingError) {
    // Fallback to console if database logging fails
    console.error('Failed to log error to database:', loggingError);
  }

  return null;
}

/**
 * Create an enhanced error with user-friendly message and metadata
 * @param {Error} originalError - The original error
 * @param {string} category - Error category
 * @param {string} errorType - Specific error type
 * @returns {Error} Enhanced error object
 */
export function createUserFriendlyError(originalError, category, errorType = 'default') {
  const userMessage = getUserFriendlyMessage(category, errorType);
  const enhancedError = new Error(userMessage);
  enhancedError.originalError = originalError;
  enhancedError.category = category;
  enhancedError.errorType = errorType;
  return enhancedError;
}

/**
 * Wrapper for async operations with automatic error logging
 * @param {Object} db - Database helper object
 * @param {Object} options - Configuration options
 * @returns {Function} Async function wrapper
 */
export function withErrorLogging(db, options = {}) {
  const { category, component, operation, userId, rethrow = true } = options;

  return async (asyncFn) => {
    try {
      return await asyncFn();
    } catch (error) {
      const { type, severity } = categorizeError(error, category);

      await logError(db, {
        category: category || ErrorCategory.UNKNOWN,
        message: error.message,
        severity,
        userId,
        component,
        operation,
        originalError: error
      });

      if (rethrow) {
        throw createUserFriendlyError(error, category, type);
      }

      return null;
    }
  };
}
