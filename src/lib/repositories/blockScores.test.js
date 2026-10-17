import { describe, it, expect } from 'vitest';
import { createBlockScoresRepo } from './blockScores';
import { createMockSupabase } from '../../test/mockSupabase';

const callsFor = (sb, name) => sb.calls.filter(([table, method]) => table === 'workout_block_scores' && method === name);

describe('blockScoresRepo', () => {
  it('getBlockScoresForWeek is scoped by user, gym and week', async () => {
    const sb = createMockSupabase();
    const rows = [{ day_name: 'Saturday', block_id: 'forge', rounds: 5 }];
    sb.respond('workout_block_scores', 'list', { data: rows, error: null });
    const repo = createBlockScoresRepo(sb);

    expect(await repo.getBlockScoresForWeek('u1', 'g1', 38)).toEqual(rows);
    expect(callsFor(sb, 'eq').map(([, , args]) => args)).toEqual([
      ['user_id', 'u1'],
      ['gym_id', 'g1'],
      ['week_number', 38],
    ]);
  });

  it('returns null on a read error so the caller can tell it from an empty week', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_block_scores', 'list', { data: null, error: { message: 'boom' } });
    const repo = createBlockScoresRepo(sb);
    expect(await repo.getBlockScoresForWeek('u1', 'g1', 38)).toBeNull();
    expect(await repo.getBenchmarkScores('u1', ['forge'], 38)).toBeNull();

    sb.respond('workout_block_scores', 'list', { data: [], error: null });
    expect(await repo.getBlockScoresForWeek('u1', 'g1', 38)).toEqual([]);
  });

  it('getBenchmarkScores filters by user, benchmarks and earlier weeks only', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_block_scores', 'list', { data: [{ week_number: 37 }], error: null });
    const repo = createBlockScoresRepo(sb);

    expect(await repo.getBenchmarkScores('u1', ['forge'], 38)).toEqual([{ week_number: 37 }]);
    expect(callsFor(sb, 'eq').map(([, , args]) => args)).toEqual([['user_id', 'u1']]);
    expect(callsFor(sb, 'in')[0][2]).toEqual(['benchmark', ['forge']]);
    expect(callsFor(sb, 'lte')[0][2]).toEqual(['week_number', 37]);
  });

  it('getBenchmarkScores skips the query when there is nothing to compare', async () => {
    const sb = createMockSupabase();
    const repo = createBlockScoresRepo(sb);
    expect(await repo.getBenchmarkScores('u1', [], 38)).toEqual([]);
    expect(await repo.getBenchmarkScores('u1', ['forge'], 1)).toEqual([]);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('upsertBlockScore upserts on the unique key with the signed-in user id', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_block_scores', 'single', { data: { id: 's1', rounds: 5 }, error: null });
    const repo = createBlockScoresRepo(sb);

    const row = await repo.upsertBlockScore('u1', 'g1', 38, 'Saturday', {
      block_id: 'forge', benchmark: 'forge', score_type: 'amrap', rounds: 5, reps: 22, capped: false,
    });
    expect(row).toEqual({ id: 's1', rounds: 5 });

    const [payload, options] = callsFor(sb, 'upsert')[0][2];
    expect(options).toEqual({ onConflict: 'user_id,gym_id,week_number,day_name,block_id' });
    expect(payload).toMatchObject({
      user_id: 'u1', gym_id: 'g1', week_number: 38, day_name: 'Saturday', block_id: 'forge',
      benchmark: 'forge', score_type: 'amrap', rounds: 5, reps: 22, time_seconds: null, capped: false, note: null,
    });
  });

  it('upsertBlockScore returns null on error and without a user or gym', async () => {
    const sb = createMockSupabase();
    sb.respond('workout_block_scores', 'single', { data: null, error: { message: 'rls' } });
    const repo = createBlockScoresRepo(sb);
    const score = { block_id: 'forge', score_type: 'amrap', rounds: 1 };
    expect(await repo.upsertBlockScore('u1', 'g1', 38, 'Saturday', score)).toBeNull();
    expect(await repo.upsertBlockScore(null, 'g1', 38, 'Saturday', score)).toBeNull();
    expect(await repo.upsertBlockScore('u1', null, 38, 'Saturday', score)).toBeNull();
  });
});
