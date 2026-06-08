import { describe, it, expect } from 'vitest';
import { createLogsRepo } from './logs';
import { createMockSupabase } from '../../test/mockSupabase';

describe('logsRepo', () => {
  it('getUserWorkoutLogs returns rows for the given user/week', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_logs', 'list', {
      data: [
        { id: 'l1', user_id: 'u1', week_number: 1, day_name: 'Monday', exercise_name: 'Bench' },
      ],
      error: null,
    });
    const repo = createLogsRepo(sb);
    const logs = await repo.getUserWorkoutLogs('u1', 1);
    expect(logs).toHaveLength(1);
    expect(logs[0].exercise_name).toBe('Bench');
  });

  it('logSet upserts and returns the new row', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_logs', 'single', {
      data: { id: 'l1', user_id: 'u1', exercise_name: 'Bench', actual_weight: 185, actual_reps: 8 },
      error: null,
    });
    const repo = createLogsRepo(sb);
    const log = await repo.logSet('u1', 'g1', 1, 'Monday', 0, 0, 'Bench', {
      prescribedWeight: 185,
      prescribedReps: 8,
      actualReps: 8,
    });
    expect(log?.id).toBe('l1');
    expect(log?.actual_weight).toBe(185);
  });

  it('logSet persists actual_weight distinct from prescribed_weight when user scales down', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_logs', 'single', {
      data: { id: 'l2', actual_weight: 170, prescribed_weight: 185, actual_reps: 5 },
      error: null,
    });
    const repo = createLogsRepo(sb);
    await repo.logSet('u1', 'g1', 1, 'Monday', 0, 0, 'Bench', {
      prescribedWeight: 185,
      prescribedReps: 5,
      actualWeight: 170,
      actualReps: 5,
    });
    const upsertCall = sb.calls.find(([t, m]) => t === 'workout_logs' && m === 'upsert');
    const payload = upsertCall?.[2]?.[0];
    expect(payload.prescribed_weight).toBe(185);
    expect(payload.actual_weight).toBe(170);
    expect(payload.prescribed_reps).toBe(5);
    expect(payload.actual_reps).toBe(5);
  });

  it('logSet persists actual_weight even when the program has no prescribed weight', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_logs', 'single', {
      data: { id: 'l3', actual_weight: 35, prescribed_weight: null, actual_reps: 12 },
      error: null,
    });
    const repo = createLogsRepo(sb);
    await repo.logSet('u1', 'g1', 1, 'Monday', 1, 0, 'Walking Lunge', {
      prescribedWeight: null,
      prescribedReps: 12,
      actualWeight: 35,
      actualReps: 12,
    });
    const upsertCall = sb.calls.find(([t, m]) => t === 'workout_logs' && m === 'upsert');
    const payload = upsertCall?.[2]?.[0];
    expect(payload.prescribed_weight).toBeNull();
    expect(payload.actual_weight).toBe(35);
  });
});
