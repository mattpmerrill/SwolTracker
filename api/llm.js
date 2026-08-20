// Unified Vercel Serverless Function for LLM API calls
// Keeps API keys server-side — never sent to the browser.
// Provider dispatch lives in ./_llm-core.js and is shared with api/mcp.js.

import { createClient } from '@supabase/supabase-js';
import { PROVIDER_CONFIGS, ENV_KEYS, callLlmWithConfig, resolveProviderWithFallback } from './_llm-core.js';
import { setCorsHeaders } from './_mcp-shared.js';
import { isPromptTooLarge, publicLlmError } from './_llm-guard.js';
import { captureException, initSentry } from './_sentry.js';

const AI_DAILY_LIMIT = 20; // max AI generations per user per day

initSentry();

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user = null;
  let supabase = null;
  let requestType = 'weekly';
  let effectiveModel = null;

  try {
    const body = req.body || {};
    const { provider, systemPrompt, userPrompt } = body;
    requestType = body.requestType || 'weekly';

    if (!provider || !systemPrompt || !userPrompt) {
      return res.status(400).json({ error: 'Missing required fields: provider, systemPrompt, userPrompt' });
    }

    if (isPromptTooLarge(systemPrompt, userPrompt)) {
      return res.status(413).json({ error: 'Prompt too large.' });
    }

    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    let effectiveProvider = provider;
    let envKey = ENV_KEYS[provider];
    let apiKey = process.env[envKey];

    if (!apiKey) {
      const fallback = resolveProviderWithFallback(provider);
      if (fallback) {
        console.warn(`[LLM Proxy] Provider ${provider} key missing, falling back to ${fallback}`);
        effectiveProvider = fallback;
        envKey = ENV_KEYS[fallback];
        apiKey = process.env[envKey];
      }
    }

    if (!apiKey) {
      return res.status(500).json({
        error: `No LLM provider API keys are configured. Please set at least one of: ${Object.values(ENV_KEYS).join(', ')} in Vercel env vars.`
      });
    }

    const effectiveConfig = PROVIDER_CONFIGS[effectiveProvider];

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

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.slice(7);
    const authResult = await supabase.auth.getUser(token);
    const authError = authResult.error;
    user = authResult.data?.user;

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
    effectiveModel = effectiveConfig.models[requestType] || effectiveConfig.defaultModel;
    const modelOverrideKey = `llm_model_${effectiveProvider}`;
    const { data: modelOverride } = await supabase
      .rpc('get_app_setting', { p_key: modelOverrideKey });

    if (modelOverride && typeof modelOverride === 'string' && modelOverride.trim() !== '') {
      effectiveModel = modelOverride.trim();
    }

    const result = await callLlmWithConfig({
      provider: effectiveProvider,
      apiKey,
      model: effectiveModel,
      systemPrompt,
      userPrompt,
      requestType,
    });

    await supabase.rpc('log_api_usage', {
      p_user_id: user.id,
      p_request_type: requestType,
      p_model: result.model || effectiveModel,
      p_prompt_tokens: result.usage?.prompt_tokens ?? null,
      p_completion_tokens: result.usage?.completion_tokens ?? null,
      p_success: true,
      p_error_message: null,
    }).then(({ error: logError }) => {
      if (logError) console.error('log_api_usage failed:', logError.message);
    });

    return res.status(200).json({ ...result, provider: effectiveProvider });
  } catch (error) {
    console.error('LLM proxy error:', error);
    captureException(error, { tags: { endpoint: 'llm' } });
    if (supabase && user) {
      supabase.rpc('log_api_usage', {
        p_user_id: user.id,
        p_request_type: requestType,
        p_model: effectiveModel,
        p_prompt_tokens: null,
        p_completion_tokens: null,
        p_success: false,
        p_error_message: (error?.message || 'error').slice(0, 500),
      }).then(({ error: logError }) => {
        if (logError) console.error('log_api_usage failed:', logError.message);
      });
    }
    const mapped = publicLlmError(error);
    return res.status(mapped.status).json({ error: mapped.error });
  }
}
