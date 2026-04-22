import { describe, it, expect } from 'vitest';
import { executeToolWithGuards } from '@bot-native/sdk';
import { buildApp } from '../sdk-adapter.js';
import { createMcpMockSupabase } from './mockSupabase.js';

function findTool(appName: string, toolName: string) {
  const app = buildApp(createMcpMockSupabase() as any);
  const tool = app.tools.find((t) => t.name === toolName);
  if (!tool) throw new Error(`Tool ${toolName} not found in ${appName}`);
  return { app, tool };
}

function ctxFor(app: unknown, scopes: string[] | undefined) {
  return {
    request: { identity: { userId: 'u1', scopes }, requestId: 'r1', transport: 'http' as const },
    app: app as any,
  };
}

describe('scope enforcement — MCP tools', () => {
  it('save_workout_program rejects identity missing write:program', async () => {
    const { app, tool } = findTool('swoltracker', 'save_workout_program');
    const result = await executeToolWithGuards(
      tool,
      { week_number: 1, program_data: {} },
      ctxFor(app, ['read', 'write:logs', 'coach'])
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('forbidden');
    expect(result.error?.details).toMatchObject({
      tool: 'save_workout_program',
      missing: ['write:program'],
    });
  });

  it('save_workout_program passes the scope guard when write:program is granted', async () => {
    const { app, tool } = findTool('swoltracker', 'save_workout_program');
    const result = await executeToolWithGuards(
      tool,
      { week_number: 1, program_data: {} },
      ctxFor(app, ['write:program'])
    );
    // Guard allows it through — downstream may still fail on mock Supabase, but
    // the failure code must NOT be `forbidden` from the scope layer.
    if (result.ok === false) {
      expect(result.error?.code).not.toBe('forbidden');
    }
  });

  it('read-only tool rejects identity with no scopes', async () => {
    const { app, tool } = findTool('swoltracker', 'get_profile');
    const result = await executeToolWithGuards(tool, {}, ctxFor(app, []));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('forbidden');
    expect(result.error?.details).toMatchObject({ missing: ['read'] });
  });

  it('send_coach_message requires coach scope', async () => {
    const { app, tool } = findTool('swoltracker', 'send_coach_message');
    const result = await executeToolWithGuards(
      tool,
      { content: 'hello' },
      ctxFor(app, ['read', 'write:logs', 'write:program'])
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('forbidden');
    expect(result.error?.details).toMatchObject({ missing: ['coach'] });
  });

  it('log_set requires write:logs — read alone is insufficient', async () => {
    const { app, tool } = findTool('swoltracker', 'log_set');
    const result = await executeToolWithGuards(
      tool,
      { exercise_index: 0, set_index: 0, exercise_name: 'Bench', actual_weight: 100, actual_reps: 5 },
      ctxFor(app, ['read'])
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('forbidden');
    expect(result.error?.details).toMatchObject({ missing: ['write:logs'] });
  });

  it('undefined identity.scopes fails closed (denies everything requiring a scope)', async () => {
    const { app, tool } = findTool('swoltracker', 'get_profile');
    const result = await executeToolWithGuards(tool, {}, ctxFor(app, undefined));
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('forbidden');
  });
});
