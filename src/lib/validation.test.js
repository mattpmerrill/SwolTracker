import { describe, it, expect } from 'vitest';
import { profileUpdateSchema, validate } from './validation';

describe('validate()', () => {
  it('returns data on success', () => {
    const result = validate(profileUpdateSchema, { display_name: 'Matt' });
    expect(result.success).toBe(true);
    expect(result.data.display_name).toBe('Matt');
  });

  it('joins Zod issue messages on failure (Zod 4 uses .issues)', () => {
    const result = validate(profileUpdateSchema, { age: 5 });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe('string');
  });
});

describe('profileUpdateSchema', () => {
  it('accepts ProfileArea fitness payloads that used to fail .strict()', () => {
    const payloads = [
      { display_name: 'Matt Merrill' },
      { age: 35 },
      { weight_lbs: 180 },
      { gender: 'male' },
      { fitness_goals: ['strength', 'fat_burn'] },
      { fitness_goals: [] },
      { workout_days: ['Monday', 'Wednesday'] },
      { workout_duration: '1 hour' },
      { workout_location: 'gym' },
      { group_name: 'Swol Patrol' },
      { avatar: '💪', avatar_url: null },
    ];
    for (const payload of payloads) {
      const result = validate(profileUpdateSchema, payload);
      expect(result.success).toBe(true);
    }
  });

  it('accepts YYYY-MM-DD program start dates from the date input', () => {
    const result = validate(profileUpdateSchema, { program_start_date: '2026-03-30' });
    expect(result.success).toBe(true);
  });

  it('accepts ISO datetimes for program_start_date', () => {
    const result = validate(profileUpdateSchema, { program_start_date: '2026-03-30T00:00:00.000Z' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys (strict) and out-of-range age', () => {
    expect(validate(profileUpdateSchema, { not_a_column: true }).success).toBe(false);
    expect(validate(profileUpdateSchema, { age: 12 }).success).toBe(false);
    expect(validate(profileUpdateSchema, { gender: 'nah' }).success).toBe(false);
  });
});
