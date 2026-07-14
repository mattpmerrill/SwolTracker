import { describe, it, expect } from 'vitest';
import {
  BOOTSTRAP_LOG_LOOKBACK_WEEKS,
  exerciseLogFromRows,
  getBootstrapLogFromWeek,
} from './bootstrapLogs';

describe('bootstrapLogs', () => {
  it('getBootstrapLogFromWeek windows the last N weeks inclusive', () => {
    expect(getBootstrapLogFromWeek(20, 8)).toBe(13);
    expect(getBootstrapLogFromWeek(5, 8)).toBe(1);
    expect(getBootstrapLogFromWeek(1, 8)).toBe(1);
    expect(getBootstrapLogFromWeek(8, BOOTSTRAP_LOG_LOOKBACK_WEEKS)).toBe(1);
  });

  it('getBootstrapLogFromWeek clamps invalid current week', () => {
    expect(getBootstrapLogFromWeek(0, 4)).toBe(1);
    expect(getBootstrapLogFromWeek(NaN, 4)).toBe(1);
  });

  it('exerciseLogFromRows maps set rows into client keys', () => {
    const map = exerciseLogFromRows([
      {
        user_id: 'u1',
        week_number: 3,
        day_name: 'Monday',
        exercise_index: 0,
        set_index: 1,
        completed: true,
        actual_weight: 185,
        actual_reps: 5,
      },
    ]);
    expect(map['u1-3-Monday-0-1']).toEqual({
      completed: true,
      actualWeight: 185,
      actualReps: 5,
    });
  });

  it('exerciseLogFromRows handles empty/invalid input', () => {
    expect(exerciseLogFromRows(null)).toEqual({});
    expect(exerciseLogFromRows([])).toEqual({});
  });
});
