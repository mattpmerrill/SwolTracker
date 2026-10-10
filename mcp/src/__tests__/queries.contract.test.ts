import { describe, it, expect, vi } from 'vitest';
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

  it('get_todays_workout matches 1RMs on the raw maxes key, not only canonical aliases', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [{ gym_id: 'g1', role: 'member', gyms: { id: 'g1', name: 'Home' } }],
      error: null,
    });
    sb.respond('workout_programs.single', {
      data: {
        id: 'p1',
        gym_id: 'g1',
        week_number: 34,
        program_data: {
          Monday: {
            focus: 'Upper',
            exercises: [
              {
                name: 'Incline Bench Press',
                sets: 4,
                reps: '8',
                percentages: [70, 73, 76, 78],
                weight_lbs: 145,
              },
              {
                name: 'Pendlay Rows',
                sets: 4,
                reps: '6',
                percentages: [70, 73, 75, 75],
                weight_lbs: 125,
              },
            ],
          },
        },
        created_by: 'u1',
        ai_generated: true,
        ai_notes: null,
        created_at: '2026-09-13T00:00:00.000Z',
      },
      error: null,
    });
    sb.respond('current_user_maxes.list', {
      data: [
        { user_id: 'u1', exercise_name: 'Incline Bench Press', weight_lbs: 185 },
        { user_id: 'u1', exercise_name: 'Pendlay Rows', weight_lbs: 165 },
      ],
      error: null,
    });
    sb.respond('workout_logs.list', { data: [], error: null });
    sb.respond('workout_completions.maybeSingle', { data: null, error: null });

    const tools = createQueryTools(sb, 'u1');
    const result = await tools.get_todays_workout('g1', 'Monday', 34);

    expect(result.success).toBe(true);
    const exercises = (result.data as any).exercises;
    expect(exercises[0].name).toBe('Incline Bench Press');
    expect(exercises[0].max_1rm).toBe(185);
    expect(exercises[0].weight_lbs).toBe(145); // 78% of 185 → 144.3 → 145
    expect(exercises[1].name).toBe('Pendlay Rows');
    expect(exercises[1].max_1rm).toBe(165);
    expect(exercises[1].weight_lbs).toBe(125); // 75% of 165 → 123.75 → 125
  });

  it('resolveGymId returns null when the caller is not a member of the supplied gym', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [{ gym_id: 'g-mine', role: 'owner', gyms: { id: 'g-mine', name: 'Mine' } }],
      error: null,
    });
    const tools = createQueryTools(sb, 'u1');
    expect(await tools.resolveGymId('g-stranger')).toBeNull();
    expect(await tools.resolveGymId('g-mine')).toBe('g-mine');
  });

  it('resolveWritableGymId ignores gyms the caller only belongs to as a member', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [
        { gym_id: 'g-shared', role: 'member', gyms: { id: 'g-shared', name: 'Shared' } },
        { gym_id: 'g-mine', role: 'owner', gyms: { id: 'g-mine', name: 'Mine' } },
      ],
      error: null,
    });
    const tools = createQueryTools(sb, 'u1');
    expect(await tools.resolveWritableGymId('g-shared')).toBeNull();
    expect(await tools.resolveWritableGymId('g-mine')).toBe('g-mine');
    expect(await tools.resolveWritableGymId()).toBe('g-mine');
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

  it('getMyGyms orders by joined_at then gym_id so "first gym" is deterministic', async () => {
    const sb = createMcpMockSupabase();
    sb.respond('gym_members.list', {
      data: [
        { gym_id: 'g1', role: 'owner', gyms: { id: 'g1', name: 'First' } },
        { gym_id: 'g2', role: 'member', gyms: { id: 'g2', name: 'Second' } },
      ],
      error: null,
    });
    const tools = createQueryTools(sb, 'u1');
    const gyms = await tools.getMyGyms();
    expect(gyms.map((g: any) => g.id)).toEqual(['g1', 'g2']);
    const orders = sb.calls.filter(([table, op]) => table === 'gym_members' && op === 'order');
    expect(orders.map(([, , args]) => args)).toEqual([
      ['joined_at', { ascending: true }],
      ['gym_id', { ascending: true }],
    ]);
  });

  // Unmeasured mobility/timed work must not look like missed reps. These rows
  // match sets Aleesha actually saved: completed, actual_reps NULL.
  function unmeasuredCoachingFixture() {
    const row = (
      day: string,
      exercise: string,
      prescribed: number | string,
      actual: number | string | null,
      weight: number | null = null,
    ) => ({
      week_number: 1,
      day_name: day,
      exercise_name: exercise,
      actual_weight: weight,
      actual_reps: actual,
      prescribed_weight: weight,
      prescribed_reps: prescribed,
      completed: true,
      completed_at: '2026-10-01T18:00:00.000Z',
    });
    return [
      row('Monday', 'Jaw Release', '20s', null),
      row('Wednesday', 'Jaw Release', '20s', null),
      row('Monday', 'Face Yoga', '10x', null),
      row('Wednesday', 'Face Yoga', '10x', null),
      row('Monday', 'Goblet Squat', 10, 8, 25),
      row('Wednesday', 'Goblet Squat', 10, 8, 25),
      row('Monday', 'Bench Press', 10, 10, 95),
      row('Tuesday', 'Bench Press', '30–40 sec', null),
      row('Wednesday', 'Bench Press', 10, 10, 95),
      row('Friday', 'Bench Press', 10, 10, 95),
    ];
  }

  function seedCoachingReads(sb: ReturnType<typeof createMcpMockSupabase>, logs: unknown[]) {
    sb.respond('gym_members.list', {
      data: [{ gym_id: 'g1', role: 'owner', gyms: { id: 'g1', name: 'Home' } }],
      error: null,
    });
    sb.respond('profiles.single', {
      data: { id: 'u1', name: 'Aleesha', program_start_date: null },
      error: null,
    });
    sb.respond('current_user_maxes.list', { data: [], error: null });
    sb.respond('workout_logs.list', { data: logs, error: null });
    sb.respond('workout_completions.list', { data: [], error: null });
    sb.respond('missed_days.list', { data: [], error: null });
    sb.respond('workout_programs.list', { data: [], error: null });
    sb.respond('session_notes.list', { data: [], error: null });
  }

  it('does not deload unmeasured timed or per-side sets, and still flags real misses and hits', async () => {
    const sb = createMcpMockSupabase();
    seedCoachingReads(sb, unmeasuredCoachingFixture());
    const tools = createQueryTools(sb, 'u1');
    const result = await tools.get_overload_recommendations('g1', 4);
    const recs = (result.data as any).recommendations as Array<{ exercise_name: string; type: string; status_label: string }>;
    const byName = Object.fromEntries(recs.map((rec) => [rec.exercise_name, rec]));

    expect(byName['Jaw Release']).toBeUndefined();
    expect(byName['Face Yoga']).toBeUndefined();
    expect(result.message).not.toContain('Jaw Release');
    expect(result.message).not.toContain('Face Yoga');

    expect(byName['Goblet Squat']?.type).toBe('deload');
    expect(byName['Goblet Squat']?.status_label).toBe('Check load');

    // The timed Tuesday session is skipped, so the three measured hits still level up.
    expect(byName['Bench Press']?.type).toBe('increase');
    expect(byName['Bench Press']?.status_label).toBe('Ready to level up');
  });

  it('prints done (no rep count) for unmeasured sessions, not missed reps', async () => {
    const sb = createMcpMockSupabase();
    seedCoachingReads(sb, [
      {
        week_number: 1,
        day_name: 'Monday',
        exercise_name: 'Jaw Release',
        actual_weight: null,
        actual_reps: null,
        prescribed_weight: null,
        prescribed_reps: '20s',
        completed: true,
        completed_at: '2026-10-01T18:00:00.000Z',
      },
      {
        week_number: 1,
        day_name: 'Monday',
        exercise_name: 'Goblet Squat',
        actual_weight: 25,
        actual_reps: 8,
        prescribed_weight: 25,
        prescribed_reps: 10,
        completed: true,
        completed_at: '2026-10-01T18:00:00.000Z',
      },
    ]);
    const tools = createQueryTools(sb, 'u1');
    const result = await tools.get_training_history_summary('g1', 4);
    const sessions = (result.data as any).week_summaries[1].exercise_sessions as Array<{
      exercise_name: string;
      hit_all_reps: boolean;
      outcome: string;
    }>;
    const jaw = sessions.find((session) => session.exercise_name === 'Jaw Release');
    const squat = sessions.find((session) => session.exercise_name === 'Goblet Squat');

    expect(jaw?.outcome).toBe('done_unmeasured');
    expect(jaw?.hit_all_reps).toBe(false);
    expect(squat?.outcome).toBe('missed');
    expect(result.message).toContain('Jaw Release');
    expect(result.message).toContain('done (no rep count)');
    expect(result.message).not.toMatch(/Jaw Release:.*missed/);
    expect(result.message).toContain('missed reps');
  });

  it('get_todays_workout without week/day uses the user zone, not the process clock', async () => {
    // Sunday 22:30 MDT. A UTC process clock already thinks this is Monday of week 19.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T04:30:00Z'));
    try {
      const sb = createMcpMockSupabase();
      sb.respond('gym_members.list', {
        data: [{ gym_id: 'g1', role: 'owner', gyms: { id: 'g1', name: 'Home' } }],
        error: null,
      });
      sb.respond('profiles.single', {
        data: { program_start_date: '2026-06-01', timezone: null },
        error: null,
      });
      const tools = createQueryTools(sb, 'u1');
      const result = await tools.get_todays_workout();
      expect((result.data as any).current_week).toBe(18);
      expect((result.data as any).day_name).toBe('Sunday');
    } finally {
      vi.useRealTimers();
    }
  });
});
