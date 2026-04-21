// Unified Vercel Serverless Function for LLM API calls
// Keeps API keys server-side — never sent to the browser.
// Provider dispatch lives in ./_llm-core.js and is shared with api/mcp.js.

import { createClient } from '@supabase/supabase-js';
import { PROVIDER_CONFIGS, ENV_KEYS, callLlmWithConfig } from './_llm-core.js';

const AI_DAILY_LIMIT = 20; // max AI generations per user per day

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

    const result = await callLlmWithConfig({
      provider,
      apiKey,
      model: effectiveModel,
      systemPrompt,
      userPrompt,
      requestType,
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
