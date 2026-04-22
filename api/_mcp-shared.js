// Shared helpers for MCP-backed Vercel endpoints (api/mcp.js, api/mcp/context.js).
// Auth, key lookup, rate limiting, and audit writes live here so each endpoint
// stays focused on its protocol surface.

import { createClient } from '@supabase/supabase-js';

export const MCP_RATE_LIMIT = 500;
export const MCP_RATE_WINDOW_MINUTES = 60;

export const CATEGORY_LIMITS = {
  query: { max: 500, window: 60 },
  meta:  { max: 500, window: 60 },
  action:{ max: 100, window: 60 },
  edit:  { max: 100, window: 60 },
};

export const TOOL_LIMITS = {
  save_workout_program:          { max: 20, window: 60 },
  generate_workout_program:      { max: 20, window: 60 },
  rebuild_week_for_constraints:  { max: 10, window: 60 },
  bulk_log_workout:              { max: 30, window: 60 },
  send_coach_message:            { max: 50, window: 60 },
  complete_onboarding:           { max: 5,  window: 60 },
  update_profile:                { max: 60, window: 60 },
};

export function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

export async function hashKey(raw) {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function enforceLimit(supabase, userId, operation, max, window, res) {
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_operation: operation,
    p_max_requests: max,
    p_window_minutes: window,
  });
  if (allowed === false) {
    res.status(429).json({ error: `Rate limit exceeded for ${operation} (${max} per ${window}min). Try again later.` });
    return false;
  }
  return true;
}

// Authenticates the incoming request and applies the overall MCP rate limit.
// Returns { supabase, userId, apiKeyId } on success, or null if the response
// has already been sent (401/429). Caller should check for null and return.
export async function authenticateMcpRequest(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer swol_')) {
    res.status(401).json({ error: 'Missing or invalid API key. Expected: Bearer swol_...' });
    return null;
  }
  const apiKey = authHeader.slice(7);

  const supabase = getSupabase();
  const keyHash = await hashKey(apiKey);

  const { data: keyRow, error: keyError } = await supabase
    .from('api_keys')
    .select('id, user_id, revoked_at, scopes')
    .eq('key_hash', keyHash)
    .single();

  if (keyError || !keyRow) { res.status(401).json({ error: 'Invalid API key.' }); return null; }
  if (keyRow.revoked_at) { res.status(401).json({ error: 'API key has been revoked.' }); return null; }

  const userId = keyRow.user_id;
  const scopes = Array.isArray(keyRow.scopes) ? keyRow.scopes : [];

  supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id).then(() => {});

  if (!(await enforceLimit(supabase, userId, 'mcp_request', MCP_RATE_LIMIT, MCP_RATE_WINDOW_MINUTES, res))) return null;

  return { supabase, userId, apiKeyId: keyRow.id, scopes };
}

// Writes a tool_call_audit row. Fire-and-forget; never throws into caller.
export function writeAudit(supabase, { userId, apiKeyId, toolName, argsHash, ok, errorMessage }) {
  supabase
    .from('tool_call_audit')
    .insert({
      user_id: userId,
      api_key_id: apiKeyId,
      tool_name: toolName,
      args_hash: argsHash,
      ok,
      error_message: errorMessage ?? null,
    })
    .then(({ error }) => { if (error) console.error('tool_call_audit insert failed:', error.message); });
}

export function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}
