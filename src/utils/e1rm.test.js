import { describe, it, expect } from 'vitest';
import { epelyE1RM, roundToNearestFive, resolveCurrentMax } from './e1rm';

describe('epelyE1RM', () => {
  it('estimates a standard strength set', () => {
    expect(epelyE1RM(225, 5)).toBeCloseTo(262.5, 1);
  });

  it('estimates a heavy single', () => {
    expect(epelyE1RM(225, 1)).toBeCloseTo(232.5, 1);
  });

  it('parses a numeric string rep count', () => {
    expect(epelyE1RM(225, '5')).toBeCloseTo(262.5, 1);
  });

  it('returns null for zero/null load', () => {
    expect(epelyE1RM(0, 5)).toBeNull();
    expect(epelyE1RM(null, 5)).toBeNull();
    expect(epelyE1RM(undefined, 5)).toBeNull();
  });

  it('returns null for zero reps', () => {
    expect(epelyE1RM(225, 0)).toBeNull();
  });

  it('returns null above 10 reps', () => {
    expect(epelyE1RM(225, 11)).toBeNull();
    expect(epelyE1RM(225, 15)).toBeNull();
  });

  it('returns null for ranges, AMRAP, and failure text', () => {
    expect(epelyE1RM(225, '8-10')).toBeNull();
    expect(epelyE1RM(225, 'AMRAP')).toBeNull();
    expect(epelyE1RM(225, 'to failure')).toBeNull();
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
