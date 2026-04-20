import { describe, it, expect } from 'vitest';
import { createQueryTools } from '../tools/queries.js';
import { createMcpMockSupabase } from './mockSupabase.js';

describe('MCP queries contract', () => {
  it('get_maxes returns ToolResult with maxes map', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('current_user_maxes.list', {
      data: [
        { user_id: 'u1', exercise_name: 'Bench Press', weight_lbs: 225 },
        { user_id: 'u1', exercise_name: 'Squat', weight_lbs: 315 },
      ],
      error: null,
    });
    const tools = createQueryTools(sb, 'u1');
    const result = await tools.get_maxes();
    expect(result.success).toBe(true);
    expect(typeof result.message).toBe('string');
    expect((result.data as any).maxes).toEqual({ 'Bench Press': 225, Squat: 315 });
  });

  it('get_profile surfaces a not-found result when profile missing', async () => {
    const sb = createMcpMockSupabase();
    const tools = createQueryTools(sb, 'u1');
    const result = await tools.get_profile();
    expect(result.success).toBe(false);
    expect(result.message).toBe('Profile not found.');
  });
});
