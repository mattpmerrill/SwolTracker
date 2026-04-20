// Vercel serverless MCP endpoint.
// Auth + rate limits + audit stay here; tool wiring is delegated to @bot-native/sdk
// via the adapter in mcp/dist/sdk-adapter.js.

import { createClient } from '@supabase/supabase-js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../mcp/dist/sdk-adapter.js';

const MCP_RATE_LIMIT = 500;
const MCP_RATE_WINDOW_MINUTES = 60;

// SDK category → (max, window) budgets for tools/call.
const CATEGORY_LIMITS = {
  query: { max: 500, window: 60 },
  meta:  { max: 500, window: 60 },
  action:{ max: 100, window: 60 },
  edit:  { max: 100, window: 60 },
};

// Per-tool ceilings for high-cost writes, stricter than their category.
const TOOL_LIMITS = {
  save_workout_program:     { max: 20, window: 60 },
  generate_workout_program: { max: 20, window: 60 },
  send_coach_message:       { max: 50, window: 60 },
};

async function enforceLimit(supabase, userId, operation, max, window, res) {
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

function extractToolName(body) {
  if (body && !Array.isArray(body) && body.method === 'tools/call') return body.params?.name || null;
  return null;
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key);
}

async function hashKey(raw) {
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function attachSdkTools(server, app, identity) {
  for (const tool of app.tools) {
    server.tool(tool.name, tool.description, tool.schema, async (params) => {
      const ctx = { request: { identity, requestId: randomUUID(), transport: 'http' }, app };
      const result = await tool.execute(params, ctx);
      return { content: [{ type: 'text', text: result.message }] };
    });
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let auditCtx = null;
  let auditOk = null;
  let auditError = null;

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer swol_')) {
      return res.status(401).json({ error: 'Missing or invalid API key. Expected: Bearer swol_...' });
    }
    const apiKey = authHeader.slice(7);

    const supabase = getSupabase();
    const keyHash = await hashKey(apiKey);

    const { data: keyRow, error: keyError } = await supabase
      .from('api_keys')
      .select('id, user_id, revoked_at')
      .eq('key_hash', keyHash)
      .single();

    if (keyError || !keyRow) return res.status(401).json({ error: 'Invalid API key.' });
    if (keyRow.revoked_at) return res.status(401).json({ error: 'API key has been revoked.' });

    const userId = keyRow.user_id;

    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id).then(() => {});

    if (!(await enforceLimit(supabase, userId, 'mcp_request', MCP_RATE_LIMIT, MCP_RATE_WINDOW_MINUTES, res))) return;

    const app = buildApp(supabase);
    const toolName = extractToolName(req.body);

    if (toolName) {
      const toolLimit = TOOL_LIMITS[toolName];
      if (toolLimit && !(await enforceLimit(supabase, userId, `mcp_tool_${toolName}`, toolLimit.max, toolLimit.window, res))) return;
      const category = app.tools.find(t => t.name === toolName)?.category;
      const catLimit = category && CATEGORY_LIMITS[category];
      if (catLimit && !(await enforceLimit(supabase, userId, `mcp_tools_${category}`, catLimit.max, catLimit.window, res))) return;

      const argsJson = JSON.stringify(req.body?.params?.arguments ?? {});
      auditCtx = { supabase, userId, apiKeyId: keyRow.id, toolName, argsHash: await hashKey(argsJson) };
    }

    const server = new McpServer({ name: app.manifest.name, version: app.manifest.version });
    attachSdkTools(server, app, { userId });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    await transport.close();
    await server.close();

    auditOk = res.statusCode < 400;
  } catch (error) {
    console.error('MCP endpoint error:', error);
    auditOk = false;
    auditError = error?.message ?? String(error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  } finally {
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
        .then(({ error }) => { if (error) console.error('tool_call_audit insert failed:', error.message); });
    }
  }
}
