import { describe, it, expect, vi } from 'vitest';
import { createNaturalLanguageTools } from '../tools/natural-language.js';
import type { LlmCaller } from '../tools/generation.js';
import { createMcpMockSupabase } from './mockSupabase.js';

function stubLlm(responseJson: unknown): LlmCaller {
  return vi.fn(async () => ({
    content: typeof responseJson === 'string' ? responseJson : JSON.stringify(responseJson),
    usage: { prompt_tokens: 50, completion_tokens: 80 },
    model: 'test-model',
  })) as unknown as LlmCaller;
}

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

  it('bulk_log_workout parses description via LLM and delegates to log_workout_summary', async () => {
    const sb = createMcpMockSupabase();
    const queries = {
      get_todays_workout: vi.fn(async () => ({
        success: true,
        message: '',
        data: {
          gym_id: 'g1',
          current_week: 3,
          day_name: 'Monday',
          exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: 5, weight_lbs: 185 }],
        },
      })),
      get_maxes: vi.fn(async () => ({ success: true, message: '', data: { maxes: {} } })),
    } as any;
    const logMany = vi.fn(async () => ({ success: true, message: 'ok', data: { count: 3 } }));
    const markComplete = vi.fn(async () => ({ success: true, message: 'done', data: {} }));
    const actions = { log_many_sets: logMany, mark_workout_complete: markComplete } as any;

    const llm = stubLlm({
      exercises: [
        { exercise_name: 'Barbell Bench Press', sets: 1, reps: 5, weight_lbs: 185 },
        { exercise_name: 'Barbell Bench Press', sets: 1, reps: 5, weight_lbs: 185 },
        { exercise_name: 'Barbell Bench Press', sets: 1, reps: 6, weight_lbs: 175 },
      ],
    });

    const tools = createNaturalLanguageTools(sb, 'u1', queries, actions, llm);
    const result = await tools.bulk_log_workout({
      description: 'benched 185x5, 185x5, 175x6',
    });

    expect(result.success).toBe(true);
    expect((llm as any).mock.calls).toHaveLength(1);
    const llmArgs = (llm as any).mock.calls[0][0];
    expect(llmArgs.userPrompt).toContain('benched 185x5, 185x5, 175x6');

    // log_workout_summary calls log_many_sets internally; 3 sets across 3 entries
    expect(logMany).toHaveBeenCalledTimes(1);
    const rows = (logMany.mock.calls[0] as unknown as any[])[0] as any[];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.exercise_name === 'Barbell Bench Press')).toBe(true);
    expect(rows.map((r) => r.actual_weight)).toEqual([185, 185, 175]);
    expect(rows.map((r) => r.actual_reps)).toEqual([5, 5, 6]);
    expect((result.data as any).parsed_from_description).toBe('benched 185x5, 185x5, 175x6');
  });

  it('bulk_log_workout accepts ```json-fenced LLM output', async () => {
    const sb = createMcpMockSupabase();
    const queries = {
      get_todays_workout: vi.fn(async () => ({
        success: true,
        message: '',
        data: { gym_id: 'g1', current_week: 1, day_name: 'Tuesday', exercises: [] },
      })),
      get_maxes: vi.fn(async () => ({ success: true, message: '', data: { maxes: {} } })),
    } as any;
    const logMany = vi.fn(async () => ({ success: true, message: 'ok', data: { count: 5 } }));
    const actions = { log_many_sets: logMany, mark_workout_complete: vi.fn() } as any;

    const raw = '```json\n' + JSON.stringify({
      exercises: [{ exercise_name: 'Back Squat', sets: 5, reps: 5, weight_lbs: 225 }],
    }) + '\n```';
    const llm = stubLlm(raw);

    const tools = createNaturalLanguageTools(sb, 'u1', queries, actions, llm);
    const result = await tools.bulk_log_workout({ description: 'squat 5x5 at 225' });
    expect(result.success).toBe(true);
    const rows = (logMany.mock.calls[0] as unknown as any[])[0] as any[];
    expect(rows).toHaveLength(5);
  });

  it('bulk_log_workout rejects invalid inputs', async () => {
    const sb = createMcpMockSupabase();
    const tools = createNaturalLanguageTools(sb, 'u1', {} as any, {} as any, stubLlm({}));
    await expect(tools.bulk_log_workout({ description: '' })).rejects.toThrow(/non-empty/);
    await expect(
      tools.bulk_log_workout({ description: 'x'.repeat(2001) })
    ).rejects.toThrow(/2000 characters/);
  });

  it('bulk_log_workout surfaces a clear error when no server-side LLM caller is configured', async () => {
    const sb = createMcpMockSupabase();
    const tools = createNaturalLanguageTools(sb, 'u1', {} as any, {} as any);
    await expect(
      tools.bulk_log_workout({ description: 'bench 3x5 at 185' })
    ).rejects.toThrow(/LLM caller not configured/);
  });

  it('bulk_log_workout throws when LLM returns non-JSON', async () => {
    const sb = createMcpMockSupabase();
    const tools = createNaturalLanguageTools(sb, 'u1', {} as any, {} as any, stubLlm('not json'));
    await expect(
      tools.bulk_log_workout({ description: 'bench 3x5' })
    ).rejects.toThrow(/not valid JSON/);
  });

  it('bulk_log_workout throws when LLM returns empty exercises array', async () => {
    const sb = createMcpMockSupabase();
    const tools = createNaturalLanguageTools(sb, 'u1', {} as any, {} as any, stubLlm({ exercises: [] }));
    await expect(
      tools.bulk_log_workout({ description: 'nothing' })
    ).rejects.toThrow(/non-empty exercises array/);
  });

  it('bulk_log_workout throws when an exercise is missing exercise_name', async () => {
    const sb = createMcpMockSupabase();
    const tools = createNaturalLanguageTools(
      sb,
      'u1',
      {} as any,
      {} as any,
      stubLlm({ exercises: [{ sets: 3, reps: 5, weight_lbs: 185 }] })
    );
    await expect(
      tools.bulk_log_workout({ description: 'bench 3x5' })
    ).rejects.toThrow(/missing exercise_name/);
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
    const entries = (logMany.mock.calls[0] as unknown as any[])[0] as any[];
    expect(entries).toHaveLength(3);
    expect(entries[0].exercise_name).toBe('Bench Press');
    expect(entries[0].actual_weight).toBe(185);
  });
});
