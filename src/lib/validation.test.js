import { describe, it, expect } from 'vitest';
import { profileUpdateSchema, searchQuerySchema, blockScoreSchema, validate } from './validation';

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

  it('rejects program_start_date: the start date is write-once and not editable from the web', () => {
    expect(validate(profileUpdateSchema, { program_start_date: '2026-03-30' }).success).toBe(false);
    expect(validate(profileUpdateSchema, { program_start_date: '2026-03-30T00:00:00.000Z' }).success).toBe(false);
    expect(validate(profileUpdateSchema, { display_name: 'Matt', program_start_date: '2026-03-30' }).success).toBe(false);
  });

  it('rejects unknown keys (strict) and out-of-range age', () => {
    expect(validate(profileUpdateSchema, { not_a_column: true }).success).toBe(false);
    expect(validate(profileUpdateSchema, { age: 12 }).success).toBe(false);
    expect(validate(profileUpdateSchema, { gender: 'nah' }).success).toBe(false);
  });
});

describe('searchQuerySchema', () => {
  it('requires 2–50 characters after trim', () => {
    expect(validate(searchQuerySchema, 'Wren').success).toBe(true);
    expect(validate(searchQuerySchema, 'a').success).toBe(false);
    expect(validate(searchQuerySchema, 'x'.repeat(51)).success).toBe(false);
  });
});

describe('blockScoreSchema', () => {
  const amrap = { block_id: 'forge', score_type: 'amrap', rounds: 5, reps: 22 };

  it('accepts a valid AMRAP, a finished For Time and a capped For Time', () => {
    expect(validate(blockScoreSchema, amrap).success).toBe(true);
    expect(validate(blockScoreSchema, { block_id: 'grind', score_type: 'for_time', time_seconds: 702 }).success).toBe(true);
    expect(validate(blockScoreSchema, { block_id: 'grind', score_type: 'for_time', capped: true, rounds: 4, reps: 3 }).success).toBe(true);
  });

  it('defaults capped to false', () => {
    expect(validate(blockScoreSchema, amrap).data.capped).toBe(false);
  });

  it('rejects an AMRAP without rounds, or with a time', () => {
    expect(validate(blockScoreSchema, { block_id: 'forge', score_type: 'amrap', reps: 5 }).success).toBe(false);
    expect(validate(blockScoreSchema, { ...amrap, time_seconds: 600 }).success).toBe(false);
  });

  it('rejects a For Time with neither a time nor a capped result', () => {
    expect(validate(blockScoreSchema, { block_id: 'grind', score_type: 'for_time' }).success).toBe(false);
    expect(validate(blockScoreSchema, { block_id: 'grind', score_type: 'for_time', capped: true }).success).toBe(false);
    expect(validate(blockScoreSchema, { block_id: 'grind', score_type: 'for_time', capped: true, time_seconds: 600, rounds: 1 }).success).toBe(false);
  });

  it('rejects negative or fractional counts and a bad block id', () => {
    expect(validate(blockScoreSchema, { ...amrap, rounds: -1 }).success).toBe(false);
    expect(validate(blockScoreSchema, { ...amrap, reps: 2.5 }).success).toBe(false);
    expect(validate(blockScoreSchema, { ...amrap, block_id: 'Forge AMRAP' }).success).toBe(false);
  });

  it('caps the note at 280 characters', () => {
    expect(validate(blockScoreSchema, { ...amrap, note: 'x'.repeat(280) }).success).toBe(true);
    expect(validate(blockScoreSchema, { ...amrap, note: 'x'.repeat(281) }).success).toBe(false);
  });

  it('explains the fix in plain words', () => {
    expect(validate(blockScoreSchema, { block_id: 'forge', score_type: 'amrap' }).error).toBe('Enter the rounds you completed.');
  });
});
