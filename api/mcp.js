// Vercel serverless MCP endpoint.
// Auth + rate limits + audit stay here; tool wiring is delegated to @bot-native/sdk
// via the adapter in mcp/dist/sdk-adapter.js.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { executeToolWithGuards } from '@bot-native/sdk';
import { buildApp } from '../mcp/dist/sdk-adapter.js';
import { callLlmInternal } from './_llm-core.js';
import {
  CATEGORY_LIMITS,
  TOOL_LIMITS,
  authenticateMcpRequest,
  enforceLimit,
  hashKey,
  setCorsHeaders,
  writeAudit,
} from './_mcp-shared.js';
import { captureException, initSentry } from './_sentry.js';

initSentry();

function extractToolName(body) {
  if (body && !Array.isArray(body) && body.method === 'tools/call') return body.params?.name || null;
  return null;
}

function attachSdkTools(server, app, identity) {
  for (const tool of app.tools) {
    server.tool(tool.name, tool.description, tool.schema, async (params) => {
      const ctx = { request: { identity, requestId: randomUUID(), transport: 'http' }, app };
      const result = await executeToolWithGuards(tool, params, ctx);
      const text = result.ok
        ? result.message
        : JSON.stringify({ ok: false, message: result.message, error: result.error });
      return { content: [{ type: 'text', text }] };
    });
  }
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let auditCtx = null;
  let auditOk = null;
  let auditError = null;

  try {
    const auth = await authenticateMcpRequest(req, res);
    if (!auth) return;
    const { supabase, userId, apiKeyId, scopes } = auth;

    const callLlm = ({ systemPrompt, userPrompt, requestType }) =>
      callLlmInternal(supabase, { systemPrompt, userPrompt, requestType });
    const app = buildApp(supabase, { callLlm });
    const toolName = extractToolName(req.body);

    if (toolName) {
      const toolLimit = TOOL_LIMITS[toolName];
      if (toolLimit && !(await enforceLimit(supabase, userId, `mcp_tool_${toolName}`, toolLimit.max, toolLimit.window, res))) return;
      const category = app.tools.find(t => t.name === toolName)?.category;
      const catLimit = category && CATEGORY_LIMITS[category];
      if (catLimit && !(await enforceLimit(supabase, userId, `mcp_tools_${category}`, catLimit.max, catLimit.window, res))) return;

      const argsJson = JSON.stringify(req.body?.params?.arguments ?? {});
      auditCtx = { supabase, userId, apiKeyId, toolName, argsHash: await hashKey(argsJson) };
    }

    const server = new McpServer({ name: app.manifest.name, version: app.manifest.version });
    attachSdkTools(server, app, { userId, scopes });

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    await transport.close();
    await server.close();

    auditOk = res.statusCode < 400;
  } catch (error) {
    console.error('MCP endpoint error:', error);
    captureException(error, { tags: { endpoint: 'mcp' } });
    auditOk = false;
    auditError = error?.message ?? String(error);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (auditCtx && auditOk !== null) {
      writeAudit(auditCtx.supabase, {
        userId: auditCtx.userId,
        apiKeyId: auditCtx.apiKeyId,
        toolName: auditCtx.toolName,
        argsHash: auditCtx.argsHash,
        ok: auditOk,
        errorMessage: auditError,
      });
    }
  }
}
