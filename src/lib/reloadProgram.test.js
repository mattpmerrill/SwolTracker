import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({ getAllWorkoutPrograms: vi.fn() }));
vi.mock('./supabase', () => ({ db: { getAllWorkoutPrograms: mocks.getAllWorkoutPrograms } }));

import { reloadProgram } from './reloadProgram';

beforeEach(() => {
  mocks.getAllWorkoutPrograms.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('reloadProgram', () => {
  it('hands the weeks to the app and returns true', async () => {
    const setWorkoutProgram = vi.fn();
    mocks.getAllWorkoutPrograms.mockResolvedValue({ 1: {}, 2: {} });
    expect(await reloadProgram({ programGymId: 'g1', setWorkoutProgram })).toBe(true);
    expect(mocks.getAllWorkoutPrograms).toHaveBeenCalledWith('g1');
    expect(setWorkoutProgram).toHaveBeenCalledWith({ 1: {}, 2: {} });
  });

  it('never replaces the program with an empty map', async () => {
    const setWorkoutProgram = vi.fn();
    mocks.getAllWorkoutPrograms.mockResolvedValue({});
    expect(await reloadProgram({ programGymId: 'g1', setWorkoutProgram })).toBe(false);
    mocks.getAllWorkoutPrograms.mockResolvedValue(null);
    expect(await reloadProgram({ programGymId: 'g1', setWorkoutProgram })).toBe(false);
    expect(setWorkoutProgram).not.toHaveBeenCalled();
  });

  it('returns false when the read throws', async () => {
    mocks.getAllWorkoutPrograms.mockRejectedValue(new Error('boom'));
    expect(await reloadProgram({ programGymId: 'g1', setWorkoutProgram: vi.fn() })).toBe(false);
  });
});
