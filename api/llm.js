// Unified Vercel Serverless Function for LLM API calls
// Keeps API keys server-side — never sent to the browser

import { createClient } from '@supabase/supabase-js';

const TIMEOUT_MS = 270000; // 270s — just under Vercel's 300s maxDuration
const AI_DAILY_LIMIT = 20; // max AI generations per user per day
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

const PROVIDER_CONFIGS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: { onboarding: 'gpt-4o-mini', weekly: 'gpt-4o' },
    defaultModel: 'gpt-4o-mini',
  },
  claude: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    models: { onboarding: 'claude-3-haiku-20240307', weekly: 'claude-3-5-sonnet-latest' },
    defaultModel: 'claude-3-5-sonnet-latest',
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    models: { onboarding: 'gemini-1.5-flash', weekly: 'gemini-1.5-pro' },
    defaultModel: 'gemini-1.5-flash',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: { onboarding: 'openrouter/auto', weekly: 'openrouter/auto' },
    defaultModel: 'openrouter/auto',
  },
};

const ENV_KEYS = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

async function fetchWithTimeout(url, options, timeoutMs = TIMEOUT_MS) {
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

async function withRetry(fn, maxRetries = MAX_RETRIES, delayMs = RETRY_DELAY_MS) {
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
        throw error; // no point retrying a timeout
      }
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

async function callOpenAI(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
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

async function callClaude(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
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

async function callGemini(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
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

async function callOpenRouter(apiKey, systemPrompt, userPrompt, model, requestType = 'onboarding') {
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { provider, systemPrompt, userPrompt, requestType } = req.body;

    if (!provider || !systemPrompt || !userPrompt) {
      return res.status(400).json({ error: 'Missing required fields: provider, systemPrompt, userPrompt' });
    }

    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    const envKey = ENV_KEYS[provider];
    const apiKey = process.env[envKey];
    if (!apiKey) {
      return res.status(500).json({ error: `API key not configured for ${provider}. Set ${envKey} in Vercel env vars.` });
    }

    // Authenticate the user and check rate limits via Supabase.
    // Fail closed: auth is mandatory, no anonymous path.
    // (SECURITY-REVIEW-2026-04 F-007.)
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const authHeader = req.headers.authorization;

    if (!supabaseUrl || !supabaseServiceKey) {
      return res.status(500).json({ error: 'Server misconfigured: missing Supabase credentials.' });
    }

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing Authorization header.' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.slice(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // Daily AI generation rate limit
    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_user_id: user.id,
      p_operation: 'ai_generation',
      p_max_requests: AI_DAILY_LIMIT,
      p_window_minutes: 1440,
    });

    if (allowed === false) {
      return res.status(429).json({ error: `Daily AI generation limit reached (${AI_DAILY_LIMIT}/day). Try again tomorrow.` });
    }

    // Per-provider model override from app_settings (request-scoped — never mutate
    // PROVIDER_CONFIGS, which is module-level shared state. F-013.)
    let effectiveModel = config.models[requestType] || config.defaultModel;
    const modelOverrideKey = `llm_model_${provider}`;
    const { data: modelOverride } = await supabase
      .rpc('get_app_setting', { p_key: modelOverrideKey });

    if (modelOverride && typeof modelOverride === 'string' && modelOverride.trim() !== '') {
      effectiveModel = modelOverride.trim();
    }

    const model = effectiveModel;

    const result = await withRetry(async () => {
      switch (provider) {
        case 'openai': return await callOpenAI(apiKey, systemPrompt, userPrompt, model, requestType);
        case 'claude': return await callClaude(apiKey, systemPrompt, userPrompt, model, requestType);
        case 'gemini': return await callGemini(apiKey, systemPrompt, userPrompt, model, requestType);
        case 'openrouter': return await callOpenRouter(apiKey, systemPrompt, userPrompt, model, requestType);
        default: throw new Error(`Provider ${provider} not implemented`);
      }
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('LLM proxy error:', error);
    const status = error.message?.includes('401') || error.message?.includes('API key') ? 401
      : error.message?.includes('429') || error.message?.includes('rate limit') ? 429
      : error.message?.includes('timeout') ? 504
      : 500;
    return res.status(status).json({ error: error.message || 'Internal server error' });
  }
}
