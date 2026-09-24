import { describe, it, expect, vi } from 'vitest';
import { epleyE1RM, findEstimatedPrs } from '../e1rm.js';
import { createActionTools } from '../tools/actions.js';
import { createMcpMockSupabase } from './mockSupabase.js';

describe('MCP epleyE1RM', () => {
  it('matches the web formula', () => {
    expect(epleyE1RM(225, 5)).toBeCloseTo(262.5, 1);
    expect(epleyE1RM(225, '5')).toBeCloseTo(262.5, 1);
  });
  it('rejects unloaded, >10, and non-numeric reps', () => {
    expect(epleyE1RM(0, 5)).toBeNull();
    expect(epleyE1RM(225, 11)).toBeNull();
    expect(epleyE1RM(225, '8-10')).toBeNull();
    expect(epleyE1RM(225, 'AMRAP')).toBeNull();
  });
});

describe('findEstimatedPrs', () => {
  it('keys PRs by the recorded max name and keeps the best set', () => {
    const prs = findEstimatedPrs(
      [
        { exercise_name: 'Bench Press', actual_weight: 215, actual_reps: 5 },
        { exercise_name: 'Bench Press', actual_weight: 225, actual_reps: 5 },
        { exercise_name: 'Plank', actual_weight: 45, actual_reps: 1 },
      ],
      { 'Barbell Bench Press': 240 },
    );
    expect(prs).toEqual([
      {
        exercise_name: 'Barbell Bench Press',
        estimated_max_lbs: 265,
        recorded_max_lbs: 240,
        gain_lbs: 25,
        from_set: { weight_lbs: 225, reps: 5 },
      },
    ]);
  });
  it('returns nothing when no set beats the max', () => {
    expect(findEstimatedPrs([{ exercise_name: 'Bench Press', actual_weight: 185, actual_reps: 5 }], { 'Barbell Bench Press': 240 })).toEqual([]);
  });
});

describe('generate_weekly_summary estimated PRs', () => {
  it('reports unsaved estimated PRs and skips lifts already saved this week', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', { data: { program_start_date: '2026-01-05' }, error: null });
    sb.respond('workout_logs.list', {
      data: [
        { day_name: 'Monday', exercise_name: 'Bench Press', actual_weight: 225, actual_reps: 5, completed: true },
        { day_name: 'Monday', exercise_name: 'Back Squat', actual_weight: 250, actual_reps: 5, completed: true },
      ],
      error: null,
    });
    sb.respond('workout_completions.list', { data: [{ day_name: 'Monday' }], error: null });
    sb.respond('workout_programs.single', { data: { program_data: { Monday: { exercises: [{}] } } }, error: null });
    sb.respond('user_maxes.list', {
      data: [{ exercise_name: 'Barbell Back Squat', weight_lbs: 290, recorded_at: '2026-01-06T00:00:00Z' }],
      error: null,
    });
    sb.respond('current_user_maxes.list', {
      data: [
        { exercise_name: 'Barbell Bench Press', weight_lbs: 240 },
        { exercise_name: 'Barbell Back Squat', weight_lbs: 260 },
      ],
      error: null,
    });
    const queries = { resolveGymId: vi.fn(async () => 'g1') } as any;
    const tools = createActionTools(sb, 'u1', { emit: vi.fn() } as any, queries);
    const result = await tools.generate_weekly_summary(1);
    const data = result.data as any;
    expect(data.estimated_prs.map((p: any) => p.exercise_name)).toEqual(['Barbell Bench Press']);
    expect(data.estimated_prs[0].estimated_max_lbs).toBe(265);
    expect(result.message).toContain('Estimated PRs (not saved yet): Barbell Bench Press ~265 lbs (+25, from 225x5)');
  });
});
