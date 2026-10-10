import { describe, expect, it } from 'vitest';
import { sessionRepsStatusLabel } from './set-outcome';

describe('sessionRepsStatusLabel', () => {
  it('does not call unmeasured work a miss when outcome is present', () => {
    expect(sessionRepsStatusLabel({ outcome: 'done_unmeasured', hit_all_reps: false })).toBe('done (no rep count)');
    expect(sessionRepsStatusLabel({ outcome: 'missed', hit_all_reps: false })).toBe('missed reps');
    expect(sessionRepsStatusLabel({ outcome: 'hit', hit_all_reps: true })).toBe('hit reps');
  });

  it('falls back to the legacy boolean when outcome is absent', () => {
    expect(sessionRepsStatusLabel({ hit_all_reps: true })).toBe('hit reps');
    expect(sessionRepsStatusLabel({ hit_all_reps: false })).toBe('missed reps');
  });
});
