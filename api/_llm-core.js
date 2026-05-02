// Shared LLM dispatch — provider configs, retry/timeout, callers.
// Imported by `api/llm.js` (the public proxy endpoint) and `api/mcp.js`
// (to inject a server-side LLM caller into the MCP tool kit for tools like
// `rebuild_week_for_constraints`).

const TIMEOUT_MS = 270000; // 270s — just under Vercel's 300s maxDuration
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export const PROVIDER_CONFIGS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: { onboarding: 'gpt-4o-mini', weekly: 'gpt-4o', swap: 'gpt-4o-mini' },
    defaultModel: 'gpt-4o-mini',
  },
  claude: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: { onboarding: 'claude-3-haiku-20240307', weekly: 'claude-3-5-sonnet-latest', swap: 'claude-3-haiku-20240307' },
    defaultModel: 'claude-3-5-sonnet-latest',
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: { onboarding: 'gemini-1.5-flash', weekly: 'gemini-1.5-pro', swap: 'gemini-1.5-flash' },
    defaultModel: 'gemini-1.5-flash',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: { onboarding: 'openrouter/auto', weekly: 'openrouter/auto', swap: 'openrouter/auto' },
    defaultModel: 'openrouter/auto',
  },
};

export const ENV_KEYS = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/**
 * Resolve a provider, falling back to the next available one if the preferred
 * provider's API key is not configured in environment variables.
 * Returns the first viable provider or `null` if none are configured.
 */
export function resolveProviderWithFallback(preferredProvider) {
  const tryOrder = [preferredProvider, 'openai', 'claude', 'gemini', 'openrouter'];
  const unique = [...new Set(tryOrder)];
  for (const p of unique) {
    const envKey = ENV_KEYS[p];
    if (envKey && process.env[envKey]) {
      return p;
    }
  }
  return null;
}

export async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
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

export async function withRetry(fn, maxRetries = MAX_RETRIES, delayMs = RETRY_DELAY_MS) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error.message?.toLowerCase() || '';
      if (message.includes('invalid api key') || message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
        throw error;
      }
      if (message.includes('timed out') || message.includes('timeout') || message.includes('504')) {
        throw error;
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export async function callOpenAI(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
  const maxTokens = requestType === 'weekly' ? 8000 : 4000;
  const response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0]?.message?.content || '',
    usage: { prompt_tokens: data.usage?.prompt_tokens || 0, completion_tokens: data.usage?.completion_tokens || 0 },
    model,
  };
}

export async function callClaude(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
  const maxTokens = requestType === 'weekly' ? 8000 : 4000;
  const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Claude API error: ${response.status}`);
  }

  const data = await response.json();
  if (data.stop_reason === 'max_tokens') {
    throw new Error('The AI response was cut off because the workout program was too large. Try generating fewer weeks at a time.');
  }
  return {
    content: data.content?.[0]?.text || '',
    usage: { prompt_tokens: data.usage?.input_tokens || 0, completion_tokens: data.usage?.output_tokens || 0 },
    model,
  };
}

export async function callGemini(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
  const maxTokens = requestType === 'weekly' ? 8000 : 4000;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const usageMetadata = data.usageMetadata || {};
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    usage: { prompt_tokens: usageMetadata.promptTokenCount || 0, completion_tokens: usageMetadata.candidatesTokenCount || 0 },
    model,
  };
}

export async function callOpenRouter(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
  const maxTokens = requestType === 'weekly' ? 8000 : 4000;
  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://swoltracker.com',
      'X-Title': 'SwolTracker',
    },
    body: JSON.stringify({
      model: model || 'openrouter/auto',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenRouter API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: {
      prompt_tokens: data.usage?.prompt_tokens || 0,
      completion_tokens: data.usage?.completion_tokens || 0,
    },
    model: data.model || model,
  };
}

/**
 * Low-level provider dispatch. Caller supplies `provider`, `apiKey`, and
 * `model` — this does not resolve any of those from environment or app_settings.
 */
export async function callLlmWithConfig({ provider, apiKey, model, systemPrompt, userPrompt, requestType = 'onboarding' }) {
  return withRetry(async () => {
    switch (provider) {
      case 'openai': return await callOpenAI(apiKey, systemPrompt, userPrompt, model, requestType);
      case 'claude': return await callClaude(apiKey, systemPrompt, userPrompt, model, requestType);
      case 'gemini': return await callGemini(apiKey, systemPrompt, userPrompt, model, requestType);
      case 'openrouter': return await callOpenRouter(apiKey, systemPrompt, userPrompt, model, requestType);
      default: throw new Error(`Provider ${provider} not implemented`);
    }
  });
}

/**
 * Server-side LLM caller: resolves provider (app_settings `llm_provider`),
 * API key (env var), and model (with optional per-provider override from
 * app_settings `llm_model_<provider>`), then dispatches. Used by MCP tools
 * that need to generate content inline rather than the browser round-tripping
 * through `api/llm.js`.
 */
export async function callLlmInternal(supabase, { systemPrompt, userPrompt, requestType = 'weekly' }) {
  const { data: providerSetting } = await supabase.rpc('get_app_setting', { p_key: 'llm_provider' });
  const preferredProvider = (typeof providerSetting === 'string' && providerSetting.trim()) || 'claude';

  const provider = resolveProviderWithFallback(preferredProvider);
  if (!provider) {
    throw new Error(`No LLM provider API keys are configured. Please set at least one of: ${Object.values(ENV_KEYS).join(', ')} in Vercel env vars.`);
  }
  if (provider !== preferredProvider) {
    console.warn(`[callLlmInternal] Preferred provider ${preferredProvider} unavailable, using fallback ${provider}`);
  }

  const config = PROVIDER_CONFIGS[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const envKey = ENV_KEYS[provider];
  const apiKey = process.env[envKey];

  let model = config.models[requestType] || config.defaultModel;
  const { data: modelOverride } = await supabase.rpc('get_app_setting', { p_key: `llm_model_${provider}` });
  if (modelOverride && typeof modelOverride === 'string' && modelOverride.trim() !== '') {
    model = modelOverride.trim();
  }

  return callLlmWithConfig({ provider, apiKey, model, systemPrompt, userPrompt, requestType });
}
