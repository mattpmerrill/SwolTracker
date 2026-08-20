import { describe, it, expect } from 'vitest';
import { inviteSucceeded, programMapFromRepo } from './groupJoin';

describe('inviteSucceeded', () => {
  it('is true only when JSONB success is true', () => {
    expect(inviteSucceeded({ success: true, leader_id: 'u1' })).toBe(true);
  });

  it('is false for { success: false } (the object is truthy — that was the bug)', () => {
    expect(inviteSucceeded({ success: false, error: 'Invalid request or already processed' })).toBe(false);
    expect(Boolean({ success: false })).toBe(true);
  });

  it('is false for null, undefined, and missing payload', () => {
    expect(inviteSucceeded(null)).toBe(false);
    expect(inviteSucceeded(undefined)).toBe(false);
    expect(inviteSucceeded({ error: 'Unknown error' })).toBe(false);
  });

  it('accepts a boolean true from sibling RPCs', () => {
    expect(inviteSucceeded(true)).toBe(true);
    expect(inviteSucceeded(false)).toBe(false);
  });
});

describe('programMapFromRepo', () => {
  it('returns the week-keyed map from getAllWorkoutPrograms', () => {
    const programs = { 1: { Monday: { focus: 'Push' } }, 2: { Monday: { focus: 'Pull' } } };
    expect(programMapFromRepo(programs)).toEqual(programs);
  });

  it('returns null for an empty map', () => {
    expect(programMapFromRepo({})).toBeNull();
  });

  it('returns null for arrays (the accept path used to call .length / .find on an object)', () => {
    expect(programMapFromRepo([{ week_number: 1, program_data: {} }])).toBeNull();
    const asObject = { 1: { days: ['Push'] } };
    expect(asObject.length).toBeUndefined();
  });

  it('returns null for null/undefined', () => {
    expect(programMapFromRepo(null)).toBeNull();
    expect(programMapFromRepo(undefined)).toBeNull();
  });
});
