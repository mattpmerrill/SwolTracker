import { describe, expect, it } from 'vitest';
import {
  buildMissingWorkoutSetLogs,
  calculateWeight,
  findMaxKey,
  isRepsAdjusted,
  parseRepsDraft,
  resolveLoggedReps,
} from './workout';

describe('findMaxKey', () => {
  it('prefers the incline dumbbell max over the incline bench max', () => {
    const maxes = {
      'Incline Bench Press': 185,
      'Incline Dumbbell Press': 65,
    };

    expect(findMaxKey('Incline Dumbbell Press', maxes)).toBe('Incline Dumbbell Press');
    expect(calculateWeight(75, maxes, 'Incline Dumbbell Press')).toBe(50);
  });
});

describe('buildMissingWorkoutSetLogs', () => {
  it('builds log rows for only the sets missing from local state', () => {
    const workout = {
      exercises: [
        { name: 'Goblet Squat', sets: 2, reps: '12', weight_lbs: 40 },
        { name: 'Push Up', sets: 1, reps: '10' },
      ],
    };
    const exerciseLog = {
      'u1-1-Friday-0-0': { completed: true },
    };

    const logs = buildMissingWorkoutSetLogs(workout, exerciseLog, 'u1', 1, 'Friday');

    expect(logs).toEqual([
      {
        key: 'u1-1-Friday-0-1',
        exerciseIndex: 0,
        setIndex: 1,
        exerciseName: 'Goblet Squat',
        logData: {
          actualWeight: 40,
          prescribedWeight: 40,
          actualReps: 12,
          prescribedReps: '12',
          completed: true,
        },
      },
      {
        key: 'u1-1-Friday-1-0',
        exerciseIndex: 1,
        setIndex: 0,
        exerciseName: 'Push Up',
        logData: {
          actualWeight: null,
          prescribedWeight: null,
          actualReps: 10,
          prescribedReps: '10',
          completed: true,
        },
      },
    ]);
  });

  it('returns no entries for rest days', () => {
    expect(buildMissingWorkoutSetLogs({ focus: 'Rest Day', exercises: [] }, {}, 'u1', 1, 'Sunday')).toEqual([]);
  });

  it('uses null actual reps for AMRAP or timed missing sets', () => {
    const workout = {
      exercises: [
        { name: 'Push-Ups to Failure', sets: 1, reps: 'AMRAP' },
        { name: "Farmer's Walk", sets: 1, reps: '30 sec' },
      ],
    };

    const logs = buildMissingWorkoutSetLogs(workout, {}, 'u1', 1, 'Saturday');

    expect(logs.map((entry) => entry.logData)).toEqual([
      {
        actualWeight: null,
        prescribedWeight: null,
        actualReps: null,
        prescribedReps: 'AMRAP',
        completed: true,
      },
      {
        actualWeight: null,
        prescribedWeight: null,
        actualReps: null,
        prescribedReps: '30 sec',
        completed: true,
      },
    ]);
  });
});

describe('resolveLoggedReps', () => {
  it('prefers an explicit override over the prescription', () => {
    expect(resolveLoggedReps('8', 6)).toBe(6);
    expect(resolveLoggedReps(8, 6)).toBe(6);
  });

  it('passes the prescription through when there is no override', () => {
    expect(resolveLoggedReps('8', null)).toBe('8');
    expect(resolveLoggedReps('AMRAP', null)).toBe('AMRAP');
    expect(resolveLoggedReps('8-10', undefined)).toBe('8-10');
  });
});

describe('parseRepsDraft', () => {
  it('uses the override when present', () => {
    expect(parseRepsDraft('8', 6)).toBe(6);
  });

  it('uses a numeric prescription as the draft', () => {
    expect(parseRepsDraft('8', null)).toBe(8);
    expect(parseRepsDraft(10, null)).toBe(10);
  });

  it('starts AMRAP and timed prescriptions at 0', () => {
    expect(parseRepsDraft('AMRAP', null)).toBe(0);
    expect(parseRepsDraft('30 sec', null)).toBe(0);
  });
});

describe('isRepsAdjusted', () => {
  it('is false when there is no override', () => {
    expect(isRepsAdjusted('8', null)).toBe(false);
  });

  it('is true when the override differs from a numeric prescription', () => {
    expect(isRepsAdjusted('8', 6)).toBe(true);
    expect(isRepsAdjusted('8', 8)).toBe(false);
  });

  it('is true when the user entered a number on a non-numeric prescription', () => {
    expect(isRepsAdjusted('AMRAP', 12)).toBe(true);
  });
});
