import { describe, expect, it } from 'vitest';
import { buildOverloadInsights, buildTrainingInsights } from './insightsBuilders';
import { createMockSupabase } from '../../test/mockSupabase';

function log(day, exercise, prescribed, actual, weight = null) {
  return {
    week_number: 1,
    day_name: day,
    exercise_name: exercise,
    actual_weight: weight,
    actual_reps: actual,
    prescribed_weight: weight,
    prescribed_reps: prescribed,
    completed: true,
    completed_at: '2026-10-01T18:00:00.000Z',
  };
}

function seed(sb, logs) {
  sb.respond('profiles', 'single', {
    data: { name: 'Aleesha', program_start_date: null },
    error: null,
  });
  sb.respond('current_user_maxes', 'list', { data: [], error: null });
  sb.respond('workout_logs', 'list', { data: logs, error: null });
  sb.respond('workout_completions', 'list', { data: [], error: null });
  sb.respond('missed_days', 'list', { data: [], error: null });
  sb.respond('workout_programs', 'list', { data: [], error: null });
}

const COACHING_LOGS = [
  log('Monday', 'Jaw Release', '20s', null),
  log('Wednesday', 'Jaw Release', '20s', null),
  log('Monday', 'Face Yoga', '10x', null),
  log('Wednesday', 'Face Yoga', '10x', null),
  log('Monday', 'Goblet Squat', 10, 8, 25),
  log('Wednesday', 'Goblet Squat', 10, 8, 25),
  log('Monday', 'Bench Press', 10, 10, 95),
  log('Tuesday', 'Bench Press', '30–40 sec', null),
  log('Wednesday', 'Bench Press', 10, 10, 95),
  log('Friday', 'Bench Press', 10, 10, 95),
];

describe('unmeasured sets are not missed reps', () => {
  it('does not check-load timed or null per-side work, and still flags real misses and hits', async () => {
    const sb = createMockSupabase();
    seed(sb, COACHING_LOGS);
    const overload = await buildOverloadInsights(sb, 'u1', 'g1', 4);
    const byName = Object.fromEntries(
      overload.recommendations.map((rec) => [rec.exercise_name, rec]),
    );

    expect(byName['Jaw Release']).toBeUndefined();
    expect(byName['Face Yoga']).toBeUndefined();
    expect(overload.summary).not.toContain('Jaw Release');
    expect(overload.summary).not.toContain('Face Yoga');

    expect(byName['Goblet Squat']?.type).toBe('deload');
    expect(byName['Goblet Squat']?.status_label).toBe('Check load');

    expect(byName['Bench Press']?.type).toBe('increase');
    expect(byName['Bench Press']?.status_label).toBe('Ready to level up');
  });

  it('labels an unmeasured session done (no rep count), not missed', async () => {
    const sb = createMockSupabase();
    seed(sb, [
      log('Monday', 'Jaw Release', '20s', null),
      log('Monday', 'Goblet Squat', 10, 8, 25),
    ]);
    const history = await buildTrainingInsights(sb, 'u1', 'g1', 4);
    const sessions = history.weeks[0].exercise_sessions;
    const jaw = sessions.find((session) => session.exercise_name === 'Jaw Release');
    const squat = sessions.find((session) => session.exercise_name === 'Goblet Squat');

    expect(jaw.outcome).toBe('done_unmeasured');
    expect(jaw.hit_all_reps).toBe(false);
    expect(squat.outcome).toBe('missed');
    expect(history.summary).toContain('done (no rep count)');
    expect(history.summary).not.toMatch(/Jaw Release .*missed/);
    expect(history.summary).toMatch(/Goblet Squat .*missed reps/);
  });
});
