import { describe, it, expect, vi } from 'vitest';
import { createGenerationTools, type LlmCaller } from '../tools/generation.js';
import { createMcpMockSupabase } from './mockSupabase.js';

const stubQueries = {
  resolveGymId: vi.fn(async (gymId?: string) => gymId ?? 'g1'),
  resolveWritableGymId: vi.fn(async (gymId?: string) => gymId ?? 'g1'),
} as any;

function buildSavedActions(
  onSave: (args: {
    gymId: string | undefined;
    weekNumber: number;
    programData: unknown;
    aiGenerated?: boolean;
    aiNotes?: string;
  }) => void = () => undefined
) {
  return {
    save_workout_program: vi.fn(
      async (
        gymId: string | undefined,
        weekNumber: number,
        programData: unknown,
        aiGenerated?: boolean,
        aiNotes?: string,
      ) => {
        onSave({ gymId, weekNumber, programData, aiGenerated, aiNotes });
        return { success: true, message: `Saved week ${weekNumber}`, data: { week_number: weekNumber } };
      },
    ),
  } as any;
}

const sampleWeek = {
  Monday: { focus: 'Push', exercises: [{ name: 'Barbell Bench Press', sets: 3, reps: 5 }] },
  Tuesday: { focus: 'Rest', exercises: [] },
  Wednesday: { focus: 'Pull', exercises: [{ name: 'Barbell Row', sets: 3, reps: 5 }] },
  Thursday: { focus: 'Rest', exercises: [] },
  Friday: { focus: 'Legs', exercises: [{ name: 'Back Squat', sets: 3, reps: 5 }] },
  Saturday: { focus: 'Rest', exercises: [] },
  Sunday: { focus: 'Rest', exercises: [] },
};

function makeRebuiltWeek() {
  return {
    Monday: { focus: 'Push DB', exercises: [{ name: 'Dumbbell Bench Press', sets: 3, reps: 8 }] },
    Tuesday: { focus: 'Rest', exercises: [] },
    Wednesday: { focus: 'Pull DB', exercises: [{ name: 'Dumbbell Row', sets: 3, reps: 8 }] },
    Thursday: { focus: 'Rest', exercises: [] },
    Friday: { focus: 'Legs DB', exercises: [{ name: 'Goblet Squat', sets: 3, reps: 10 }] },
    Saturday: { focus: 'Rest', exercises: [] },
    Sunday: { focus: 'Rest', exercises: [] },
  };
}

function stubLlm(responseJson: unknown): LlmCaller {
  return vi.fn(async () => ({
    content: typeof responseJson === 'string' ? responseJson : JSON.stringify(responseJson),
    usage: { prompt_tokens: 100, completion_tokens: 200 },
    model: 'test-model',
  })) as unknown as LlmCaller;
}

describe('MCP generation contract — rebuild_week_for_constraints', () => {
  it('loads the week, calls the LLM, saves the rebuilt program', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 2, program_data: sampleWeek },
      error: null,
    });
    sb.respond('prompt_templates.single', {
      data: { template: 'You are a coach. Rebuild the week.' },
      error: null,
    });

    const rebuilt = makeRebuiltWeek();
    const llm = stubLlm(rebuilt);

    let savedArgs: any = null;
    const actions = buildSavedActions((a) => { savedArgs = a; });

    const tools = createGenerationTools(sb, 'u1', stubQueries, actions, llm);
    const result = await tools.rebuild_week_for_constraints(2, 'no barbell, traveling');

    expect(result.success).toBe(true);
    expect(result.message).toContain('Rebuilt Week 2');
    expect((llm as any).mock.calls).toHaveLength(1);
    const llmArgs = (llm as any).mock.calls[0][0];
    expect(llmArgs.requestType).toBe('weekly');
    expect(llmArgs.userPrompt).toContain('no barbell, traveling');
    expect(llmArgs.userPrompt).toContain('Week 2');

    expect(actions.save_workout_program).toHaveBeenCalledTimes(1);
    expect(savedArgs.weekNumber).toBe(2);
    expect(savedArgs.aiGenerated).toBe(true);
    expect(savedArgs.aiNotes).toContain('no barbell, traveling');
    expect((savedArgs.programData as any).Monday.exercises[0].name).toBe('Dumbbell Bench Press');
  });

  it('accepts LLM responses wrapped in ```json fences', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 1, program_data: sampleWeek },
      error: null,
    });
    sb.respond('prompt_templates.single', { data: { template: 'system' }, error: null });

    const rebuilt = makeRebuiltWeek();
    const fenced = '```json\n' + JSON.stringify(rebuilt) + '\n```';
    const llm = stubLlm(fenced);
    const actions = buildSavedActions();

    const tools = createGenerationTools(sb, 'u1', stubQueries, actions, llm);
    const result = await tools.rebuild_week_for_constraints(1, 'only 30 min sessions');
    expect(result.success).toBe(true);
    expect(actions.save_workout_program).toHaveBeenCalledTimes(1);
  });

  it('accepts LLM responses wrapped in { week1: {...} }', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 3, program_data: sampleWeek },
      error: null,
    });
    sb.respond('prompt_templates.single', { data: { template: 'system' }, error: null });

    const rebuilt = makeRebuiltWeek();
    const llm = stubLlm({ week1: rebuilt });
    const actions = buildSavedActions();

    const tools = createGenerationTools(sb, 'u1', stubQueries, actions, llm);
    const result = await tools.rebuild_week_for_constraints(3, 'shoulder injury');
    expect(result.success).toBe(true);
    expect(actions.save_workout_program).toHaveBeenCalledTimes(1);
    const savedWeek = (actions.save_workout_program as any).mock.calls[0][2];
    expect(savedWeek.Monday.exercises[0].name).toBe('Dumbbell Bench Press');
  });

  it('rejects invalid inputs', async () => {
    const sb = createMcpMockSupabase();
    const tools = createGenerationTools(sb, 'u1', stubQueries, buildSavedActions(), stubLlm({}));

    await expect(tools.rebuild_week_for_constraints(0, 'x')).rejects.toThrow(/positive integer/);
    await expect(tools.rebuild_week_for_constraints(1.5, 'x')).rejects.toThrow(/positive integer/);
    await expect(tools.rebuild_week_for_constraints(1, '')).rejects.toThrow(/non-empty/);
    await expect(
      tools.rebuild_week_for_constraints(1, 'a'.repeat(1001))
    ).rejects.toThrow(/1000 characters/);
  });

  it('surfaces a clear error when no server-side LLM caller is configured', async () => {
    const sb = createMcpMockSupabase();
    const tools = createGenerationTools(sb, 'u1', stubQueries, buildSavedActions());
    await expect(
      tools.rebuild_week_for_constraints(1, 'no barbell')
    ).rejects.toThrow(/LLM caller not configured/);
  });

  it('throws when the week has no existing program', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', { data: null, error: null });
    const tools = createGenerationTools(sb, 'u1', stubQueries, buildSavedActions(), stubLlm({}));
    await expect(
      tools.rebuild_week_for_constraints(99, 'travel')
    ).rejects.toThrow(/No program found/);
  });

  it('throws when LLM returns an incomplete week (missing days)', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 1, program_data: sampleWeek },
      error: null,
    });
    sb.respond('prompt_templates.single', { data: { template: 'system' }, error: null });

    const incomplete = { Monday: sampleWeek.Monday, Tuesday: sampleWeek.Tuesday };
    const llm = stubLlm(incomplete);
    const actions = buildSavedActions();

    const tools = createGenerationTools(sb, 'u1', stubQueries, actions, llm);
    await expect(
      tools.rebuild_week_for_constraints(1, 'travel')
    ).rejects.toThrow(/missing Wednesday/);
    expect(actions.save_workout_program).not.toHaveBeenCalled();
  });

  it('throws when LLM returns non-JSON', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 1, program_data: sampleWeek },
      error: null,
    });
    sb.respond('prompt_templates.single', { data: { template: 'system' }, error: null });

    const llm = stubLlm('this is not JSON at all');
    const tools = createGenerationTools(sb, 'u1', stubQueries, buildSavedActions(), llm);
    await expect(
      tools.rebuild_week_for_constraints(1, 'travel')
    ).rejects.toThrow(/not valid JSON/);
  });
});
