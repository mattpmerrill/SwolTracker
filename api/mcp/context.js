// First-class ContextBundle endpoint.
// Bypasses MCP protocol framing — agents GET/POST here to fetch a compressed
// bundle in one call. Token budget enforced via SDK's buildContextBundleFromModules.

import { buildContextBundleFromModules } from '@bot-native/sdk';
import { createContextModules } from '../../mcp/dist/context-modules.js';
import {
  CATEGORY_LIMITS,
  authenticateMcpRequest,
  enforceLimit,
  hashKey,
  setCorsHeaders,
  writeAudit,
} from '../_mcp-shared.js';

const CONTEXT_MAX_TOKENS = 2000;
const APP_NAME = 'swoltracker';
const AUDIT_TOOL_NAME = 'context.fetch';

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }

  let auditCtx = null;
  let auditOk = null;
  let auditError = null;

  try {
    const auth = await authenticateMcpRequest(req, res);
    if (!auth) return;
    const { supabase, userId, apiKeyId, scopes } = auth;

    if (!scopes.includes('read')) {
      return res.status(403).json({
        error: 'Missing required scope: read',
        code: 'forbidden',
        required: ['read'],
      });
    }

    // Context fetches count against the query-category budget.
    const queryLimit = CATEGORY_LIMITS.query;
    if (!(await enforceLimit(supabase, userId, 'mcp_tools_query', queryLimit.max, queryLimit.window, res))) return;

    auditCtx = { supabase, userId, apiKeyId, argsHash: await hashKey('{}') };

    const bundle = await buildContextBundleFromModules({
      appName: APP_NAME,
      userId,
      modules: createContextModules(),
      deps: { supabase, userId },
      maxTokens: CONTEXT_MAX_TOKENS,
    });

    res.status(200).json(bundle);
    auditOk = true;
  } catch (error) {
    console.error('Context endpoint error:', error);
    auditOk = false;
    auditError = error?.message ?? String(error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (auditCtx && auditOk !== null) {
      writeAudit(auditCtx.supabase, {
        userId: auditCtx.userId,
        apiKeyId: auditCtx.apiKeyId,
        toolName: AUDIT_TOOL_NAME,
        argsHash: auditCtx.argsHash,
        ok: auditOk,
        errorMessage: auditError,
      });
    }
  }
}
