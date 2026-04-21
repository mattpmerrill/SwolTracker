import { describe, it, expect } from 'vitest';
import {
  REQUIRED_FIELDS,
  computeMissingFields,
  canComplete,
  isOnboardingDone,
} from './status';

const fullProfile = {
  display_name: 'Matt',
  gender: 'male',
  age: 35,
  weight_lbs: 180,
  fitness_goals: ['strength'],
  workout_days: ['Monday', 'Wednesday', 'Friday'],
  workout_duration: '1 hour',
  workout_location: 'home',
  program_start_date: '2026-04-21',
  onboarding_completed: false,
};

describe('AgentOnboarding status helpers', () => {
  it('reports every required field missing when profile is null', () => {
    expect(computeMissingFields(null)).toEqual(REQUIRED_FIELDS);
  });

  it('returns empty missing list for a fully populated profile', () => {
    expect(computeMissingFields(fullProfile)).toEqual([]);
  });

  it('flags empty arrays and null scalars as missing', () => {
    const partial = { ...fullProfile, gender: null, fitness_goals: [], age: undefined };
    expect(computeMissingFields(partial).sort()).toEqual(['age', 'fitness_goals', 'gender']);
  });

  it('canComplete requires both profile completeness and equipment', () => {
    expect(canComplete(fullProfile, ['Barbell'])).toBe(true);
    expect(canComplete(fullProfile, [])).toBe(false);
    expect(canComplete({ ...fullProfile, gender: null }, ['Barbell'])).toBe(false);
    expect(canComplete(null, ['Barbell'])).toBe(false);
  });

  it('isOnboardingDone mirrors profile.onboarding_completed', () => {
    expect(isOnboardingDone({ ...fullProfile, onboarding_completed: true })).toBe(true);
    expect(isOnboardingDone(fullProfile)).toBe(false);
    expect(isOnboardingDone(null)).toBe(false);
  });
});
