import { describe, it, expect } from 'vitest';
import { epleyE1RM, roundToNearestFive, isEstimatedPr, PR_MIN_MARGIN, resolveCurrentMax, resolveMaxKey, buildStrengthTrends } from './e1rm';

describe('epleyE1RM', () => {
  it('estimates a standard strength set', () => {
    expect(epleyE1RM(225, 5)).toBeCloseTo(262.5, 1);
  });

  it('estimates a heavy single', () => {
    expect(epleyE1RM(225, 1)).toBeCloseTo(232.5, 1);
  });

  it('parses a numeric string rep count', () => {
    expect(epleyE1RM(225, '5')).toBeCloseTo(262.5, 1);
  });

  it('returns null for zero/null load', () => {
    expect(epleyE1RM(0, 5)).toBeNull();
    expect(epleyE1RM(null, 5)).toBeNull();
    expect(epleyE1RM(undefined, 5)).toBeNull();
  });

  it('returns null for zero reps', () => {
    expect(epleyE1RM(225, 0)).toBeNull();
  });

  it('returns null above 10 reps', () => {
    expect(epleyE1RM(225, 11)).toBeNull();
    expect(epleyE1RM(225, 15)).toBeNull();
  });

  it('returns null for ranges, AMRAP, and failure text', () => {
    expect(epleyE1RM(225, '8-10')).toBeNull();
    expect(epleyE1RM(225, 'AMRAP')).toBeNull();
    expect(epleyE1RM(225, 'to failure')).toBeNull();
  });
});

describe('roundToNearestFive', () => {
  it('rounds half up to the next five', () => {
    expect(roundToNearestFive(262.5)).toBe(265);
  });

  it('rounds to the nearest five', () => {
    expect(roundToNearestFive(263)).toBe(265);
    expect(roundToNearestFive(262)).toBe(260);
    expect(roundToNearestFive(260)).toBe(260);
  });
});

describe('isEstimatedPr', () => {
  // The reported bug: routine prescribed work (8 reps @ 85% → ~1.077×) looked like
  // a new max every set, which raised the recorded max, which re-prescribed heavier
  // weights, which produced another "PR" — an endless loop. The margin + ceiling
  // guard must reject that noise.
  it('rejects routine submaximal work (8 reps @ 85% of max)', () => {
    const est = epleyE1RM(55, 8); // 69.67 vs a 65 max → ~7.7% over
    expect(est).toBeCloseTo(69.67, 1);
    expect(isEstimatedPr(est, 65)).toBe(false);
  });

  it('rejects an estimate below the margin', () => {
    // 65 max; estimate 71 is only ~9% over — still noise, not a PR.
    expect(isEstimatedPr(71, 65)).toBe(false);
  });

  it('accepts a meaningful PR (clears the margin)', () => {
    // 3 reps at your old 1RM → ~10% over → a real PR.
    expect(isEstimatedPr(epleyE1RM(65, 3), 65)).toBe(true);
  });

  it('does not re-fire against a raised ceiling', () => {
    const est = epleyE1RM(55, 8); // 69.67 → rounds 70
    // First fire: ceiling 65, est 69.67 < 71.5 margin → false (noise anyway).
    expect(isEstimatedPr(est, 65, 0)).toBe(false);
    // Even a genuine PR is suppressed once the ceiling is at/above it.
    expect(isEstimatedPr(epleyE1RM(65, 3), 65, 75)).toBe(false);
  });

  it('returns false without a recorded max or estimate', () => {
    expect(isEstimatedPr(null, 65)).toBe(false);
    expect(isEstimatedPr(epleyE1RM(100, 5), 0)).toBe(false);
    expect(isEstimatedPr(epleyE1RM(100, 5), null)).toBe(false);
  });

  it('exposes a 1.10 margin constant', () => {
    expect(PR_MIN_MARGIN).toBeCloseTo(1.1, 5);
  });
});

describe('resolveCurrentMax', () => {
  it('returns the exact max for a canonical name', () => {
    expect(resolveCurrentMax('Barbell Bench Press', { 'Barbell Bench Press': 240 })).toBe(240);
  });

  it('fuzzy-matches a shorthand name', () => {
    expect(resolveCurrentMax('bench press', { 'Barbell Bench Press': 240 })).toBe(240);
  });

  it('returns null when a mapping has no recorded max', () => {
    expect(resolveCurrentMax('Power Clean', { 'Push Press': 150 })).toBeNull();
  });

  it('returns null when there is no max at all', () => {
    expect(resolveCurrentMax('Plank', {})).toBeNull();
  });
});

describe('resolveMaxKey', () => {
  it('returns the stored key, not the program name', () => {
    expect(resolveMaxKey('bench press', { 'Barbell Bench Press': 240 })).toBe('Barbell Bench Press');
  });

  it('returns null when nothing is recorded', () => {
    expect(resolveMaxKey('Plank', {})).toBeNull();
    expect(resolveMaxKey(null, { 'Barbell Bench Press': 240 })).toBeNull();
  });
});

describe('buildStrengthTrends', () => {
  const U = '1b2c3d4e-aaaa-bbbb-cccc-000000000001';
  const other = '9f9f9f9f-aaaa-bbbb-cccc-000000000002';
  const maxes = { 'Barbell Bench Press': 240, 'Barbell Back Squat': 260 };
  const set = (week, idx, name, w, r, completed = true) => [
    `${U}-${week}-Monday-${idx}-0`,
    { completed, exerciseName: name, actualWeight: w, actualReps: r },
  ];

  it('builds best e1RM per week per lift and the change across the window', () => {
    const log = Object.fromEntries([
      set(3, 0, 'Bench Press', 200, 5),          // 233.3 -> 235
      ['' + U + '-3-Monday-0-1', { completed: true, exerciseName: 'Bench Press', actualWeight: 205, actualReps: 5 }], // 239 -> 240 (best wk3)
      set(5, 0, 'Barbell Bench Press', 215, 5),  // 250.8 -> 250
    ]);
    const [bench] = buildStrengthTrends(log, U, maxes);
    expect(bench.lift).toBe('Barbell Bench Press');
    expect(bench.points).toEqual([{ week: 3, e1rm: 240 }, { week: 5, e1rm: 250 }]);
    expect(bench.change).toBe(10);
  });

  it('ignores other users, unlogged, unloaded, unmatched, and single-week lifts', () => {
    const log = Object.fromEntries([
      [`${other}-3-Monday-0-0`, { completed: true, exerciseName: 'Bench Press', actualWeight: 300, actualReps: 5 }],
      set(3, 1, 'Bench Press', 300, 5, false),
      set(3, 2, 'Pull-ups', null, 10),
      set(4, 2, 'Pull-ups', null, 10),
      set(3, 3, 'Plank', 45, 1),
      set(4, 3, 'Plank', 45, 1),
      set(3, 4, 'Back Squat', 225, 5),
    ]);
    expect(buildStrengthTrends(log, U, maxes)).toEqual([]);
  });

  it('returns nothing without maxes', () => {
    expect(buildStrengthTrends({}, U, {})).toEqual([]);
  });
});
