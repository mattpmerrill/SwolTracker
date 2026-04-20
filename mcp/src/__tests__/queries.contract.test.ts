import { describe, it, expect } from 'vitest';
import { AppError, isAppError } from '@bot-native/sdk';
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

  it('get_profile throws AppError.notFound when profile missing', async () => {
    const sb = createMcpMockSupabase();
    const tools = createQueryTools(sb, 'u1');
    await expect(tools.get_profile()).rejects.toSatisfy((e: unknown) => {
      if (!isAppError(e)) return false;
      return e.code === 'not_found' && e.message === 'Profile not found.';
    });
  });

  it('compare_weeks throws AppError.invalidArgs when weeks are equal', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [{ gym_id: 'g1', role: 'member', gyms: { id: 'g1', name: 'Home' } }],
      error: null,
    });
    const tools = createQueryTools(sb, 'u1');
    await expect(tools.compare_weeks(2, 2)).rejects.toSatisfy((e: unknown) => {
      if (!isAppError(e)) return false;
      return e.code === 'invalid_args';
    });
  });
});
