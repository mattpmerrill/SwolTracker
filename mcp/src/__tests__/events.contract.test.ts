import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createActionTools } from '../tools/actions.js';
import { createMcpMockSupabase } from './mockSupabase.js';
import type { EventEmitter } from '../bot-native-shim.js';

function makeEvents(): EventEmitter & { emit: ReturnType<typeof vi.fn> } {
  return { emit: vi.fn(async () => undefined) } as any;
}

function makeQueries(todaysWorkout?: unknown) {
  return {
    resolveGymId: vi.fn(async (_g?: string) => 'g1'),
    get_todays_workout: vi.fn(async () => ({
      success: true,
      message: '',
      data: todaysWorkout ?? {
        rest_day: false,
        exercises: [{ name: 'Bench' }],
        total_logged_sets: 0,
        current_week: 1,
        focus: 'Push',
        total_exercises: 1,
      },
    })),
  } as any;
}

describe('event emissions (Phase 3.2 canonical names)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mark_workout_complete emits workout.completed', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', { data: { program_start_date: null }, error: null });
    sb.respond('workout_completions.single', {
      data: { id: 'c1', day_name: 'Monday', week_number: 1 },
      error: null,
    });
    sb.respond('workout_logs.list', { data: [{ id: 'l1' }, { id: 'l2' }], error: null });
    const events = makeEvents();
    const tools = createActionTools(sb, 'u1', events, makeQueries());
    const r = await tools.mark_workout_complete('g1', 1, 'Monday');
    expect(r.success).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'workout.completed',
      'u1',
      expect.objectContaining({ day_name: 'Monday', week_number: 1, total_sets: 2 }),
    );
  });

  it('update_max emits max.updated with is_pr=true AND milestone.hit on PR', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('current_user_maxes.single', { data: { weight_lbs: 200 }, error: null });
    sb.respond('user_maxes.single', {
      data: { id: 'm1', exercise_name: 'Bench Press', weight_lbs: 225 },
      error: null,
    });
    const events = makeEvents();
    const tools = createActionTools(sb, 'u1', events, makeQueries());
    const r = await tools.update_max('Bench Press', 225);
    expect(r.success).toBe(true);
    expect((r.data as any).is_pr).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'max.updated',
      'u1',
      expect.objectContaining({ exercise: 'Barbell Bench Press', old_max: 200, new_max: 225, is_pr: true }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      'milestone.hit',
      'u1',
      expect.objectContaining({ kind: 'pr', exercise: 'Barbell Bench Press', new_pr: 225, improvement_lbs: 25 }),
    );
  });

  it('update_max emits max.updated with is_pr=false and NO milestone.hit on non-PR', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('current_user_maxes.single', { data: { weight_lbs: 250 }, error: null });
    sb.respond('user_maxes.single', {
      data: { id: 'm2', exercise_name: 'Bench Press', weight_lbs: 225 },
      error: null,
    });
    const events = makeEvents();
    const tools = createActionTools(sb, 'u1', events, makeQueries());
    const r = await tools.update_max('Bench Press', 225);
    expect(r.success).toBe(true);
    expect((r.data as any).is_pr).toBe(false);
    const calls = (events.emit as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContain('max.updated');
    expect(calls).not.toContain('milestone.hit');
  });

  it('update_max emits max.updated with is_pr=false when no prior max exists', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('current_user_maxes.single', { data: null, error: null });
    sb.respond('user_maxes.single', {
      data: { id: 'm3', exercise_name: 'Squat', weight_lbs: 300 },
      error: null,
    });
    const events = makeEvents();
    const tools = createActionTools(sb, 'u1', events, makeQueries());
    const r = await tools.update_max('Squat', 300);
    expect(r.success).toBe(true);
    expect((r.data as any).is_pr).toBe(false);
    const calls = (events.emit as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toEqual(['max.updated']);
  });

  it('save_workout_program emits program.saved', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('workout_programs.single', { data: { id: 'p1', week_number: 1 }, error: null });
    const events = makeEvents();
    const tools = createActionTools(sb, 'u1', events, makeQueries());
    // Schema-valid minimal week: all 7 days present, each with an empty exercises array.
    const validWeek = {
      Monday: { focus: 'Rest', exercises: [] },
      Tuesday: { focus: 'Rest', exercises: [] },
      Wednesday: { focus: 'Rest', exercises: [] },
      Thursday: { focus: 'Rest', exercises: [] },
      Friday: { focus: 'Rest', exercises: [] },
      Saturday: { focus: 'Rest', exercises: [] },
      Sunday: { focus: 'Rest', exercises: [] },
    };
    const r = await tools.save_workout_program('g1', 1, validWeek, true);
    expect(r.success).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'program.saved',
      'u1',
      expect.objectContaining({ week_number: 1, gym_id: 'g1', ai_generated: true }),
    );
  });

  it('log_missed_day emits workout.missed', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('profiles.single', { data: { program_start_date: null }, error: null });
    sb.respond('workout_completions.maybeSingle', { data: null, error: null });
    sb.respond('missed_days.list', { data: null, error: null });
    const events = makeEvents();
    const tools = createActionTools(sb, 'u1', events, makeQueries());
    const r = await tools.log_missed_day('Monday', 1, 'Sick', 'g1');
    expect(r.success).toBe(true);
    expect(events.emit).toHaveBeenCalledWith(
      'workout.missed',
      'u1',
      expect.objectContaining({ day_name: 'Monday', week_number: 1, reason: 'Sick' }),
    );
  });

  it('check_workout_reminder dedupes by the new workout.reminder event_name', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('app_events.list', {
      data: [{ id: 'e1' }],
      error: null,
    });
    const events = makeEvents();
    const tools = createActionTools(
      sb,
      'u1',
      events,
      makeQueries({
        rest_day: false,
        exercises: [{ name: 'Bench' }],
        total_logged_sets: 0,
        current_week: 1,
        focus: 'Push',
        total_exercises: 1,
      }),
    );
    // Force the hour threshold to pass so dedupe path is reached
    const r = await tools.check_workout_reminder(0, 'g1');
    expect(r.success).toBe(true);
    expect((r.data as any).reason).toBe('already_reminded');
    expect(events.emit).not.toHaveBeenCalled();
  });
});
