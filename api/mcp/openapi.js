// Serves the OpenAPI 3.1 document for the MCP tool catalog.
// Public endpoint — no auth. The doc describes the shape of every tool;
// knowing the shape isn't sensitive. Actual tool calls still require a bearer key.
//
// The SDK builds the document from the registered tools' Zod schemas + scopes,
// so this stays in lockstep with whatever `sdk-adapter.ts` currently registers.

import { buildOpenApiDocument } from '@bot-native/sdk';
import { buildApp } from '../../mcp/dist/sdk-adapter.js';
import { getSupabase, setCorsHeaders } from '../_mcp-shared.js';

function resolveServerUrl(req) {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = req.headers['x-forwarded-proto'] ?? 'https';
  return host ? `${proto}://${host}/api/mcp` : '/api/mcp';
}

export default async function handler(req, res) {
  setCorsHeaders(res, req);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' });

  try {
    const app = buildApp(getSupabase());
    const doc = buildOpenApiDocument(app, { serverUrl: resolveServerUrl(req) });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(JSON.stringify(doc, null, 2));
  } catch (error) {
    console.error('OpenAPI endpoint error:', error);
    return res.status(500).json({ error: 'Failed to build OpenAPI document' });
  }
}
