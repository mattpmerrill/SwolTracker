import { describe, it, expect } from 'vitest';
import { createInsightsRepo } from './insights';
import { createMockSupabase } from '../../test/mockSupabase';

describe('insightsRepo', () => {
  it('getTrainingHistorySummary returns default shape when no user/gym', async () => {
    const sb = createMockSupabase();
    const repo = createInsightsRepo(sb);
    const history = await repo.getTrainingHistorySummary(null, null, 4);
    expect(history.summary).toBe('No training history available.');
    expect(history.weeks).toEqual([]);
    expect(history.maxes).toEqual({});
    expect(history.lookback_weeks).toBe(4);
  });

  it('getOverloadRecommendations returns default shape when no user/gym', async () => {
    const sb = createMockSupabase();
    const repo = createInsightsRepo(sb);
    const overload = await repo.getOverloadRecommendations(null, null, 4);
    expect(overload.recommendations).toEqual([]);
    expect(overload.byExercise).toEqual({});
    expect(overload.summary).toBe('No overload recommendations right now.');
  });
});
