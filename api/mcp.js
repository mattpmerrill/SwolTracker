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

const MCP_RATE_LIMIT = 500;       // requests per hour — bumped up 2026-04-07
const MCP_RATE_WINDOW_MINUTES = 60;

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

    // 4. Rate limit
    const { data: allowed } = await supabase.rpc('check_rate_limit', {
      p_user_id: userId,
      p_operation: 'mcp_request',
      p_max_requests: MCP_RATE_LIMIT,
      p_window_minutes: MCP_RATE_WINDOW_MINUTES,
    });

    if (allowed === false) {
      return res.status(429).json({ error: `Rate limit exceeded (${MCP_RATE_LIMIT}/hour). Try again later.` });
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
  } catch (error) {
    console.error('MCP endpoint error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
