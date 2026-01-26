// LLM provider configurations and API calling utilities
import { logError, ErrorCategory, ErrorSeverity, getUserFriendlyMessage, categorizeError, createUserFriendlyError } from './errorService';

// Configuration
const TIMEOUT_MS = 60000; // 60 seconds
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

const PROVIDER_CONFIGS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o-mini',
    models: {
      onboarding: 'gpt-4o-mini',
      weekly: 'gpt-4o'
    }
  },
  claude: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-latest',
    models: {
      onboarding: 'claude-3-haiku-20240307',
      weekly: 'claude-3-5-sonnet-latest'
    }
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    defaultModel: 'gemini-1.5-flash',
    models: {
      onboarding: 'gemini-1.5-flash',
      weekly: 'gemini-1.5-pro'
    }
  }
};

/**
 * Fetch with timeout using AbortController
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. The AI service is taking too long to respond.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry wrapper with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delayMs - Initial delay in milliseconds
 * @returns {Promise<any>} Result of the function
 */
async function withRetry(fn, maxRetries = MAX_RETRIES, delayMs = RETRY_DELAY_MS) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error.message?.toLowerCase() || '';

      // Don't retry on certain errors - they won't succeed on retry
      if (
        message.includes('invalid api key') ||
        message.includes('unauthorized') ||
        message.includes('401') ||
        message.includes('403') ||
        message.includes('invalid_api_key')
      ) {
        throw error;
      }

      // Wait before retrying (with exponential backoff)
      if (attempt < maxRetries) {
        const waitTime = delayMs * Math.pow(2, attempt);
        console.log(`LLM request failed, retrying in ${waitTime}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError;
}

/**
 * Categorize LLM-specific errors for user-friendly messages
 * @param {Error} error - The error object
 * @param {string} provider - The LLM provider name
 * @returns {Object} { type: string, severity: string }
 */
function categorizeLlmError(error, provider) {
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
 * Call the appropriate LLM provider API with timeout, retry, and error handling
 * @param {string} provider - 'openai', 'claude', or 'gemini'
 * @param {string} apiKey - The API key for the provider
 * @param {string} systemPrompt - The system message
 * @param {string} userPrompt - The user message
 * @param {string} requestType - 'onboarding' or 'weekly' to select appropriate model
 * @param {Object} db - Optional database helper for error logging
 * @param {string} userId - Optional user ID for error context
 * @returns {Promise<{content: string, usage: {prompt_tokens: number, completion_tokens: number}, model: string}>}
 */
export async function callLlmProvider(provider, apiKey, systemPrompt, userPrompt, requestType = 'weekly', db = null, userId = null) {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  const model = config.models[requestType] || config.defaultModel;

  try {
    return await withRetry(async () => {
      switch (provider) {
        case 'openai':
          return await callOpenAI(apiKey, systemPrompt, userPrompt, model);
        case 'claude':
          return await callClaude(apiKey, systemPrompt, userPrompt, model);
        case 'gemini':
          return await callGemini(apiKey, systemPrompt, userPrompt, model);
        default:
          throw new Error(`Provider ${provider} not implemented`);
      }
    });
  } catch (error) {
    // Log error if db is available
    const { type, severity } = categorizeLlmError(error, provider);

    if (db) {
      await logError(db, {
        category: ErrorCategory.LLM,
        message: error.message,
        severity,
        userId,
        component: 'llm.js',
        operation: `callLlmProvider.${provider}`,
        originalError: error,
        context: { provider, requestType, model }
      });
    }

    // Throw with user-friendly message
    const userMessage = getUserFriendlyMessage(ErrorCategory.LLM, type);
    const enhancedError = new Error(userMessage);
    enhancedError.originalError = error;
    enhancedError.category = ErrorCategory.LLM;
    enhancedError.errorType = type;
    throw enhancedError;
  }
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4000
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const statusText = response.status === 401 ? 'Invalid API key' :
                       response.status === 429 ? 'Rate limit exceeded' :
                       response.status === 503 ? 'Service temporarily unavailable' :
                       `API request failed: ${response.status}`;
    throw new Error(errorData.error?.message || statusText);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0
    },
    model: model
  };
}

async function callClaude(apiKey, systemPrompt, userPrompt, model) {
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: model,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const statusText = response.status === 401 ? 'Invalid API key' :
                       response.status === 429 ? 'Rate limit exceeded' :
                       response.status === 503 ? 'Service temporarily unavailable' :
                       `API request failed: ${response.status}`;
    throw new Error(errorData.error?.message || statusText);
  }

  const data = await response.json();
  return {
    content: data.content?.[0]?.text || '',
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0
    },
    model: model
  };
}

async function callGemini(apiKey, systemPrompt, userPrompt, model) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4000
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const statusText = response.status === 401 || response.status === 403 ? 'Invalid API key' :
                       response.status === 429 ? 'Rate limit exceeded' :
                       response.status === 503 ? 'Service temporarily unavailable' :
                       `API request failed: ${response.status}`;
    throw new Error(errorData.error?.message || statusText);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Gemini uses a different token counting approach
  // We estimate based on response metadata if available
  const usageMetadata = data.usageMetadata || {};

  return {
    content: content,
    usage: {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0
    },
    model: model
  };
}

export function getProviderConfig(provider) {
  return PROVIDER_CONFIGS[provider] || PROVIDER_CONFIGS.openai;
}
