import { describe, expect, it } from 'vitest';
import {
  bodyweightRowHint,
  isAmrapPrescription,
  isBodyweightLoad,
  isBodyweightSession,
  overloadDeloadMessage,
  overloadIncreaseMessage,
} from './bodyweight';

describe('isBodyweightLoad', () => {
  it('is true when there is no load and no percent', () => {
    expect(isBodyweightLoad({})).toBe(true);
    expect(isBodyweightLoad({ prescribedWeight: null, percentage: undefined, weightOverride: null })).toBe(true);
  });

  it('is false once a load or percent exists', () => {
    expect(isBodyweightLoad({ prescribedWeight: 135 })).toBe(false);
    expect(isBodyweightLoad({ weightOverride: 20 })).toBe(false);
    expect(isBodyweightLoad({ percentage: 70 })).toBe(false);
  });
});

describe('isAmrapPrescription', () => {
  it('detects AMRAP and failure cues', () => {
    expect(isAmrapPrescription('15/rd AMRAP')).toBe(true);
    expect(isAmrapPrescription('AMRAP')).toBe(true);
    expect(isAmrapPrescription('to failure')).toBe(true);
    expect(isAmrapPrescription(12)).toBe(false);
    expect(isAmrapPrescription('10')).toBe(false);
  });
});

describe('isBodyweightSession', () => {
  it('treats missing or zero load as bodyweight', () => {
    expect(isBodyweightSession(null)).toBe(true);
    expect(isBodyweightSession({ avg_actual_weight: 0, avg_prescribed_weight: 0 })).toBe(true);
    expect(isBodyweightSession({ avg_actual_weight: 185, avg_prescribed_weight: 185 })).toBe(false);
  });
});

describe('bodyweightRowHint', () => {
  it('hides copy after the set is logged so the checkmark can breathe', () => {
    expect(bodyweightRowHint({ reps: '15/rd AMRAP', isLogged: true, lastAvgReps: 18 })).toBe('');
  });

  it('prefers last session as the number to beat', () => {
    expect(bodyweightRowHint({ reps: '15/rd AMRAP', lastAvgReps: 18.4 })).toBe('Last 18');
  });

  it('uses max-effort copy for AMRAP when there is no last session', () => {
    expect(bodyweightRowHint({ reps: '10/rd AMRAP' })).toBe('Max effort');
  });

  it('uses rest for straight bodyweight sets', () => {
    expect(bodyweightRowHint({ reps: '12' })).toBe('60s rest');
    expect(bodyweightRowHint({ reps: '5' })).toBe('150s rest');
  });
});

describe('overload copy', () => {
  it('progresses bodyweight by reps, not pounds', () => {
    expect(overloadIncreaseMessage({
      exerciseName: 'Push-Ups',
      consecutiveHits: 4,
      isBodyweight: true,
    })).toBe('Push-Ups hit prescribed reps for 4 straight sessions. Add 2 reps next time.');

    expect(overloadIncreaseMessage({
      exerciseName: 'Back Squat',
      consecutiveHits: 4,
      isBodyweight: false,
    })).toBe('Back Squat hit prescribed reps for 4 straight sessions. Add 5 lbs next time.');
  });

  it('deloads bodyweight by scaling, not bar weight', () => {
    expect(overloadDeloadMessage({
      exerciseName: 'Reverse Lunges',
      consecutiveMisses: 2,
      isBodyweight: true,
    })).toMatch(/fewer reps or an easier variation/);
  });
});
