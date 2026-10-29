import { describe, it, expect } from 'vitest';
import { summarizeExercises, diffDayExercises } from './chadProposal';

describe('summarizeExercises', () => {
  it('formats sets x reps', () => {
    expect(summarizeExercises({ exercises: [{ name: 'Bench Press', sets: 4, reps: '8' }] }))
      .toEqual([{ name: 'Bench Press', detail: '4 × 8' }]);
  });

  it('collapses a flat percentage to one number', () => {
    const day = { exercises: [{ name: 'Squat', sets: 3, reps: '10', percentages: [70, 70, 70] }] };
    expect(summarizeExercises(day)[0].detail).toBe('3 × 10 @ 70%');
  });

  it('keeps every step of a percentage ramp', () => {
    const day = { exercises: [{ name: 'Squat', sets: 3, reps: '5', percentages: [70, 75, 80] }] };
    expect(summarizeExercises(day)[0].detail).toBe('3 × 5 @ 70/75/80%');
  });

  it('handles string rep ranges and ignores empty or null percentages', () => {
    const day = { exercises: [
      { name: 'Curl', sets: 3, reps: '8-12', percentages: [] },
      { name: 'Row', sets: 3, reps: '10', percentages: null },
    ] };
    expect(summarizeExercises(day).map((r) => r.detail)).toEqual(['3 × 8-12', '3 × 10']);
  });

  it('degrades when sets or reps are missing', () => {
    const day = { exercises: [{ name: 'Plank', sets: 3 }, { name: 'Run', reps: '20 min' }, { name: 'Stretch' }] };
    expect(summarizeExercises(day)).toEqual([
      { name: 'Plank', detail: '3 sets' },
      { name: 'Run', detail: '20 min' },
      { name: 'Stretch', detail: '' },
    ]);
  });

  it('treats an empty reps string as missing', () => {
    expect(summarizeExercises({ exercises: [{ name: 'Plank', sets: 3, reps: '' }, { name: 'Walk', reps: '' }] }))
      .toEqual([{ name: 'Plank', detail: '3 sets' }, { name: 'Walk', detail: '' }]);
  });

  it('returns an empty list for null, undefined or empty days', () => {
    expect(summarizeExercises(null)).toEqual([]);
    expect(summarizeExercises(undefined)).toEqual([]);
    expect(summarizeExercises({})).toEqual([]);
    expect(summarizeExercises({ exercises: [] })).toEqual([]);
    expect(summarizeExercises({ exercises: 'nope' })).toEqual([]);
  });

  it('skips entries without a usable name', () => {
    expect(summarizeExercises({ exercises: [null, { sets: 3, reps: '5' }, { name: '  ' }] })).toEqual([]);
  });
});

describe('diffDayExercises', () => {
  const before = { exercises: [
    { name: 'Bench Press', sets: 4, reps: '8' },
    { name: 'Overhead Press', sets: 3, reps: '10' },
  ] };
  const after = { exercises: [
    { name: 'Dumbbell Bench Press', sets: 4, reps: '8' },
    { name: 'overhead press', sets: 3, reps: '10' },
  ] };

  it('marks removed, added and same by name, ignoring case', () => {
    const diff = diffDayExercises(before, after);
    expect(diff.before.map((r) => r.status)).toEqual(['removed', 'same']);
    expect(diff.after.map((r) => r.status)).toEqual(['added', 'same']);
  });

  it('keeps duplicate names as separate rows and marks each by name', () => {
    const dup = { exercises: [
      { name: 'Curl', sets: 3, reps: '10' },
      { name: 'Curl', sets: 2, reps: '15' },
    ] };
    const diff = diffDayExercises(dup, { exercises: [{ name: 'Curl', sets: 3, reps: '10' }] });
    expect(diff.before.map((r) => r.status)).toEqual(['same', 'same']);
    expect(diff.after).toHaveLength(1);
    expect(diff.after[0].status).toBe('same');
  });

  it('treats a null before as all added', () => {
    const diff = diffDayExercises(null, after);
    expect(diff.before).toEqual([]);
    expect(diff.after.every((r) => r.status === 'added')).toBe(true);
  });
});
