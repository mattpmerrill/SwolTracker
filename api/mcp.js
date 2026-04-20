// Vercel serverless MCP endpoint
// Authenticates via API key (swol_...), resolves user_id, handles MCP requests

import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createEventEmitter } from '../mcp/dist/bot-native-shim.js';
import { createQueryTools } from '../mcp/dist/tools/queries.js';
import { createActionTools } from '../mcp/dist/tools/actions.js';
import { createContextTools } from '../mcp/dist/tools/context.js';
import { createNaturalLanguageTools } from '../mcp/dist/tools/natural-language.js';
import { createGenerationTools } from '../mcp/dist/tools/generation.js';
import { createCoachingTools } from '../mcp/dist/tools/coaching.js';
import { registerTools } from '../mcp/dist/register-tools.js';

const MCP_RATE_LIMIT = 500;       // overall requests per hour
const MCP_RATE_WINDOW_MINUTES = 60;

// Per-category budgets for `tools/call` (AGENT-NATIVE-PLAN.md 0.5)
const CATEGORY_LIMITS = {
  read:  { max: 500, window: 60 },
  write: { max: 100, window: 60 },
};

// Per-tool budgets for high-cost writes — stricter than their category
const TOOL_LIMITS = {
  save_workout_program: { max: 20, window: 60 },
  generate_workout_program: { max: 20, window: 60 },
  send_coach_message:   { max: 50, window: 60 },
};

// Tool → category map. Anything unlisted falls through with only the overall
// and per-tool (if any) limits applied. Matches register-tools.ts as of 2026-04-19.
const TOOL_CATEGORY = {
  // reads
  get_profile: 'read', get_maxes: 'read', get_max_history: 'read', list_gyms: 'read',
  get_todays_workout: 'read', get_weekly_workout: 'read', get_program_overview: 'read',
  get_program_progression: 'read', get_workout_logs: 'read', get_recent_sessions: 'read',
  get_stats: 'read', get_streak: 'read', get_context_bundle: 'read',
  get_pending_events: 'read', get_prompt_template: 'read', get_missed_days: 'read',
  check_workout_reminder: 'read', generate_weekly_summary: 'read',
  get_training_history_summary: 'read', get_overload_recommendations: 'read',
  compare_weeks: 'read', normalize_exercise_name: 'read', list_canonical_exercises: 'read',
  get_user_messages: 'read', get_conversation_history: 'read',
  // writes
  log_set: 'write', mark_workout_complete: 'write', log_workout_summary: 'write',
  update_max: 'write', delete_max: 'write', save_workout_program: 'write',
  log_exercise: 'write', generate_workout_program: 'write', delete_set: 'write',
  correct_set: 'write', log_missed_day: 'write', send_coach_message: 'write',
};

async function enforceLimit(supabase, userId, operation, max, window, res) {
  const { data: allowed } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_operation: operation,
    p_max_requests: max,
    p_window_minutes: window,
  });
  if (allowed === false) {
    res.status(429).json({
      error: `Rate limit exceeded for ${operation} (${max} per ${window}min). Try again later.`,
    });
    return false;
  }
  return true;
}

function extractToolName(body) {
  // Single JSON-RPC request: { method: 'tools/call', params: { name, arguments } }
  if (body && !Array.isArray(body) && body.method === 'tools/call') {
    return body.params?.name || null;
  }
  return null;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

async function hashKey(raw) {
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Audit context — populated once we know the caller. Written in finally.
  let auditCtx = null;
  let auditOk = null;
  let auditError = null;

  try {
    // 1. Extract API key
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer swol_')) {
      return res.status(401).json({ error: 'Missing or invalid API key. Expected: Bearer swol_...' });
    }
    const apiKey = authHeader.slice(7); // strip "Bearer "

    // 2. Hash and lookup
    const supabase = getSupabase();
    const keyHash = await hashKey(apiKey);

    const { data: keyRow, error: keyError } = await supabase
      .from('api_keys')
      .select('id, user_id, revoked_at')
      .eq('key_hash', keyHash)
      .single();

    if (keyError || !keyRow) {
      return res.status(401).json({ error: 'Invalid API key.' });
    }

    if (keyRow.revoked_at) {
      return res.status(401).json({ error: 'API key has been revoked.' });
    }

    const userId = keyRow.user_id;

    // 3. Update last_used_at (fire-and-forget)
    supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id)
      .then(() => {});

    // 4. Rate limits — overall, then per-tool (tightest) and per-category
    if (!(await enforceLimit(supabase, userId, 'mcp_request', MCP_RATE_LIMIT, MCP_RATE_WINDOW_MINUTES, res))) return;

    const toolName = extractToolName(req.body);
    if (toolName) {
      const toolLimit = TOOL_LIMITS[toolName];
      if (toolLimit) {
        const op = `mcp_tool_${toolName}`;
        if (!(await enforceLimit(supabase, userId, op, toolLimit.max, toolLimit.window, res))) return;
      }
      const category = TOOL_CATEGORY[toolName];
      if (category) {
        const catLimit = CATEGORY_LIMITS[category];
        const op = `mcp_tools_${category}`;
        if (!(await enforceLimit(supabase, userId, op, catLimit.max, catLimit.window, res))) return;
      }

      // Prepare audit row — args are hashed, not stored, so payloads never persist.
      const argsJson = JSON.stringify(req.body?.params?.arguments ?? {});
      auditCtx = {
        supabase,
        userId,
        apiKeyId: keyRow.id,
        toolName,
        argsHash: await hashKey(argsJson),
      };
    }

    // 5. Build MCP server with this user's context
    const events = createEventEmitter(supabase, 'swoltracker');
    const queries = createQueryTools(supabase, userId);
    const actions = createActionTools(supabase, userId, events, queries);
    const context = createContextTools(supabase, userId, queries);
    const nlTools = createNaturalLanguageTools(supabase, userId, queries, actions);
    const generation = createGenerationTools(supabase, userId, queries, actions);
    const coaching = createCoachingTools(supabase, userId);

    const server = new McpServer({ name: 'swoltracker', version: '0.1.0' });
    registerTools(server, queries, actions, context, nlTools, generation, coaching);

    // 6. Handle via stateless StreamableHTTP transport
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    // Cleanup
    await transport.close();
    await server.close();

    auditOk = res.statusCode < 400;
  } catch (error) {
    console.error('MCP endpoint error:', error);
    auditOk = false;
    auditError = error?.message ?? String(error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    // Fire-and-forget audit write. Only for tools/call — not list/initialize.
    if (auditCtx && auditOk !== null) {
      auditCtx.supabase
        .from('tool_call_audit')
        .insert({
          user_id: auditCtx.userId,
          api_key_id: auditCtx.apiKeyId,
          tool_name: auditCtx.toolName,
          args_hash: auditCtx.argsHash,
          ok: auditOk,
          error_message: auditError,
        })
        .then(({ error }) => {
          if (error) console.error('tool_call_audit insert failed:', error.message);
        });
    }
  }
}
