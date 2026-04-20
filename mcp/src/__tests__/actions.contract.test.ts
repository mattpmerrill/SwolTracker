import { describe, it, expect, vi } from 'vitest';
import { createActionTools } from '../tools/actions.js';
import { createMcpMockSupabase } from './mockSupabase.js';
import type { EventEmitter } from '../bot-native-shim.js';

const stubEvents: EventEmitter = {
  emit: vi.fn(async () => undefined),
} as any;

const stubQueries = {
  resolveGymId: vi.fn(async (_gymId?: string) => 'g1'),
  // only methods actually invoked by update_max/log_set are referenced
} as any;

describe('MCP actions contract', () => {
  it('update_max inserts a new max row and returns ToolResult', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('current_user_maxes.single', { data: null, error: null });
    sb.respond('user_maxes.single', {
      data: { id: 'm1', user_id: 'u1', exercise_name: 'Deadlift', weight_lbs: 405 },
      error: null,
    });
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    const result = await tools.update_max('Deadlift', 405);
    expect(result.success).toBe(true);
    expect(result.message).toContain('405');
    expect((result.data as any).record.weight_lbs).toBe(405);
  });

  it('update_max surfaces an error ToolResult when insert fails', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('user_maxes.single', {
      data: null,
      error: { message: 'constraint violation' },
    });
    const tools = createActionTools(sb, 'u1', stubEvents, stubQueries);
    const result = await tools.update_max('Deadlift', 405);
    expect(result.success).toBe(false);
    expect(result.message).toContain('constraint violation');
  });
});
