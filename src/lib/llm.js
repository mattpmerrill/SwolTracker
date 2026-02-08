// LLM client — calls the server-side /api/llm proxy (API keys stay server-side)
import { logError, ErrorCategory, ErrorSeverity, getUserFriendlyMessage } from './errorService';
import { supabase } from './supabase';

const TIMEOUT_MS = 65000; // slightly longer than the server-side 60s timeout

/**
 * Categorize LLM-specific errors for user-friendly messages
 */
function categorizeLlmError(error) {
  const message = error.message?.toLowerCase() || '';

  if (message.includes('timeout') || message.includes('abort') || error.name === 'AbortError') {
    return { type: 'timeout', severity: ErrorSeverity.WARNING };
  }
  if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) {
    return { type: 'rate_limit', severity: ErrorSeverity.WARNING };
  }
  if (message.includes('api key') || message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
    return { type: 'invalid_key', severity: ErrorSeverity.CRITICAL };
  }
  if (message.includes('500') || message.includes('503') || message.includes('server') || message.includes('unavailable')) {
    return { type: 'server_error', severity: ErrorSeverity.ERROR };
  }

  return { type: 'default', severity: ErrorSeverity.ERROR };
}

/**
 * Call the LLM via the server-side proxy at /api/llm
 * @param {string} provider - 'openai', 'claude', or 'gemini'
 * @param {string} systemPrompt - The system message
 * @param {string} userPrompt - The user message
 * @param {string} requestType - 'onboarding' or 'weekly' to select appropriate model
 * @param {Object} db - Optional database helper for error logging
 * @param {string} userId - Optional user ID for error context
 * @returns {Promise<{content: string, usage: {prompt_tokens: number, completion_tokens: number}, model: string}>}
 */
export async function generateWithLlm(provider, systemPrompt, userPrompt, requestType = 'weekly', db = null, userId = null) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // Get auth token for rate limiting
    const headers = { 'Content-Type': 'application/json' };
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }
    }

    let response;
    try {
      response = await fetch('/api/llm', {
        method: 'POST',
        headers,
        body: JSON.stringify({ provider, systemPrompt, userPrompt, requestType }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timed out. The AI service is taking too long to respond.');
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `LLM request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    const { type, severity } = categorizeLlmError(error);

    if (db) {
      await logError(db, {
        category: ErrorCategory.LLM,
        message: error.message,
        severity,
        userId,
        component: 'llm.js',
        operation: `generateWithLlm.${provider}`,
        originalError: error,
        context: { provider, requestType },
      });
    }

    const userMessage = getUserFriendlyMessage(ErrorCategory.LLM, type);
    const enhancedError = new Error(userMessage);
    enhancedError.originalError = error;
    enhancedError.category = ErrorCategory.LLM;
    enhancedError.errorType = type;
    throw enhancedError;
  }
}
