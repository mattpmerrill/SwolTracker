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

  it('get_todays_workout resolves incline dumbbell press from its own dumbbell max', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [{ gym_id: 'g1', role: 'member', gyms: { id: 'g1', name: 'Home' } }],
      error: null,
    });
    sb.respond('workout_programs.single', {
      data: {
        id: 'p1',
        gym_id: 'g1',
        week_number: 20,
        program_data: {
          Monday: {
            focus: 'Upper Body',
            exercises: [
              {
                name: 'Incline Dumbbell Press',
                sets: 3,
                reps: '10',
                percentages: [70, 70, 75],
              },
            ],
          },
        },
        created_by: 'u1',
        ai_generated: true,
        ai_notes: null,
        created_at: '2026-06-07T00:00:00.000Z',
      },
      error: null,
    });
    sb.respond('current_user_maxes.list', {
      data: [
        { user_id: 'u1', exercise_name: 'Incline Bench Press', weight_lbs: 185 },
        { user_id: 'u1', exercise_name: 'Incline Dumbbell Press', weight_lbs: 65 },
      ],
      error: null,
    });
    sb.respond('workout_logs.list', { data: [], error: null });
    sb.respond('workout_completions.maybeSingle', { data: null, error: null });

    const tools = createQueryTools(sb, 'u1');
    const result = await tools.get_todays_workout('g1', 'Monday', 20);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Incline Dumbbell Press');
    expect(result.message).toContain('@ 50 lbs');
    expect((result.data as any).exercises[0].max_1rm).toBe(65);
    expect((result.data as any).exercises[0].weight_lbs).toBe(50);
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
