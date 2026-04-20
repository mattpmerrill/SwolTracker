import { describe, it, expect, vi } from 'vitest';
import { createNaturalLanguageTools } from '../tools/natural-language.js';
import { createMcpMockSupabase } from './mockSupabase.js';

describe('MCP natural-language contract', () => {
  it('log_exercise returns a failure ToolResult when no gym is resolved', async () => {
    const sb = createMcpMockSupabase();
    const queries = {
      get_todays_workout: vi.fn(async () => ({
        success: true,
        message: '',
        data: { gym_id: undefined, exercises: [] },
      })),
      get_maxes: vi.fn(async () => ({ success: true, message: '', data: { maxes: {} } })),
    } as any;
    const actions = {
      log_many_sets: vi.fn(async () => ({
        success: true,
        message: '',
        data: { count: 0 },
      })),
    } as any;
    const tools = createNaturalLanguageTools(sb, 'u1', queries, actions);
    const result = await tools.log_exercise({
      exercise_name: 'Bench Press',
      sets: 3,
      reps: 8,
      weight_lbs: 185,
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('No gym found');
  });

  it('log_exercise logs sets through actions.log_many_sets when gym is resolved', async () => {
    const sb = createMcpMockSupabase();
    const queries = {
      get_todays_workout: vi.fn(async () => ({
        success: true,
        message: '',
        data: {
          gym_id: 'g1',
          current_week: 2,
          day_name: 'Monday',
          exercises: [{ name: 'Bench Press' }],
        },
      })),
      get_maxes: vi.fn(async () => ({ success: true, message: '', data: { maxes: {} } })),
    } as any;
    const logMany = vi.fn(async () => ({ success: true, message: 'ok', data: { count: 3 } }));
    const actions = { log_many_sets: logMany } as any;
    const tools = createNaturalLanguageTools(sb, 'u1', queries, actions);
    const result = await tools.log_exercise({
      exercise_name: 'Bench Press',
      sets: 3,
      reps: 8,
      weight_lbs: 185,
    });
    expect(result.success).toBe(true);
    expect(logMany).toHaveBeenCalledOnce();
    const entries = logMany.mock.calls[0][0] as any[];
    expect(entries).toHaveLength(3);
    expect(entries[0].exercise_name).toBe('Bench Press');
    expect(entries[0].actual_weight).toBe(185);
  });
});
