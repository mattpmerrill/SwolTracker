import { describe, it, expect } from 'vitest';
import { createMaxesRepo } from './maxes';
import { createMockSupabase } from '../../test/mockSupabase';

describe('maxesRepo', () => {
  it('getUserMaxes returns a lift→weight map', async () => {
    const sb = createMockSupabase();
    sb.respond('current_user_maxes', 'list', {
      data: [
        { exercise_name: 'Bench Press', weight_lbs: 225 },
        { exercise_name: 'Squat', weight_lbs: 315 },
      ],
      error: null,
    });
    const repo = createMaxesRepo(sb);
    const maxes = await repo.getUserMaxes('u1');
    expect(maxes).toEqual({ 'Bench Press': 225, Squat: 315 });
  });

  it('updateMax inserts and returns the new row', async () => {
    const sb = createMockSupabase();
    sb.respond('user_maxes', 'single', {
      data: { id: 'm1', user_id: 'u1', exercise_name: 'Deadlift', weight_lbs: 405 },
      error: null,
    });
    const repo = createMaxesRepo(sb);
    const result = await repo.updateMax('u1', 'Deadlift', 405);
    expect(result?.weight_lbs).toBe(405);
  });
});
