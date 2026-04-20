import { describe, it, expect } from 'vitest';
import { createProgramsRepo } from './programs';
import { createMockSupabase } from '../../test/mockSupabase';

describe('programsRepo', () => {
  it('getAllWorkoutPrograms groups rows by week_number', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_programs', 'list', {
      data: [
        { week_number: 1, program_data: { days: ['Push'] } },
        { week_number: 2, program_data: { days: ['Pull'] } },
      ],
      error: null,
    });
    const repo = createProgramsRepo(sb);
    const programs = await repo.getAllWorkoutPrograms('g1');
    expect(programs).toEqual({ 1: { days: ['Push'] }, 2: { days: ['Pull'] } });
  });

  it('saveWorkoutProgram upserts and returns the row', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_programs', 'single', {
      data: { id: 'p1', gym_id: 'g1', week_number: 1, ai_generated: true },
      error: null,
    });
    const repo = createProgramsRepo(sb);
    const saved = await repo.saveWorkoutProgram('g1', 1, { days: [] }, 'u1', true, 'notes');
    expect(saved?.id).toBe('p1');
    expect(saved?.ai_generated).toBe(true);
  });
});
