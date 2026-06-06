import { describe, expect, it } from 'vitest';
import { buildMissingWorkoutSetLogs } from './workout';

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
