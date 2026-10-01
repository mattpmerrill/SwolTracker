import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { executeToolWithGuards } from '@bot-native/sdk';
import { buildApp } from '../sdk-adapter.js';
import { createMcpMockSupabase } from './mockSupabase.js';

/**
 * Goes through the real McpServer registration and input-parse path, wired the way
 * api/mcp.js `attachSdkTools` wires it. Direct calls to the tool functions skip the
 * SDK's z.object parse, which silently strips undeclared keys, so they cannot prove
 * what an agent actually experiences.
 */
async function connect(sb: ReturnType<typeof createMcpMockSupabase>) {
  const app = buildApp(sb as any);
  const identity = { userId: 'u1', scopes: ['read', 'write:logs', 'write:program', 'coach'] };
  const server = new McpServer({ name: app.manifest.name, version: app.manifest.version });
  for (const tool of app.tools) {
    server.tool(tool.name, tool.description, tool.schema, async (params: any) => {
      const ctx = { request: { identity, requestId: randomUUID(), transport: 'http' as const }, app };
      const result = await executeToolWithGuards(tool, params, ctx as any);
      const text = result.ok
        ? result.message
        : JSON.stringify({ ok: false, message: result.message, error: result.error });
      return { content: [{ type: 'text' as const, text }] };
    });
  }
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: () => Promise.all([client.close(), server.close()]) };
}

const textOf = (res: any) => (res.content as Array<{ text: string }>).map((c) => c.text).join('\n');
const profileUpdates = (sb: ReturnType<typeof createMcpMockSupabase>) =>
  sb.calls.filter(([table, op]) => table === 'profiles' && op === 'update');

describe('update_profile through the real MCP server path', () => {
  const START_MSG = "program_start_date can't be changed after onboarding";

  it('rejects program_start_date on its own with a clear message and writes nothing', async () => {
    const sb = createMcpMockSupabase();
    const { client, close } = await connect(sb);
    const res: any = await client.callTool({ name: 'update_profile', arguments: { program_start_date: '2026-05-04' } });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain(START_MSG);
    expect(profileUpdates(sb)).toHaveLength(0);
    await close();
  });

  it('rejects a mixed call and applies none of it', async () => {
    const sb = createMcpMockSupabase();
    const { client, close } = await connect(sb);
    const res: any = await client.callTool({
      name: 'update_profile',
      arguments: { age: 36, program_start_date: '2026-05-04' },
    });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain(START_MSG);
    expect(profileUpdates(sb)).toHaveLength(0);
    await close();
  });

  it('still applies ordinary fields', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', { data: { age: 36 }, error: null });
    const { client, close } = await connect(sb);
    const res: any = await client.callTool({ name: 'update_profile', arguments: { age: 36 } });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toContain('Updated 1 field: age');
    const updates = profileUpdates(sb);
    expect(updates).toHaveLength(1);
    expect(updates[0][2][0]).not.toHaveProperty('program_start_date');
    await close();
  });
});
